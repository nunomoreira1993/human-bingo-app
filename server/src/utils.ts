import type { NextFunction, Request, Response } from 'express'
import { Role, GameStatus } from '@prisma/client'

export function asyncHandler(
  handler: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(handler(req, res, next)).catch(next)
  }
}

export function parseId(value: unknown) {
  if (typeof value !== 'string') {
    throw Object.assign(new Error('Identificador inválido.'), { statusCode: 400 })
  }

  const id = Number(value)

  if (!Number.isInteger(id) || id <= 0) {
    throw Object.assign(new Error('Identificador inválido.'), { statusCode: 400 })
  }

  return id
}

export function toRole(value: 'player' | 'admin') {
  return value === 'admin' ? Role.ADMIN : Role.PLAYER
}

export function fromRole(value: Role) {
  return value === Role.ADMIN ? 'admin' : 'player'
}

export function toGameStatus(value: 'draft' | 'open' | 'closed') {
  if (value === 'open') return GameStatus.OPEN
  if (value === 'closed') return GameStatus.CLOSED
  return GameStatus.DRAFT
}

export function csvEscape(value: unknown) {
  const text = String(value ?? '')
  return `"${text.replace(/"/g, '""')}"`
}
