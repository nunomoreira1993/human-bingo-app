# Bingo Humano

Aplicacao web/mobile-first para descobrir curiosidades da equipa, incentivar conversas entre colegas e transformar um evento presencial num desafio participativo. O frontend e feito em React + Vite e o backend em Node.js + Express, com Prisma ligado a MySQL, autenticacao JWT e passwords com hash bcrypt.

## Arquitetura

```text
bingo/
  client/                 # React + Vite
    src/App.tsx           # UI: login, jogador, ranking, respostas, admin
    src/App.css           # estilos mobile-first
    vite.config.ts        # proxy /api para o backend em desenvolvimento
  server/                 # Express + Prisma
    src/index.ts          # rotas REST e regras funcionais
    src/auth.ts           # JWT, requireAuth, requireAdmin
    src/game.ts           # estado do jogo e validacao de fecho
    prisma/schema.prisma  # modelo MySQL
    prisma/seed.ts        # dados de exemplo
    sql/schema.sql        # SQL manual equivalente
    .env.example          # variaveis de ambiente
  scripts/dev.ps1         # arranque em Windows usando Node portatil se existir
  scripts/build.ps1       # build em Windows usando Node portatil se existir
```

Em producao, depois de `npm run build`, o Express serve tambem o build estatico de `client/dist`, alem das rotas `/api`.

## Modelo de dados

O modelo principal esta em [server/prisma/schema.prisma](server/prisma/schema.prisma). O SQL manual equivalente esta em [server/sql/schema.sql](server/sql/schema.sql).

Entidades:

- `users`: jogadores e administradores, com `role` `player` ou `admin`.
- `facts`: curiosidades, com `correct_person_id` a apontar para a pessoa correta.
- `guesses`: respostas dos jogadores, com constraint unica `(player_id, fact_id)`.
- `games`: estado do jogo, prazo e nome.

## Variaveis de ambiente

Copiar o ficheiro de exemplo:

```powershell
Copy-Item server/.env.example server/.env
```

Editar `server/.env`:

```env
DATABASE_URL="mysql://bingo_user:bingo_password@localhost:3306/bingo_humano"
JWT_SECRET="trocar-por-um-segredo-longo-e-aleatorio"
PORT=4000
CORS_ORIGIN="http://localhost:5173"
APP_PUBLIC_URL="https://bingo.ddsdev.deloitte.pt"
GAME_CLOSES_AT="2026-06-26T18:00:00+01:00"
MAIL_FROM="Bingo Humano <no-reply@ddsdev.deloitte.pt>"
SMTP_HOST="smtp.example.com"
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=""
SMTP_PASS=""
```

Para usar a importacao Excel no backoffice, configurar SMTP real em `server/.env`. O import cria passwords iniciais para novas contas e envia-as por e-mail, por isso a rota rejeita o upload se `SMTP_HOST` e `MAIL_FROM` nao estiverem definidos.

## Instalar e correr localmente

Neste computador, a instalacao global do Node falhou por permissao do MSI, por isso foi descarregado Node portatil em `.tools/`. Os scripts PowerShell ja o usam se existir.

### 1. Preparar MySQL

O ficheiro `server/.env` esta configurado para usar:

```env
DATABASE_URL="mysql://bingo_user:bingo_password@localhost:3306/bingo_humano"
```

Por isso tens duas opcoes:

1. Criar essa base e esse utilizador no MySQL, executando [server/sql/create-database.sql](server/sql/create-database.sql) como root/admin no phpMyAdmin, Adminer, MySQL Workbench ou consola MySQL.
2. Usar uma base/utilizador que ja existam e alterar `DATABASE_URL` em `server/.env`.

Depois disso, o Prisma cria as tabelas automaticamente com `npm run db:push`.

Para testar o fluxo de respostas, garante que `GAME_CLOSES_AT` fica numa data/hora futura. Se o prazo ja tiver passado, o backend fecha o jogo e bloqueia alteracoes.

