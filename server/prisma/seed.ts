import bcrypt from 'bcryptjs'
import { GameStatus, PrismaClient, Role } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const passwordHash = await bcrypt.hash('bingo123', 12)
  const adminHash = await bcrypt.hash('admin123', 12)

  const admin = await prisma.user.upsert({
    where: { email: 'admin@example.com' },
    update: { passwordHash: adminHash, active: true, role: Role.ADMIN, passwordResetRequired: false },
    create: {
      name: 'Admin Bingo',
      email: 'admin@example.com',
      passwordHash: adminHash,
      role: Role.ADMIN,
      passwordResetRequired: false,
    },
  })

  const people = await Promise.all(
    [
      ['Ana Silva', 'ana@example.com'],
      ['Bruno Costa', 'bruno@example.com'],
      ['Carla Mendes', 'carla@example.com'],
      ['Diogo Rocha', 'diogo@example.com'],
      ['Ines Ferreira', 'ines@example.com'],
      ['Joao Pereira', 'joao@example.com'],
    ].map(([name, email]) =>
      prisma.user.upsert({
        where: { email },
        update: { name, passwordHash, active: true, role: Role.PLAYER, passwordResetRequired: true },
        create: { name, email, passwordHash, role: Role.PLAYER, passwordResetRequired: true },
      }),
    ),
  )

  await prisma.game.upsert({
    where: { id: 1 },
    update: {
      name: 'Bingo Humano',
      status: GameStatus.OPEN,
      closesAt: new Date(process.env.GAME_CLOSES_AT ?? '2026-06-26T18:00:00+01:00'),
    },
    create: {
      id: 1,
      name: 'Bingo Humano',
      status: GameStatus.OPEN,
      closesAt: new Date(process.env.GAME_CLOSES_AT ?? '2026-06-26T18:00:00+01:00'),
    },
  })

  const facts = [
    ['Já fez uma viagem de comboio de mais de 20 horas.', people[0].id],
    ['Aprendeu a tocar guitarra durante a pandemia.', people[1].id],
    ['Tem uma coleção de canecas de cidades diferentes.', people[2].id],
    ['Correu uma meia maratona sem treinar o suficiente.', people[3].id],
    ['Sabe cozinhar um prato tradicional de família de memória.', people[4].id],
    ['Já trabalhou num festival de verão.', people[5].id],
    ['Fala três idiomas numa conversa normal.', admin.id],
    ['Ganhou um concurso de karaoke.', people[1].id],
  ]

  for (const [text, correctPersonId] of facts) {
    const existing = await prisma.fact.findFirst({ where: { text: String(text) } })

    if (!existing) {
      await prisma.fact.create({
        data: {
          text: String(text),
          correctPersonId: Number(correctPersonId),
        },
      })
    }
  }

  console.log('Seed concluido.')
  console.log('Admin: admin@example.com / admin123')
  console.log('Jogadores: ana@example.com, bruno@example.com, ... / bingo123')
}

main()
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
