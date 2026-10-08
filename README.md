# EV ChargeOps — API

**Enterprise Challenge 2026 — FIAP × GoodWe · Grupo 23 · Sprint 02**

API REST do EV ChargeOps, a plataforma de gestão de recarga de veículos elétricos em infraestrutura compartilhada. Ela concentra o domínio do produto: contas e organizações, pontos de recarga e tarifas, sessões de recarga, preço com fator de demanda da IA, pagamento no cartão do ponto comercial e rateio mensal por unidade do condomínio.

O app do motorista ([`mobile`](https://github.com/ev-charge-ops/mobile)) e o portal do gestor ([`web`](https://github.com/ev-charge-ops/web)) consomem esta API, e ela chama o serviço de IA ([`ml`](https://github.com/ev-charge-ops/ml)) para o fator de demanda e a detecção de anomalias.

> A visão geral da solução, a arquitetura, as decisões (ADRs) e o roteiro de avaliação estão no repositório hub [`ev-charge-ops/docs`](https://github.com/ev-charge-ops/docs), a partir do [README](https://github.com/ev-charge-ops/docs#readme).

## Produção

- **API:** [api.evchargeops.com.br](https://api.evchargeops.com.br)
- **Swagger:** [api.evchargeops.com.br/docs](https://api.evchargeops.com.br/docs)
- **OpenAPI (JSON):** [api.evchargeops.com.br/docs-json](https://api.evchargeops.com.br/docs-json), usado pelo `web` e pelo `mobile` para gerar os tipos do cliente

As contas de demonstração estão descritas no [README do `docs`](https://github.com/ev-charge-ops/docs#6-como-testar-a-demonstração-em-produção). As senhas estão no arquivo da entrega e não ficam publicadas.

## Stack

| Camada | Tecnologia |
|---|---|
| Runtime | Node 24, TypeScript 6, ES modules |
| Framework | NestJS 12 (`@nestjs/core`, `@nestjs/config`, `@nestjs/jwt`, `@nestjs/swagger`) |
| Banco | PostgreSQL 17, Prisma 7 (`@prisma/adapter-pg` local e `@prisma/adapter-neon` na Vercel) |
| Validação | `class-validator` e `class-transformer` nos DTOs, Zod nas variáveis de ambiente |
| Autenticação | `@node-rs/argon2` (Argon2id), JWT, `jose` para validar tokens do Google e da Apple |
| Integrações | `stripe` (modo de teste), `resend` (e-mail transacional), serviço `ml` por HTTP |
| Qualidade | Vitest 4 + Supertest, `oxlint` com regras type-aware, Prettier |

## Principais funcionalidades

### Contas, organizações e convites

- Cadastro e login com e-mail e senha (Argon2id), access token JWT de 15 min e refresh token opaco com rotação e revogação ([ADR 0007](https://github.com/ev-charge-ops/docs/blob/main/adr/0007-authentication.md)).
- Verificação de e-mail, recuperação de senha, login sem senha por código ou link, login com Google e Apple ([ADR 0008](https://github.com/ev-charge-ops/docs/blob/main/adr/0008-authentication-flows.md)).
- Organizações (o condomínio) com papéis de gestor e motorista, unidade do morador e convites por e-mail com deep link.
- E-mails transacionais pelo Resend ou, em desenvolvimento, impressos no log ([ADR 0009](https://github.com/ev-charge-ops/docs/blob/main/adr/0009-domain-and-email.md)).
- Rate limit por IP, mais restrito nas rotas de autenticação. Ele fica em memória por instância.
- Modos por usuário, devolvidos em `GET /auth/me` e no `user` do login e do refresh: `paymentMode` (`TEST` ou `LIVE`, modo do Stripe), `locationMode` (`DEMO`, localização fixa da demonstração, ou `DEVICE`, GPS do aparelho) e `autoRefund` (estorno automático após a captura). O padrão é `TEST`, `DEMO` e `false`.

### Pontos de recarga e tarifas

- Pontos `PRIVATE` (rede do condomínio) e `COMMERCIAL` (visitantes), com estado, potência, foto opcional (`photoUrl`, URL absoluta) e capacidade elétrica do local (demanda contratada menos a reserva das áreas comuns).
- Tarifa versionada pelo gestor: cada alteração cria uma versão nova com data de vigência, e uma tarifa específica do ponto tem prioridade sobre a da organização.
- **Mapa com milhares de pontos:** `GET /charge-points?bbox=minLng,minLat,maxLng,maxLat&limit=` devolve itens leves de mapa (`ChargePointMapItemResponseDto`) dentro da área visível, do centro para fora, até `limit` (padrão 300, máximo 1000). O preço usa o fator de demanda já em cache para o operador naquela hora ou, sem cache, o preço base, sem chamar o modelo por ponto. Para o mapa afastado (zoom 9 ou menos), `GET /charge-points/clusters?bbox&zoom` agrupa os pontos numa grade em SQL (célula de `360 / 2^zoom / 4` graus) com `latitude`, `longitude`, `count` e `availableCount`. O índice `(latitude, longitude)` atende os dois.
- Sem `bbox` (app 1.4.0), `GET /charge-points` continua devolvendo o formato completo, mas limitado: os pontos privados dos condomínios do usuário mais os comerciais a até 25 km do centro do condomínio (ou de São Paulo), no máximo 200. Com `organizationId`, a lista da organização segue completa.
- O fator de demanda do modelo fica em cache em memória (LRU) por organização, tipo de ponto e hora, então detalhe, lista e início de sessão não chamam o `ml` de novo na mesma hora. O fallback por regras não entra no cache.

### Preço com fator de demanda da IA

Implementado em [`tariff-rules.ts`](src/modules/charge-points/tariff-rules.ts) e em [`src/modules/intelligence`](src/modules/intelligence) ([ADR 0011](https://github.com/ev-charge-ops/docs/blob/main/adr/0011-pricing-with-demand-factor.md)).

- **Ponto `PRIVATE`:** cobra a tarifa da concessionária, sem margem sobre a energia. O fator de demanda é calculado e exibido **apenas como informação** para o morador (`demandFactorApplied = false`).
- **Ponto `COMMERCIAL`:** cobra `tarifa base × fator de demanda`, arredondado em centavos.
- O fator vem do modelo do serviço `ml` (`POST /demand-factor`, timeout de 1,5 s). Se o serviço estiver fora, lento ou devolver um valor inválido, ou se `ML_URL` estiver vazio, entram as regras por horário e ocupação. A sessão grava a origem do fator (`MODEL` ou `RULE`) e a versão do modelo.

### Sessões de recarga

Implementadas em [`src/modules/charging-sessions`](src/modules/charging-sessions) ([ADR 0010](https://github.com/ev-charge-ops/docs/blob/main/adr/0010-charging-session-state-machine.md)).

- Máquina de estados `AWAITING_PAYMENT → PENDING → ACTIVE → GRACE → IDLE → CLOSED / INTERRUPTED` numa entidade de domínio sem dependência do Nest ou do Prisma.
- Tarifa, fator de demanda, tolerância e multa por ocupação ficam travados no início da sessão.
- Limite de recarga escolhido pelo motorista: até 100%, em kWh, em R$ ou até um percentual de carga da bateria (`PERCENT`, acima da carga atual do veículo). No `PERCENT` a simulação para quando a bateria chega ao alvo, e a previsão de término usa o mesmo modelo.
- Um motorista tem no máximo uma sessão aberta, e um ponto atende uma sessão por vez. A potência é alocada pela capacidade disponível do local.
- **As sessões avançam na leitura:** não há fila nem cron. Cada consulta (`GET /sessions`, `GET /sessions/active`, `GET /sessions/:id`, `GET /organizations/:organizationId/sessions/:sessionId`, e as sessões abertas da organização em `GET /organizations/:organizationId/overview`) e o encerramento passam pelo [`SessionSynchronizer`](src/modules/charging-sessions/session-synchronizer.ts), que lê a telemetria até o instante atual, avança o estado e recalcula os valores, com controle otimista de concorrência.
- O carregador fica atrás da port `ChargerGateway`. O adapter `mock` simula a telemetria com tempo acelerado (`SIMULATION_SPEED`, 60 por padrão: 1 s real = 1 min de recarga). O adapter `sems` (API da GoodWe) ainda responde `501`.

### Detecção de anomalias

Implementada em [`ml-anomaly-scorer.ts`](src/modules/intelligence/anomaly/ml-anomaly-scorer.ts) ([ADR 0012](https://github.com/ev-charge-ops/docs/blob/main/adr/0012-anomaly-detection.md)).

- Ao encerrar a sessão, a API monta as variáveis da sessão e chama `POST /anomaly-score` no serviço `ml`. O score, o indicador de anomalia e a versão do modelo ficam gravados na sessão.
- **Não há fallback por regras.** Se a chamada falhar, passar do timeout ou devolver algo inválido, a sessão fecha normalmente e **fica sem score**, e o erro vai para o log. Sem `ML_URL`, nenhuma sessão é pontuada.
- O gestor vê as anomalias na visão geral, filtra as sessões sinalizadas e abre a explicação do score no portal.
- Toda sessão sinalizada entra na fila de revisão (`PENDING_REVIEW`). O gestor confirma (`CONFIRMED`) ou descarta (`DISMISSED`) com uma observação opcional em `POST /organizations/{organizationId}/sessions/{sessionId}/anomaly-review`. A revisão não muda a cobrança, e a visão geral mostra quantas sinalizações ainda esperam revisão.

### Pagamento no ponto comercial (Stripe)

Implementado em [`src/modules/payments`](src/modules/payments) e [`session-payments.ts`](src/modules/charging-sessions/session-payments.ts) ([ADR 0014](https://github.com/ev-charge-ops/docs/blob/main/adr/0014-stripe-preauthorization.md)).

- **Só o ponto `COMMERCIAL`** usa pré-autorização no cartão. Os pontos `PRIVATE` são cobrados pelo rateio mensal.
- O valor bloqueado cobre a energia do limite (`ENERGY`, `AMOUNT` ou, no `PERCENT`, capacidade da bateria × diferença de carga quando o carregador informa o veículo) até o teto de `PAYMENT_HOLD_ENERGY_KWH`, mais o teto da multa por ocupação.
- A API cria um PaymentIntent com captura manual em **modo de teste** do Stripe e devolve os parâmetros do PaymentSheet para o app. O cartão é digitado no componente do Stripe e não passa pela API.
- O webhook `POST /payments/stripe/webhook` (assinatura verificada e idempotente) ou a confirmação feita pelo app liberam a sessão. No encerramento, a API captura só o valor consumido e cancela o bloqueio quando não há o que cobrar.
- Sem `STRIPE_SECRET_KEY`, iniciar sessão no ponto comercial responde `503 PAYMENTS_UNAVAILABLE`, e os pontos privados continuam funcionando.
- **Dois modos do Stripe:** o `paymentMode` do usuário (`TEST` por padrão, `LIVE` na conta da revisão da App Store) escolhe o gateway no início da sessão, e o modo fica gravado no pagamento (`payment.mode`). O modo `LIVE` usa `STRIPE_LIVE_SECRET_KEY`, `STRIPE_LIVE_WEBHOOK_SECRET` e `STRIPE_LIVE_PUBLISHABLE_KEY`, tem cliente Stripe próprio (`User.stripeLiveCustomerId`) e webhook próprio, `POST /payments/stripe/webhook/live`. Sem as chaves de produção, só os usuários `LIVE` recebem `503 PAYMENTS_UNAVAILABLE`.
- **Estorno automático:** quando o pagamento foi aberto por um usuário com `autoRefund`, a API estorna o valor inteiro logo depois da captura. O pagamento fica `REFUNDED`, com `refundedCents` e `refundedAt` na resposta da sessão.

### Rateio mensal e visão geral

Implementados em [`src/modules/cost-sharing`](src/modules/cost-sharing) ([ADR 0013](https://github.com/ev-charge-ops/docs/blob/main/adr/0013-monthly-cost-sharing.md)).

- Extrato do mês por unidade: energia (kWh × tarifa travada) + taxa de acesso + multas por ocupação, só com sessões de pontos `PRIVATE`.
- Exportação do extrato em CSV, no formato do Excel em português.
- Extrato do morador no app (`GET /me/statements/{month}`): a linha da unidade do usuário calculada pelo mesmo rateio, com o mês aberto ou fechado, a tarifa da concessionária e a energia de cada dia do mês.
- Visão geral do mês para o gestor: consumo, valores, capacidade elétrica, alerta de demanda e anomalias recentes.
- A visão geral também traz os totais do mês anterior (`previousMonth`), as sessões de visitantes (pontos `COMMERCIAL` da organização ou motoristas que não são membros), o pico de demanda do mês e, por ponto, a potência atual e a sessão aberta.
- Pico do mês (`monthPeak`): cada sessão que carregou no mês vira uma sequência de degraus de potência. Começa na potência alocada, segue o `powerKw` de cada leitura do medidor até a próxima e termina no fim da recarga (ou agora, se ainda está carregando). Sessões sem leituras, como o histórico do seed, usam a potência alocada do início ao fim. A soma das sessões sobrepostas dá a demanda simultânea; o pico é o maior valor e `at` é o instante em que ele começa. A reserva das áreas comuns não entra.

A lista completa de endpoints, com exemplos, está no [Swagger](https://api.evchargeops.com.br/docs).

## Estrutura de pastas

```
api/
├── .github/workflows/        CI e limpeza do banco de preview do Neon
├── prisma/
│   ├── schema.prisma         modelo de dados
│   ├── migrations/           migrações SQL versionadas
│   ├── seed.ts               seed da demonstração (Residencial Aclimação)
│   └── demo-*.ts             montagem do condomínio, usuários, pontos, histórico e anomalias do seed
├── src/
│   ├── main.ts               bootstrap do Nest (proxy, CORS e Swagger)
│   ├── app.module.ts         módulo raiz
│   ├── config/               validação das variáveis de ambiente com Zod
│   ├── database/             PrismaService e escolha do adapter (pg ou Neon)
│   ├── common/               código compartilhado
│   │   ├── clock/            relógio injetável, para testes com tempo controlado
│   │   ├── cors/             origens permitidas
│   │   ├── decorators/       @Public, @Roles e @CurrentUser
│   │   ├── guards/           guard de papéis
│   │   ├── pagination/       DTO de paginação
│   │   ├── rate-limit/       limitador de janela fixa em memória
│   │   ├── swagger/          documento OpenAPI em /docs e /docs-json
│   │   ├── time/             calendário de São Paulo
│   │   ├── timing/           tempo de resposta mínimo nas rotas de login
│   │   ├── types/            tipos do usuário autenticado
│   │   └── validation/       validadores customizados
│   └── modules/
│       ├── auth/             cadastro, login, tokens, verificação de e-mail, senha, login sem senha, Google e Apple
│       ├── users/            usuários
│       ├── organizations/    organizações, membros e guard de papel na organização
│       ├── invites/          convites de moradores
│       ├── mail/             envio de e-mail (Resend ou console) e templates
│       ├── charge-points/    pontos, capacidade do local e tarifas versionadas
│       ├── charger-gateway/  port do carregador e adapters (mock e sems)
│       ├── charging-sessions/
│       │   ├── domain/       entidade da sessão, estados, multas, limite e pagamento
│       │   ├── commands/     iniciar, encerrar, PaymentSheet, confirmação e webhook do Stripe
│       │   ├── queries/      sessão ativa, detalhe e histórico
│       │   └── database/     repositório Prisma
│       ├── cost-sharing/     rateio mensal, CSV, visão geral e sessões da organização
│       ├── intelligence/     fator de demanda (modelo + regras) e score de anomalia
│       └── payments/         port de pagamento e adapter do Stripe
├── test/                     testes e2e (Vitest + Supertest contra Postgres)
├── prisma.config.ts          caminho do schema, migrações e comando do seed
├── vercel.json               região gru1 e comando de build
├── vitest.config.ts          testes unitários
└── vitest.config.e2e.ts      testes e2e
```

Os módulos de sessões e de rateio separam comandos (`commands/`) e consultas (`queries/`), e as regras de negócio ficam em `domain/`, testadas sem banco. O cliente do Prisma é gerado em `src/generated/` e não é versionado.

## Como rodar localmente

Requisitos: Node 24 e um PostgreSQL 17 acessível.

### 1. Variáveis de ambiente

```bash
cp .env.example .env
```

O [`.env.example`](.env.example) documenta todas as variáveis. Preencha os valores secretos com dados próprios; nenhum segredo fica no repositório.

| Variável | Uso |
|---|---|
| `NODE_ENV`, `PORT` | ambiente e porta (padrão `3000`) |
| `DATABASE_URL`, `DATABASE_URL_UNPOOLED` | conexão com o Postgres; a segunda é usada pelas migrações e pelo seed |
| `JWT_SECRET`, `JWT_ACCESS_TTL`, `REFRESH_TTL_DAYS` | segredo e validade dos tokens (defina um segredo longo e aleatório) |
| `CORS_ORIGINS`, `APP_URL` | origens permitidas e URL do portal usada nos links dos e-mails |
| `THROTTLE_TTL_SECONDS`, `THROTTLE_LIMIT`, `AUTH_THROTTLE_LIMIT`, `TRUST_PROXY` | rate limit |
| `MAIL_DRIVER`, `MAIL_FROM`, `RESEND_API_KEY` | e-mail; com `MAIL_DRIVER=console` os e-mails saem no log e a chave não é necessária |
| `GOOGLE_CLIENT_IDS`, `APPLE_CLIENT_IDS`, `GOOGLE_WEB_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | login com Google e Apple; vazios desligam o provedor |
| `CHARGER_DRIVER`, `SIMULATION_SPEED` | adapter do carregador (`mock`) e aceleração da simulação |
| `ML_URL` | serviço de IA; vazio usa as regras no fator de demanda e deixa as sessões sem score de anomalia |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PUBLISHABLE_KEY` | Stripe em modo de teste; vazios desligam o ponto comercial |
| `STRIPE_LIVE_SECRET_KEY`, `STRIPE_LIVE_WEBHOOK_SECRET`, `STRIPE_LIVE_PUBLISHABLE_KEY` | Stripe em modo de produção, só para usuários com `paymentMode = LIVE`; vazios desligam o pagamento só para eles |
| `PAYMENT_HOLD_ENERGY_KWH`, `PAYMENT_AUTHORIZATION_TIMEOUT_MINUTES` | valor da pré-autorização e prazo para o cartão ser autorizado |
| `SEED_MANAGER_EMAIL`, `SEED_MANAGER_PASSWORD`, `SEED_DRIVER_EMAIL`, `SEED_DRIVER_PASSWORD` | contas de demonstração criadas pelo seed; as senhas são obrigatórias para rodar o seed |
| `SEED_REVIEWER_EMAIL`, `SEED_REVIEWER_PASSWORD` | conta da revisão da App Store (padrão `appreview@evchargeops.com.br`); sem a senha o seed pula essa conta |
| `MEDIA_BASE_URL` | base das fotos dos pontos gravadas pelo seed (`<base>/points/<arquivo>.webp`); padrão `https://app.evchargeops.com.br/media` |

### 2. Instalação, banco e seed

```bash
npm ci                     # instala e roda prisma generate (postinstall)
npm run prisma:migrate     # prisma migrate dev: aplica as migrações no banco local
npm run db:seed            # prisma db seed: cria o condomínio de demonstração
```

O seed cria o Residencial Aclimação com três pontos (com foto), moradores, histórico de sessões e sessões anômalas. Com `SEED_REVIEWER_PASSWORD` definido, ele também cria a conta da revisão da App Store: motorista "Revisor App Store", e-mail verificado, morador da unidade "Revisão · 01" e com `paymentMode = LIVE`, `locationMode = DEVICE` e `autoRefund = true`. Para pontuar as anomalias da demonstração ele chama o serviço `ml` (por padrão o de produção) e, se não conseguir, usa uma regra simples **só para os dados do seed**. Essa regra não existe na API em execução.

Para regenerar o cliente do Prisma depois de mudar o schema: `npm run prisma:generate`.

### 3. Desenvolvimento

```bash
npm run start:dev          # nest start --watch em http://localhost:3000
```

O Swagger fica em `http://localhost:3000/docs`.

### 4. Testes, lint e build

```bash
npm test                   # testes unitários (Vitest)
npm run test:e2e           # testes e2e contra o Postgres do DATABASE_URL
npm run test:cov           # unitários com cobertura
npm run lint               # oxlint type-aware em src/, test/ e prisma/
npx tsc --noEmit           # checagem de tipos
npm run build              # nest build
```

Os testes e2e usam o banco configurado no `.env`, então aplique as migrações antes de rodá-los.

## Testes, CI e deploy

- **Testes unitários** (`*.spec.ts` junto do código): regras de domínio (estados da sessão, multas, limite, pagamento, rateio, capacidade, tarifas), providers de IA, rate limit, e-mail e configuração.
- **Testes e2e** ([`test/`](test)): sobem a aplicação Nest contra Postgres e cobrem autenticação, OAuth, convites, organizações, pontos, sessões, rateio, pagamentos, integração com o `ml`, rate limit e Swagger. Stripe, `ml` e provedores OAuth são simulados nos testes.
- **CI** ([`.github/workflows/ci.yml`](.github/workflows/ci.yml)), em todo PR e push na `main`, com um Postgres 17 de serviço: `npm ci`, `prisma generate`, `npm run lint`, `tsc --noEmit`, `prisma migrate deploy`, `npm test`, `npm run test:e2e` e `npm run build`.
- **Deploy na Vercel** ([ADR 0015](https://github.com/ev-charge-ops/docs/blob/main/adr/0015-deploy-and-ci.md)): integração Git, função Node na região `gru1`. O build (`npm run vercel-build`) roda `prisma generate`, `prisma migrate deploy` e `nest build`, então as migrações sobem com o código. Cada merge na `main` vai para produção.
- **Banco por PR:** cada PR ganha um preview na Vercel com um **branch próprio do Neon Postgres**, criado pela integração Neon + Vercel. Quando o PR fecha, o workflow [`cleanup-preview-database.yml`](.github/workflows/cleanup-preview-database.yml) apaga o branch.
- Os segredos de produção ficam nas variáveis de ambiente da Vercel.
