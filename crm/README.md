# CRM услуг

Собственная CRM для компании, продающей услуги: лиды со всех каналов в одной воронке,
переписка и звонки в карточке клиента, настраиваемые поля и автоматизации.

## Что умеет сейчас

- **Каналы входящих заявок**: формы сайта (вебхук), Binotel (звонки, пропущенные, записи разговоров),
  Telegram (бот), Viber (бот), WhatsApp Business Cloud API, Facebook Messenger, Instagram Direct, email (IMAP).
- **Ответы клиенту** из CRM в Telegram, Viber, WhatsApp, Messenger, Instagram и по email (SMTP).
- **Контакты** с несколькими идентификаторами (телефон, email, Telegram и т.д.): клиент, написавший
  в мессенджер с известного телефона, попадает в тот же контакт и лид. Объединение дублей.
- **Воронки и этапы**: любое число воронок, этапы с цветами, «успех»/«отказ», канбан с перетаскиванием.
- **Настраиваемые поля** лида и контакта: текст, число, дата, список, флаг.
- **Автоматизации**: событие → условия → действия (назначить менеджера по кругу, создать задачу,
  ответить в тот же канал, отправить email, перенести на этап, вебхук). Настраиваются в интерфейсе.
- **Общий инбокс** по всем каналам, задачи, журнал звонков с плеером записей, журнал вебхуков для отладки.
- **Роли**: администратор и менеджер.

Подробнее: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), [docs/INTEGRATIONS.md](docs/INTEGRATIONS.md),
[docs/ROADMAP.md](docs/ROADMAP.md).

## Стек

Node.js 22, TypeScript, Fastify, Prisma, PostgreSQL 16, React 19, Vite, TanStack Query. Без тяжёлых
зависимостей: интеграции написаны поверх `fetch` и официальных API.

## Быстрый старт (разработка)

```bash
# 1. PostgreSQL (локальный или через docker compose up db)
# 2. Зависимости
npm run install:all
# 3. Настройки сервера
cp server/.env.example server/.env   # заполнить DATABASE_URL, JWT_SECRET, WEBHOOK_SECRET
# 4. Схема и стартовые данные (админ admin@example.com / admin123, воронка, поля, правила)
cd server && npx prisma migrate dev && npm run db:seed && cd ..
# 5. Запуск
npm run dev:server   # API на :3000
npm run dev:web      # интерфейс на :5173 (проксирует /api на :3000)
```

Проверка: отправьте тестовую заявку с сайта.

```bash
curl -X POST localhost:3000/webhooks/website \
  -H 'content-type: application/json' -H 'x-webhook-secret: <WEBHOOK_SECRET>' \
  -d '{"name":"Тест","phone":"0671234567","message":"Нужна доставка","form":"Главная"}'
```

Лид появится в воронке, автоматизации назначат менеджера и создадут задачу.

## Продакшен

```bash
npm run build                     # server/dist и web/dist
cd server && npx prisma migrate deploy && npm start
```

Сервер отдаёт собранный интерфейс сам, отдельный веб-сервер для фронтенда не нужен. Снаружи
нужен HTTPS (nginx или Caddy), потому что все мессенджеры требуют HTTPS для вебхуков.
Есть `docker-compose.yml` с базой и сервером.

## Тесты

```bash
npm test          # vitest: нормализация телефонов, движок автоматизаций, сквозные сценарии через API
npm run typecheck
```

Сквозные тесты используют базу `crm_test` (переменная `TEST_DATABASE_URL`).
