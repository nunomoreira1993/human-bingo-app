# Contexto para Deploy em CentOS

Este ficheiro resume o contexto tecnico necessario para pedir ajuda ou executar o deploy da aplicacao **Bingo Humano** no dominio:

```text
https://bingo.ddsdev.deloitte.pt
```

Repositorio GitHub:

```text
https://github.com/nunomoreira1993/human-bingo-app.git
```

## Stack

- Frontend: React + Vite + TypeScript
- Backend: Node.js + Express + TypeScript
- ORM: Prisma
- Base de dados: MySQL
- Autenticacao: JWT
- Passwords: bcrypt
- Deploy pretendido: servidor proprio CentOS com Nginx/reverse proxy
- O backend Express serve tambem o build estatico do frontend em producao

## Estrutura relevante

```text
human-bingo-app/
  package.json
  package-lock.json
  client/
    index.html
    src/
    package.json
    vite.config.ts
  server/
    package.json
    .env.example
    prisma/schema.prisma
    prisma/seed.ts
    sql/schema.sql
    sql/create-database.sql
    src/index.ts
```

## Scripts principais

Na raiz do projeto:

```bash
npm run build          # build backend + frontend
npm run start          # arranca Express em producao
npm run dev            # dev local com API + Vite
npm run db:push        # aplica schema Prisma na BD
npm run db:seed        # cria dados iniciais
npm run prisma:studio  # abre Prisma Studio
```

O `npm start` chama:

```bash
npm run start --workspace server
```

Em producao, o servidor arranca com:

```bash
node dist/src/index.js
```

O build gera:

```text
server/dist/src/index.js
client/dist/
```

O backend serve `client/dist` automaticamente se existir.

## Versoes usadas em desenvolvimento

```text
Node.js v24.18.0
npm 11.16.0
```

Para CentOS, usar Node moderno compativel, idealmente Node 22+ ou Node 24.

## Variaveis de ambiente

Criar o ficheiro:

```bash
cp server/.env.example server/.env
```

Conteudo esperado em `server/.env` para producao:

```env
DATABASE_URL="mysql://USER:PASSWORD@localhost:3306/bingo_humano"
JWT_SECRET="UM_SEGREDO_FORTE_E_LONGO"
PORT=4000
CORS_ORIGIN="https://bingo.ddsdev.deloitte.pt"
GAME_CLOSES_AT="2026-12-31T18:00:00+01:00"
```

Notas:

- `server/.env` nao esta no Git.
- Nunca usar credenciais locais em producao.
- `JWT_SECRET` deve ser forte, longo e unico.
- `GAME_CLOSES_AT` define a data/hora de fecho automatico do jogo.

## Base de dados

O modelo Prisma esta em:

```text
server/prisma/schema.prisma
```

SQL manual equivalente:

```text
server/sql/schema.sql
server/sql/create-database.sql
```

Entidades principais:

- `users`
- `facts`
- `guesses`
- `games`

Campo importante:

```text
users.password_reset_required
```

Este campo obriga jogadores com password inicial a trocar a password no primeiro login.

## Seed

Comando:

```bash
npm run db:seed
```

Cria utilizadores de exemplo:

```text
Admin:
admin@example.com / admin123

Jogadores:
ana@example.com / bingo123
bruno@example.com / bingo123
...
```

Notas:

- Jogadores criados pelo seed ficam obrigados a trocar a password inicial no primeiro login.
- Admin de exemplo nao fica bloqueado por este fluxo.

## Passos de deploy em CentOS

### 1. Instalar dependencias do sistema

Instalar ou confirmar:

- git
- Node.js moderno
- npm
- MySQL ou acesso a MySQL existente
- Nginx
- PM2 ou systemd para manter a app ativa

### 2. Clonar repositorio

```bash
cd /var/www
git clone https://github.com/nunomoreira1993/human-bingo-app.git
cd human-bingo-app
```

### 3. Configurar ambiente

```bash
cp server/.env.example server/.env
nano server/.env
```

Exemplo:

```env
DATABASE_URL="mysql://USER:PASSWORD@localhost:3306/bingo_humano"
JWT_SECRET="SEGREDO_FORTE"
PORT=4000
CORS_ORIGIN="https://bingo.ddsdev.deloitte.pt"
GAME_CLOSES_AT="2026-12-31T18:00:00+01:00"
```

### 4. Instalar dependencias Node

```bash
npm ci
```

### 5. Preparar MySQL

Se a base ainda nao existir, criar:

```text
bingo_humano
```

E um utilizador MySQL com permissoes sobre essa base.

Depois aplicar o schema:

```bash
npm run db:push
```

Opcionalmente inserir dados iniciais:

```bash
npm run db:seed
```

### 6. Build

```bash
npm run build
```

### 7. Testar arranque manual

```bash
npm start
```

Verificar healthcheck:

```bash
curl http://127.0.0.1:4000/api/health
```

Resposta esperada:

```json
{"ok":true,"service":"bingo-humano-api"}
```

### 8. Correr com PM2

Exemplo com PM2:

```bash
npm install -g pm2
pm2 start "npm start" --name human-bingo-app
pm2 save
pm2 startup
```

Alternativa: criar um servico systemd equivalente.

### 9. Configurar Nginx

Reverse proxy para a app Node em:

```text
http://127.0.0.1:4000
```

Exemplo base:

```nginx
server {
  server_name bingo.ddsdev.deloitte.pt;

  location / {
    proxy_pass http://127.0.0.1:4000;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
```

Validar e recarregar:

```bash
nginx -t
systemctl reload nginx
```

### 10. HTTPS

Configurar certificado TLS para:

```text
bingo.ddsdev.deloitte.pt
```

Opcoes:

- Certbot/Let's Encrypt, se o dominio for publico e apontar para o servidor.
- Certificado corporativo/manual, se for dominio interno Deloitte.

### 11. Firewall

Abrir apenas:

- 80
- 443

A porta Node `4000` deve ficar interna em `127.0.0.1`, sem exposicao publica direta.

## Checklist final

- `npm ci` passa
- `npm run db:push` passa
- `npm run db:seed` passa, se forem usados dados iniciais
- `npm run build` passa
- `npm start` arranca a app
- `curl http://127.0.0.1:4000/api/health` responde OK
- `https://bingo.ddsdev.deloitte.pt` abre a app
- Login admin funciona
- Jogador com password inicial e obrigado a trocar password
- Ranking e respostas corretas so aparecem depois do fecho
- Rotas admin estao protegidas por role admin

## Pedido para outro chat

Usar este pedido:

```text
Ajuda-me a montar os comandos exatos para fazer deploy desta app em CentOS, incluindo instalacao de Node.js, MySQL/Nginx, PM2 ou systemd, configuracao Nginx para bingo.ddsdev.deloitte.pt, HTTPS e validacoes finais.
```
