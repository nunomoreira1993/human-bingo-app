import { GameStatus, type Game } from '@prisma/client'
import { config } from './config'
import { prisma } from './prisma'

export async function getGame() {
  const game = await prisma.game.findFirst({ orderBy: { id: 'asc' } })

  if (game) {
    return game
  }

  return prisma.game.create({
    data: {
      name: 'Bingo Humano',
      status: GameStatus.DRAFT,
      closesAt: config.defaultClosesAt ? new Date(config.defaultClosesAt) : null,
    },
  })
}

export function isGameClosed(game: Pick<Game, 'status' | 'closesAt'>) {
  return game.status === GameStatus.CLOSED || Boolean(game.closesAt && game.closesAt <= new Date())
}

export function isGameOpen(game: Pick<Game, 'status' | 'closesAt'>) {
  return game.status === GameStatus.OPEN && !isGameClosed(game)
}

export async function requireGameOpen() {
  const game = await getGame()

  if (!isGameOpen(game)) {
    throw Object.assign(new Error('O jogo já finalizou. Já não é possível alterar respostas.'), {
      statusCode: 409,
    })
  }

  return game
}

export function serializeGame(game: Game) {
  const closed = isGameClosed(game)

  return {
    ...game,
    effectiveStatus: closed ? GameStatus.CLOSED : game.status,
    isOpen: isGameOpen(game),
    isClosed: closed,
  }
}
