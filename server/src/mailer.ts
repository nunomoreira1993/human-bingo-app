import nodemailer from 'nodemailer'
import { config } from './config'

type WelcomeEmail = {
	to: string
	name: string
	password: string
}

let transporter: nodemailer.Transporter | null = null

export function assertMailConfigured() {
	if (!config.smtp.host || !config.mailFrom) {
		throw Object.assign(new Error('SMTP não configurado. Defina SMTP_HOST e MAIL_FROM no server/.env antes de importar.'), {
			statusCode: 400,
		})
	}
}

function getTransporter() {
	assertMailConfigured()

	if (!transporter) {
		transporter = nodemailer.createTransport({
			host: config.smtp.host,
			port: config.smtp.port,
			secure: config.smtp.secure,
			tls: {
				rejectUnauthorized: config.smtp.tlsRejectUnauthorized,
			},
			auth: config.smtp.user && config.smtp.pass ? {
				user: config.smtp.user,
				pass: config.smtp.pass,
			} : undefined,
		})
	}

	return transporter
}

function welcomeHtml({ name, password }: WelcomeEmail) {
	const loginUrl = config.appPublicUrl

	return `
		<div style="margin:0;padding:0;background:#fbf7ef;font-family:Verdana,Arial,sans-serif;color:#3b332d;">
			<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#fbf7ef;padding:28px 14px;">
				<tr>
					<td align="center">
						<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border:1px solid #e3d8c7;border-radius:8px;box-shadow:0 18px 46px rgba(45,31,22,.12);overflow:hidden;">
							<tr>
								<td style="background:#263d35;padding:24px;color:#ffffff;">
									<div style="width:54px;height:54px;border-radius:8px;background:#f5c66a;color:#263d35;display:inline-block;text-align:center;line-height:54px;font-family:Georgia,serif;font-size:24px;font-weight:800;">BH</div>
									<h1 style="margin:18px 0 0;font-family:Georgia,serif;font-size:32px;line-height:1.1;">Bingo Humano</h1>
									<p style="margin:8px 0 0;color:#f7ead0;font-size:15px;">Customer Fest 2026</p>
								</td>
							</tr>
							<tr>
								<td style="padding:26px;">
									<p style="margin:0 0 14px;font-size:16px;line-height:1.5;">Olá ${name},</p>
									<p style="margin:0 0 18px;font-size:16px;line-height:1.5;">A tua conta no Bingo Humano já está pronta. Entra na app, descobre curiosidades da equipa e tenta fazer os matches certos.</p>
									<div style="margin:22px 0;padding:16px;border-radius:8px;background:#f8efe4;border:1px solid #e3d8c7;">
										<p style="margin:0 0 6px;color:#766f65;font-size:12px;font-weight:800;text-transform:uppercase;">Password inicial</p>
										<p style="margin:0;font-family:Consolas,Monaco,monospace;font-size:22px;font-weight:800;color:#263d35;">${password}</p>
									</div>
									<p style="margin:0 0 22px;font-size:14px;line-height:1.5;color:#766f65;">Por segurança, vais ter de alterar esta password no primeiro login.</p>
									<a href="${loginUrl}" style="display:inline-block;background:#263d35;color:#ffffff;text-decoration:none;border-radius:8px;padding:13px 18px;font-weight:800;">Entrar no Bingo Humano</a>
								</td>
							</tr>
						</table>
					</td>
				</tr>
			</table>
		</div>
	`
}

export async function sendWelcomeEmail(input: WelcomeEmail) {
	const mailer = getTransporter()
	const loginUrl = config.appPublicUrl

	await mailer.sendMail({
		from: config.mailFrom,
		to: input.to,
		subject: 'A tua conta no Bingo Humano',
		text: [
			`Olá ${input.name},`,
			'',
			'A tua conta no Bingo Humano já está pronta.',
			`Login: ${loginUrl}`,
			`Password inicial: ${input.password}`,
			'',
			'Por segurança, vais ter de alterar esta password no primeiro login.',
		].join('\n'),
		html: welcomeHtml(input),
	})
}
