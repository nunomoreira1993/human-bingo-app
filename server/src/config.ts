import 'dotenv/config'

export const config = {
  port: Number(process.env.PORT ?? 4000),
  jwtSecret: process.env.JWT_SECRET ?? 'dev-secret-change-me',
  corsOrigin: process.env.CORS_ORIGIN ?? 'http://localhost:5173',
  defaultClosesAt: process.env.GAME_CLOSES_AT,
}

if (config.jwtSecret === 'dev-secret-change-me' && process.env.NODE_ENV === 'production') {
  throw new Error('JWT_SECRET must be configured in production')
}
