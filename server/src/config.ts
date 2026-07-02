import 'dotenv/config'

export const config = {
  port: Number(process.env.PORT ?? 4000),
  jwtSecret: process.env.JWT_SECRET ?? 'dev-secret-change-me',
  corsOrigin: process.env.CORS_ORIGIN ?? 'http://localhost:5173',
  defaultClosesAt: process.env.GAME_CLOSES_AT,
  appPublicUrl: (process.env.APP_PUBLIC_URL ?? process.env.CORS_ORIGIN ?? 'http://localhost:5173').replace(/\/$/, ''),
  mailFrom: process.env.MAIL_FROM,
  smtp: {
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: process.env.SMTP_SECURE === 'true',
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
    tlsRejectUnauthorized: process.env.SMTP_TLS_REJECT_UNAUTHORIZED !== 'false',
  },
}

if (config.jwtSecret === 'dev-secret-change-me' && process.env.NODE_ENV === 'production') {
  throw new Error('JWT_SECRET must be configured in production')
}