### 2. Instalar e arrancar

```powershell
# instalar dependencias
$env:Path = "$PWD\.tools\node-v24.18.0-win-x64;$env:Path"
npm install

# criar tabelas no MySQL a partir do Prisma
npm run db:push

# inserir dados de exemplo
npm run db:seed

# arrancar frontend e backend
npm run dev
```

URLs locais:

- Frontend: `http://localhost:5173`
- Backend/API: `http://localhost:4000/api/health`

Utilizadores de exemplo apos seed:

- Admin: `admin@example.com` / `admin123`
- Jogadores: `ana@example.com`, `bruno@example.com`, etc. / `bingo123`

Os jogadores criados pelo seed entram com a password inicial `bingo123` e sao obrigados a definir uma nova password no primeiro acesso. O admin de exemplo nao fica bloqueado por este fluxo.

Se preferires criar tabelas manualmente, executar [server/sql/schema.sql](server/sql/schema.sql) na base de dados MySQL e depois correr `npm run db:seed`.

## APIs implementadas

Autenticacao:

- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/me`
- `POST /api/auth/change-password`

Jogadores/admin:

- `GET /api/users`
- `POST /api/users` admin
- `PUT /api/users/:id` admin
- `DELETE /api/users/:id` admin, desativa o utilizador

Curiosidades:

- `GET /api/facts`
- `POST /api/facts` admin
- `PUT /api/facts/:id` admin
- `DELETE /api/facts/:id` admin, desativa a curiosidade
- `POST /api/admin/import/customer-fest` admin, importa Excel `.xlsx/.xlsm` com e-mail na coluna D e fun fact na coluna F

Respostas:

- `GET /api/guesses/me`
- `GET /api/guesses` admin
- `POST /api/guesses`
- `PUT /api/guesses/:id`
- `DELETE /api/guesses/:id`

Jogo:

- `GET /api/game`
- `PUT /api/game` admin
- `POST /api/game/open` admin
- `POST /api/game/close` admin

Resultados:

- `GET /api/results/me`
- `GET /api/results/answers`
- `GET /api/results/ranking`
- `GET /api/results/export` admin, CSV

Admin extra:

- `GET /api/admin/stats`
- Importacao Excel no backoffice cria contas em falta, cria/reativa curiosidades e envia e-mail de boas-vindas com link de login e password inicial.

## Regras de seguranca e jogo

- Passwords guardadas com bcrypt.
- Jogadores com password inicial sao obrigados a trocar a password no primeiro login antes de aceder ao jogo.
- JWT enviado no header `Authorization: Bearer <token>`.
- Rotas admin protegidas por `role=admin`.
- Jogadores so alteram as suas proprias respostas.
- `guesses` tem constraint unica por jogador/curiosidade.
- O backend valida sempre se o jogo esta aberto antes de aceitar criar, alterar ou apagar respostas.
- Ranking, pontuacao e respostas corretas so ficam disponiveis apos o fecho.
- Se `closes_at` ja passou, o backend trata o jogo como fechado e bloqueia alteracoes.

## Build e deploy em servidor proprio

No servidor:

```bash
npm ci
cp server/.env.example server/.env
# editar server/.env com DATABASE_URL real, JWT_SECRET forte e CORS_ORIGIN
npm run db:push
npm run db:seed
npm run build
npm start
```

Com PM2:

```bash
npm install -g pm2
pm2 start "npm start" --name bingo-humano
pm2 save
```

Exemplo de reverse proxy Nginx:

```nginx
server {
  server_name bingo.exemplo.pt;

  location / {
    proxy_pass http://127.0.0.1:4000;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
```

## Comandos uteis

```powershell
npm run build          # valida backend e frontend
npm run dev            # API + Vite em desenvolvimento
npm run start          # servidor Express em modo producao, depois de build
npm run db:push        # cria/atualiza tabelas MySQL via Prisma
npm run db:seed        # dados iniciais
npm run prisma:studio  # UI para inspecionar dados
```
