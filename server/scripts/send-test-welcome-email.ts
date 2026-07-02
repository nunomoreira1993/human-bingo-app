import { randomBytes } from 'node:crypto'
import { sendWelcomeEmail } from '../src/mailer'

type Options = {
  to?: string
  name: string
  password?: string
  help: boolean
}

function readOption(args: string[], optionName: string) {
  const inlinePrefix = `--${optionName}=`
  const inlineValue = args.find((arg) => arg.startsWith(inlinePrefix))

  if (inlineValue) {
    return inlineValue.slice(inlinePrefix.length).trim()
  }

  const optionIndex = args.indexOf(`--${optionName}`)
  if (optionIndex >= 0) {
    return args[optionIndex + 1]?.trim()
  }

  return undefined
}

function parseOptions(): Options {
  const args = process.argv.slice(2)

  return {
    to: readOption(args, 'to') || process.env.TEST_EMAIL,
    name: readOption(args, 'name') || 'Nuno',
    password: readOption(args, 'password'),
    help: args.includes('--help') || args.includes('-h'),
  }
}

function generateTestPassword() {
  return `Teste-${randomBytes(4).toString('hex')}`
}

function printUsage() {
  console.log([
    'Envia um e-mail de teste com o mesmo template usado na importacao Customer Fest.',
    '',
    'Uso:',
    '  npm run mail:test --workspace server -- --to "teu.email@empresa.com" --name "Nuno"',
    '',
    'Opcoes:',
    '  --to        Destinatario do e-mail. Tambem pode usar TEST_EMAIL no .env/ambiente.',
    '  --name      Nome mostrado no e-mail. Por defeito: Nuno.',
    '  --password  Password simulada. Se omitida, gera uma password temporaria.',
    '  --help      Mostra esta ajuda sem enviar e-mail.',
  ].join('\n'))
}

async function main() {
  const options = parseOptions()

  if (options.help) {
    printUsage()
    return
  }

  if (!options.to) {
    printUsage()
    throw new Error('Indica o destinatario com --to ou TEST_EMAIL.')
  }

  const password = options.password || generateTestPassword()

  await sendWelcomeEmail({
    to: options.to,
    name: options.name,
    password,
  })

  console.log(`E-mail de teste enviado para ${options.to}`)
  console.log(`Password simulada: ${password}`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})