import express, { type NextFunction, type Request, type Response } from 'express'
import cors from 'cors'
import helmet from 'helmet'
import morgan from 'morgan'
import bcrypt from 'bcryptjs'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import multer from 'multer'
import { GameStatus, Role } from '@prisma/client'
import { ZodError } from 'zod'
import { requireAdmin, requireAuth, signToken } from './auth'
import { config } from './config'
import { parseCustomerFestWorkbook, type CustomerFestRow } from './excelImport'
import { getGame, isGameClosed, requireGameOpen, serializeGame } from './game'
import { assertMailConfigured, sendWelcomeEmail } from './mailer'
import { prisma } from './prisma'
import type { AuthRequest } from './types'
import {
	factSchema,
	factUpdateSchema,
	gameUpdateSchema,
	guessSchema,
	guessUpdateSchema,
	loginSchema,
	passwordChangeSchema,
	userSchema,
	userUpdateSchema,
} from './validation'
import { asyncHandler, csvEscape, fromRole, parseId, toGameStatus, toRole } from './utils'

const app = express()
const clientDistPath = path.resolve(process.cwd(), '../client/dist')
const upload = multer({
	storage: multer.memoryStorage(),
	limits: { fileSize: 8 * 1024 * 1024 },
	fileFilter: (_req, file, callback) => {
		if (/\.(xlsx|xlsm)$/i.test(file.originalname)) {
			callback(null, true)
			return
		}

		callback(Object.assign(new Error('Envie um ficheiro Excel .xlsx ou .xlsm.'), { statusCode: 400 }))
	},
})

app.use(helmet())
app.use(cors({ origin: config.corsOrigin }))
app.use(express.json())
app.use(morgan('dev'))

function serializeUser(user: {
	id: number
	name: string
	email: string
	role: Role
	active: boolean
	passwordResetRequired: boolean
	createdAt?: Date
	updatedAt?: Date
}) {
	return {
		...user,
		role: fromRole(user.role),
	}
}

function publicUser(user: { id: number; name: string }) {
	return {
		id: user.id,
		name: user.name,
	}
}

