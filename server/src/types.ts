import type { Request } from 'express'
import type { Role } from '@prisma/client'

export type AuthUser = {
  id: number
  name: string
  email: string
  role: Role
  passwordResetRequired: boolean
}

export type AuthRequest = Request & {
  user?: AuthUser
}
