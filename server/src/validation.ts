import { z } from 'zod'

export const loginSchema = z.object({
  email: z.email(),
  password: z.string().min(1),
})

export const passwordChangeSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8, 'A nova password deve ter pelo menos 8 caracteres.'),
})

export const userSchema = z.object({
  name: z.string().min(2).max(150),
  email: z.email(),
  password: z.string().min(6).optional(),
  role: z.enum(['player', 'admin']).default('player'),
  active: z.boolean().default(true),
})

export const userUpdateSchema = userSchema.partial().refine((value) => Object.keys(value).length > 0, {
  message: 'Indique pelo menos um campo para atualizar.',
})

export const factSchema = z.object({
  text: z.string().min(3),
  correctPersonId: z.number().int().positive(),
  active: z.boolean().default(true),
})

export const factUpdateSchema = factSchema.partial().refine((value) => Object.keys(value).length > 0, {
  message: 'Indique pelo menos um campo para atualizar.',
})

export const guessSchema = z.object({
  factId: z.number().int().positive(),
  selectedPersonId: z.number().int().positive(),
})

export const guessUpdateSchema = z.object({
  selectedPersonId: z.number().int().positive(),
})

export const gameUpdateSchema = z.object({
  name: z.string().min(2).max(150).optional(),
  status: z.enum(['draft', 'open', 'closed']).optional(),
  closesAt: z.string().datetime({ offset: true }).nullable().optional(),
})