function nameFromEmail(email: string) {
	const name = email
		.split('@')[0]
		.split(/[._-]+/)
		.filter(Boolean)
		.map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1).toLowerCase()}`)
		.join(' ')

	return name || email
}

function generateInitialPassword() {
	return crypto.randomBytes(9).toString('base64url')
}

async function closeGameIfDeadlinePassed() {
	const game = await getGame()

	if (game.status === GameStatus.OPEN && game.closesAt && game.closesAt <= new Date()) {
		return prisma.game.update({
			where: { id: game.id },
			data: { status: GameStatus.CLOSED },
		})
	}

	return game
}

async function ensureClosedGame() {
	const game = await closeGameIfDeadlinePassed()

	if (!isGameClosed(game)) {
		throw Object.assign(new Error('Resultados disponíveis apenas após o jogo finalizar.'), {
			statusCode: 403,
		})
	}

	return game
}

async function buildRanking() {
	const players = await prisma.user.findMany({
		where: { role: Role.PLAYER, active: true },
		orderBy: { name: 'asc' },
		include: {
			guesses: {
				where: { fact: { active: true } },
				include: { fact: true },
			},
		},
	})

	const rows = players
		.map((player) => {
			const correctAnswers = player.guesses.filter(
				(guess) => guess.selectedPersonId === guess.fact.correctPersonId,
			).length

			return {
				position: 0,
				playerId: player.id,
				playerName: player.name,
				correctAnswers,
				submittedAnswers: player.guesses.length,
				score: correctAnswers * 10,
			}
		})
		.sort((left, right) => {
			if (right.score !== left.score) return right.score - left.score
			if (right.correctAnswers !== left.correctAnswers) return right.correctAnswers - left.correctAnswers
			return left.playerName.localeCompare(right.playerName, 'pt')
		})

	let previousScore: number | undefined
	let previousPosition = 0

	return rows.map((row, index) => {
		const position = row.score === previousScore ? previousPosition : index + 1
		previousScore = row.score
		previousPosition = position

		return { ...row, position }
	})
}

async function importCustomerFestRows(rows: CustomerFestRow[]) {
	const welcomeEmails: Array<{ email: string; name: string; password: string }> = []
	const summary = {
		rowsRead: rows.length,
		usersCreated: 0,
		usersExisting: 0,
		usersReactivated: 0,
		factsCreated: 0,
		factsReactivated: 0,
		factsSkipped: 0,
		emailsSent: 0,
		emailsFailed: 0,
		emailFailures: [] as Array<{ email: string; message: string }>,
	}

	for (const row of rows) {
		let user = await prisma.user.findUnique({ where: { email: row.email } })

		if (!user) {
			const password = generateInitialPassword()
			const passwordHash = await bcrypt.hash(password, 12)
			const name = nameFromEmail(row.email)

			user = await prisma.user.create({
				data: {
					name,
					email: row.email,
					passwordHash,
					passwordResetRequired: true,
					role: Role.PLAYER,
					active: true,
				},
			})
			summary.usersCreated += 1
			welcomeEmails.push({ email: user.email, name: user.name, password })
		} else if (!user.active) {
			user = await prisma.user.update({ where: { id: user.id }, data: { active: true } })
			summary.usersReactivated += 1
		} else {
			summary.usersExisting += 1
		}

		const existingFact = await prisma.fact.findFirst({
			where: { correctPersonId: user.id, text: row.factText },
		})

		if (!existingFact) {
			await prisma.fact.create({ data: { text: row.factText, correctPersonId: user.id, active: true } })
			summary.factsCreated += 1
		} else if (!existingFact.active) {
			await prisma.fact.update({ where: { id: existingFact.id }, data: { active: true } })
			summary.factsReactivated += 1
		} else {
			summary.factsSkipped += 1
		}
	}

	for (const welcomeEmail of welcomeEmails) {
		try {
			await sendWelcomeEmail({
				to: welcomeEmail.email,
				name: welcomeEmail.name,
				password: welcomeEmail.password,
			})
			summary.emailsSent += 1
		} catch (error) {
			summary.emailsFailed += 1
			summary.emailFailures.push({
				email: welcomeEmail.email,
				message: error instanceof Error ? error.message : 'Erro ao enviar e-mail.',
			})
		}
	}

	return summary
}

app.get('/api/health', (_req, res) => {
	res.json({ ok: true, service: 'bingo-humano-api' })
})

app.post(
	'/api/auth/login',
	asyncHandler(async (req, res) => {
		const input = loginSchema.parse(req.body)
		const user = await prisma.user.findUnique({ where: { email: input.email } })

		if (!user || !user.active) {
			return res.status(401).json({ message: 'E-mail ou password inválidos.' })
		}

		const validPassword = await bcrypt.compare(input.password, user.passwordHash)

		if (!validPassword) {
			return res.status(401).json({ message: 'E-mail ou password inválidos.' })
		}

		const apiUser = serializeUser(user)
		const token = signToken({
			id: user.id,
			name: user.name,
			email: user.email,
			role: user.role,
			passwordResetRequired: user.passwordResetRequired,
		})

		return res.json({ token, user: apiUser })
	}),
)

app.post(
	'/api/auth/change-password',
	requireAuth,
	asyncHandler(async (req: AuthRequest, res) => {
		const input = passwordChangeSchema.parse(req.body)
		const user = await prisma.user.findUnique({ where: { id: req.user!.id } })

		if (!user || !user.active) {
			return res.status(401).json({ message: 'Utilizador inativo.' })
		}

		const validPassword = await bcrypt.compare(input.currentPassword, user.passwordHash)

		if (!validPassword) {
			return res.status(401).json({ message: 'Password atual inválida.' })
		}

		const samePassword = await bcrypt.compare(input.newPassword, user.passwordHash)

		if (samePassword) {
			return res.status(400).json({ message: 'A nova password deve ser diferente da password atual.' })
		}

		const passwordHash = await bcrypt.hash(input.newPassword, 12)
		const updatedUser = await prisma.user.update({
			where: { id: user.id },
			data: { passwordHash, passwordResetRequired: false },
		})
		const token = signToken({
			id: updatedUser.id,
			name: updatedUser.name,
			email: updatedUser.email,
			role: updatedUser.role,
			passwordResetRequired: updatedUser.passwordResetRequired,
		})

		return res.json({ token, user: serializeUser(updatedUser) })
	}),
)

app.post('/api/auth/logout', requireAuth, (_req, res) => {
	res.json({ message: 'Sessão terminada.' })
})

app.get('/api/auth/me', requireAuth, async (req: AuthRequest, res) => {
	const user = await prisma.user.findUnique({ where: { id: req.user!.id } })

	if (!user || !user.active) {
		return res.status(401).json({ message: 'Utilizador inativo.' })
	}

	return res.json({ user: serializeUser(user) })
})

app.get(
	'/api/users',
	requireAuth,
	asyncHandler(async (req: AuthRequest, res) => {
		const users = await prisma.user.findMany({ orderBy: { name: 'asc' } })

		if (req.user!.role !== Role.ADMIN) {
			return res.json({ users: users.filter((user) => user.active).map(publicUser) })
		}

		return res.json({ users: users.map(serializeUser) })
	}),
)

app.post(
	'/api/users',
	requireAuth,
	requireAdmin,
	asyncHandler(async (req, res) => {
		const input = userSchema.extend({ password: userSchema.shape.password.unwrap().min(6) }).parse(req.body)
		const passwordHash = await bcrypt.hash(input.password, 12)
		const user = await prisma.user.create({
			data: {
				name: input.name,
				email: input.email,
				passwordHash,
				passwordResetRequired: true,
				role: toRole(input.role),
				active: input.active,
			},
		})

		return res.status(201).json({ user: serializeUser(user) })
	}),
)

app.put(
	'/api/users/:id',
	requireAuth,
	requireAdmin,
	asyncHandler(async (req, res) => {
		const id = parseId(req.params.id)
		const input = userUpdateSchema.parse(req.body)
		const passwordHash = input.password ? await bcrypt.hash(input.password, 12) : undefined
		const user = await prisma.user.update({
			where: { id },
			data: {
				name: input.name,
				email: input.email,
				passwordHash,
				passwordResetRequired: passwordHash ? true : undefined,
				role: input.role ? toRole(input.role) : undefined,
				active: input.active,
			},
		})

		return res.json({ user: serializeUser(user) })
	}),
)

app.delete(
	'/api/users/:id',
	requireAuth,
	requireAdmin,
	asyncHandler(async (req, res) => {
		const id = parseId(req.params.id)
		const user = await prisma.user.update({ where: { id }, data: { active: false } })

		return res.json({ user: serializeUser(user) })
	}),
)

app.get(
	'/api/facts',
	requireAuth,
	asyncHandler(async (req: AuthRequest, res) => {
		const game = await closeGameIfDeadlinePassed()
		const facts = await prisma.fact.findMany({
			where: req.user!.role === Role.ADMIN ? undefined : { active: true },
			orderBy: { id: 'asc' },
			include: { correctPerson: { select: { id: true, name: true } } },
		})

		if (req.user!.role === Role.ADMIN || isGameClosed(game)) {
			return res.json({
				facts: facts.map((fact) => ({
					id: fact.id,
					text: fact.text,
					correctPersonId: fact.correctPersonId,
					correctPerson: publicUser(fact.correctPerson),
					active: fact.active,
					createdAt: fact.createdAt,
					updatedAt: fact.updatedAt,
				})),
			})
		}

		return res.json({
			facts: facts.map((fact) => ({
				id: fact.id,
				text: fact.text,
				active: fact.active,
			})),
		})
	}),
)

app.post(
	'/api/facts',
	requireAuth,
	requireAdmin,
	asyncHandler(async (req, res) => {
		const input = factSchema.parse(req.body)
		const fact = await prisma.fact.create({ data: input })

		return res.status(201).json({ fact })
	}),
)

app.put(
	'/api/facts/:id',
	requireAuth,
	requireAdmin,
	asyncHandler(async (req, res) => {
		const id = parseId(req.params.id)
		const input = factUpdateSchema.parse(req.body)
		const fact = await prisma.fact.update({ where: { id }, data: input })

		return res.json({ fact })
	}),
)

app.delete(
	'/api/facts/:id',
	requireAuth,
	requireAdmin,
	asyncHandler(async (req, res) => {
		const id = parseId(req.params.id)
		const fact = await prisma.fact.update({ where: { id }, data: { active: false } })

		return res.json({ fact })
	}),
)

app.post(
	'/api/admin/import/customer-fest',
	requireAuth,
	requireAdmin,
	upload.single('file'),
	asyncHandler(async (req, res) => {
		assertMailConfigured()

		if (!req.file) {
			return res.status(400).json({ message: 'Envie um ficheiro Excel para importar.' })
		}

		const { rows, skippedRows } = await parseCustomerFestWorkbook(req.file.buffer)
		const summary = await importCustomerFestRows(rows)

		return res.status(201).json({
			summary: {
				...summary,
				skippedRows,
			},
		})
	}),
)

app.get(
	'/api/guesses',
	requireAuth,
	requireAdmin,
	asyncHandler(async (_req, res) => {
		const guesses = await prisma.guess.findMany({
			orderBy: { updatedAt: 'desc' },
			include: {
				player: { select: { id: true, name: true } },
				fact: { select: { id: true, text: true, correctPersonId: true } },
				selectedPerson: { select: { id: true, name: true } },
			},
		})

		return res.json({ guesses })
	}),
)

app.get(
	'/api/guesses/me',
	requireAuth,
	asyncHandler(async (req: AuthRequest, res) => {
		const guesses = await prisma.guess.findMany({
			where: { playerId: req.user!.id, fact: { active: true } },
			orderBy: { factId: 'asc' },
			include: {
				fact: { select: { id: true, text: true } },
				selectedPerson: { select: { id: true, name: true } },
			},
		})

		return res.json({ guesses })
	}),
)

app.post(
	'/api/guesses',
	requireAuth,
	asyncHandler(async (req: AuthRequest, res) => {
		await requireGameOpen()
		const input = guessSchema.parse(req.body)
		const fact = await prisma.fact.findFirst({ where: { id: input.factId, active: true } })
		const selectedPerson = await prisma.user.findFirst({
			where: { id: input.selectedPersonId, active: true },
		})

		if (!fact || !selectedPerson) {
			return res.status(400).json({ message: 'Curiosidade ou pessoa inválida.' })
		}

		const guess = await prisma.guess.upsert({
			where: { unique_player_fact: { playerId: req.user!.id, factId: input.factId } },
			update: { selectedPersonId: input.selectedPersonId },
			create: {
				playerId: req.user!.id,
				factId: input.factId,
				selectedPersonId: input.selectedPersonId,
			},
		})

		return res.status(201).json({ guess })
	}),
)

app.put(
	'/api/guesses/:id',
	requireAuth,
	asyncHandler(async (req: AuthRequest, res) => {
		await requireGameOpen()
		const id = parseId(req.params.id)
		const input = guessUpdateSchema.parse(req.body)
		const selectedPerson = await prisma.user.findFirst({
			where: { id: input.selectedPersonId, active: true },
		})

		if (!selectedPerson) {
			return res.status(400).json({ message: 'Pessoa inválida.' })
		}

		const guess = await prisma.guess.findUnique({ where: { id } })

		if (!guess || guess.playerId !== req.user!.id) {
			return res.status(404).json({ message: 'Resposta não encontrada.' })
		}

		const updatedGuess = await prisma.guess.update({
			where: { id },
			data: { selectedPersonId: input.selectedPersonId },
		})

		return res.json({ guess: updatedGuess })
	}),
)

app.delete(
	'/api/guesses/:id',
	requireAuth,
	asyncHandler(async (req: AuthRequest, res) => {
		await requireGameOpen()
		const id = parseId(req.params.id)
		const guess = await prisma.guess.findUnique({ where: { id } })

		if (!guess || guess.playerId !== req.user!.id) {
			return res.status(404).json({ message: 'Resposta não encontrada.' })
		}

		await prisma.guess.delete({ where: { id } })

		return res.status(204).send()
	}),
)

app.get(
	'/api/game',
	requireAuth,
	asyncHandler(async (_req, res) => {
		const game = await closeGameIfDeadlinePassed()

		return res.json({ game: serializeGame(game) })
	}),
)

app.put(
	'/api/game',
	requireAuth,
	requireAdmin,
	asyncHandler(async (req, res) => {
		const input = gameUpdateSchema.parse(req.body)
		const game = await getGame()
		const updatedGame = await prisma.game.update({
			where: { id: game.id },
			data: {
				name: input.name,
				status: input.status ? toGameStatus(input.status) : undefined,
				closesAt: input.closesAt === undefined ? undefined : input.closesAt ? new Date(input.closesAt) : null,
			},
		})

		return res.json({ game: serializeGame(updatedGame) })
	}),
)

app.post(
	'/api/game/open',
	requireAuth,
	requireAdmin,
	asyncHandler(async (_req, res) => {
		const game = await getGame()
		const updatedGame = await prisma.game.update({ where: { id: game.id }, data: { status: GameStatus.OPEN } })

		return res.json({ game: serializeGame(updatedGame) })
	}),
)

app.post(
	'/api/game/close',
	requireAuth,
	requireAdmin,
	asyncHandler(async (_req, res) => {
		const game = await getGame()
		const updatedGame = await prisma.game.update({ where: { id: game.id }, data: { status: GameStatus.CLOSED } })

		return res.json({ game: serializeGame(updatedGame) })
	}),
)

app.get(
	'/api/results/me',
	requireAuth,
	asyncHandler(async (req: AuthRequest, res) => {
		await ensureClosedGame()
		const facts = await prisma.fact.findMany({
			where: { active: true },
			orderBy: { id: 'asc' },
			include: {
				correctPerson: { select: { id: true, name: true } },
				guesses: {
					where: { playerId: req.user!.id },
					include: { selectedPerson: { select: { id: true, name: true } } },
				},
			},
		})
		const answers = facts.map((fact) => {
			const guess = fact.guesses[0]
			const isCorrect = Boolean(guess && guess.selectedPersonId === fact.correctPersonId)

			return {
				factId: fact.id,
				factText: fact.text,
				selectedPerson: guess ? publicUser(guess.selectedPerson) : null,
				correctPerson: publicUser(fact.correctPerson),
				isCorrect,
				points: isCorrect ? 10 : 0,
			}
		})

		return res.json({
			answers,
			correctAnswers: answers.filter((answer) => answer.isCorrect).length,
			submittedAnswers: answers.filter((answer) => answer.selectedPerson).length,
			score: answers.reduce((total, answer) => total + answer.points, 0),
		})
	}),
)

app.get(
	'/api/results/answers',
	requireAuth,
	asyncHandler(async (_req, res) => {
		await ensureClosedGame()
		const facts = await prisma.fact.findMany({
			where: { active: true },
			orderBy: { id: 'asc' },
			include: { correctPerson: { select: { id: true, name: true } } },
		})

		return res.json({
			answers: facts.map((fact) => ({
				factId: fact.id,
				factText: fact.text,
				correctPerson: publicUser(fact.correctPerson),
			})),
		})
	}),
)

app.get(
	'/api/results/ranking',
	requireAuth,
	asyncHandler(async (_req, res) => {
		await ensureClosedGame()

		return res.json({ ranking: await buildRanking() })
	}),
)

app.get(
	'/api/results/export',
	requireAuth,
	requireAdmin,
	asyncHandler(async (_req, res) => {
		await ensureClosedGame()
		const ranking = await buildRanking()
		const header = ['posicao', 'player', 'corretas', 'submetidas', 'score']
		const lines = [header.map(csvEscape).join(',')]

		for (const row of ranking) {
			lines.push(
				[row.position, row.playerName, row.correctAnswers, row.submittedAnswers, row.score]
					.map(csvEscape)
					.join(','),
			)
		}

		res.header('Content-Type', 'text/csv; charset=utf-8')
		res.header('Content-Disposition', 'attachment; filename="bingo-humano-resultados.csv"')

		return res.send(lines.join('\n'))
	}),
)

app.get(
	'/api/admin/stats',
	requireAuth,
	requireAdmin,
	asyncHandler(async (_req, res) => {
		const [players, facts, guesses, game] = await Promise.all([
			prisma.user.count({ where: { role: Role.PLAYER, active: true } }),
			prisma.fact.count({ where: { active: true } }),
			prisma.guess.count({ where: { fact: { active: true } } }),
			closeGameIfDeadlinePassed(),
		])

		return res.json({
			stats: {
				players,
				facts,
				guesses,
				averageProgress: players && facts ? Math.round((guesses / (players * facts)) * 100) : 0,
				game: serializeGame(game),
			},
		})
	}),
)

if (fs.existsSync(path.join(clientDistPath, 'index.html'))) {
	app.use(express.static(clientDistPath))
	app.use((req, res, next) => {
		if (req.path.startsWith('/api') || !req.accepts('html')) {
			return next()
		}

		return res.sendFile(path.join(clientDistPath, 'index.html'))
	})
}

app.use((req, res) => {
	res.status(404).json({ message: `Rota não encontrada: ${req.method} ${req.path}` })
})

app.use((error: Error & { statusCode?: number; code?: string }, _req: Request, res: Response, _next: NextFunction) => {
	if (error instanceof ZodError) {
		return res.status(400).json({
			message: 'Dados inválidos.',
			issues: error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
		})
	}

	if (error.code === 'P2002') {
		return res.status(409).json({ message: 'Já existe um registo com estes dados.' })
	}

	if (error.code === 'P2025') {
		return res.status(404).json({ message: 'Registo não encontrado.' })
	}

	const statusCode = error.statusCode ?? 500
	const message = statusCode === 500 ? 'Erro interno do servidor.' : error.message
	console.error(error)

	return res.status(statusCode).json({ message })
})

app.listen(config.port, () => {
	console.log(`Bingo Humano API pronta em http://localhost:${config.port}`)
})
