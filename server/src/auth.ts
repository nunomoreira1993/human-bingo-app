import type { NextFunction, Response } from 'express'
import jwt from 'jsonwebtoken'
import { Role } from '@prisma/client'
import { config } from './config'
import { prisma } from './prisma'
import type { AuthRequest, AuthUser } from './types'

export function signToken(user: AuthUser) {
  return jwt.sign(
    {
      sub: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      passwordResetRequired: user.passwordResetRequired,
    },
    config.jwtSecret,
    { expiresIn: '12h' },
  )
}

export async function requireAuth(req: AuthRequest, res: Response, next: NextFunction) {
  const header = req.header('authorization')
  const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined

  if (!token) {
    return res.status(401).json({ message: 'Autenticação necessária.' })
  }

  try {
    const payload = jwt.verify(token, config.jwtSecret) as jwt.JwtPayload
    const user = await prisma.user.findUnique({ where: { id: Number(payload.sub) } })

    if (!user || !user.active) {
      return res.status(401).json({ message: 'Utilizador inativo.' })
    }

    req.user = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      passwordResetRequired: user.passwordResetRequired,
    }

    const canResetPassword = req.path === '/api/auth/change-password'
    const canReadOwnSession = req.path === '/api/auth/me'
    const canLogout = req.path === '/api/auth/logout'

    if (user.passwordResetRequired && !canResetPassword && !canReadOwnSession && !canLogout) {
      return res.status(403).json({
        code: 'PASSWORD_RESET_REQUIRED',
        message: 'Deves definir uma nova password antes de continuar.',
      })
    }

    return next()
  } catch {
    return res.status(401).json({ message: 'Sessão inválida ou expirada.' })
  }
}

export function requireAdmin(req: AuthRequest, res: Response, next: NextFunction) {
  if (req.user?.role !== Role.ADMIN) {
    return res.status(403).json({ message: 'Acesso reservado a administradores.' })
  }

  return next()
}
