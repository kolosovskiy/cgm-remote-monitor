# Интеграции: настройка

Все вебхуки требуют публичный HTTPS-адрес сервера (`PUBLIC_URL`). Для локальной разработки подходит
туннель вроде `cloudflared tunnel` или `ngrok`.

## Сайт

`POST {PUBLIC_URL}/webhooks/website`, заголовок `X-Webhook-Secret: <WEBHOOK_SECRET>`
(или `?secret=` в адресе). JSON-тело:

```json
{ "name": "Иван", "phone": "0671234567", "email": "ivan@example.com",
  "message": "текст заявки", "form": "Калькулятор", "page": "/delivery",
  "utm": { "utm_source": "google" }, "fields": { "Вес": "200 кг" } }
```

Нужен телефон или email. Всё из `fields` попадает в текст первого сообщения, `form`, `page` и
`utm` сохраняются в `sourceDetail` лида.

## Binotel

1. В кабинете Binotel: Настройки → API → получить `BINOTEL_KEY`, `BINOTEL_SECRET`.
2. Там же Webhooks: событие «завершение звонка» → `{PUBLIC_URL}/webhooks/binotel/call-completed?secret=<WEBHOOK_SECRET>`.
   Опционально «входящий звонок» → `{PUBLIC_URL}/webhooks/binotel/incoming?secret=<WEBHOOK_SECRET>`:
   ответ содержит контакт и ссылку на лид для всплывающей карточки.
3. Включить запись разговоров в Binotel: ссылка приходит в поле `linkToCallRecord` и
   проигрывается прямо в карточке лида.
4. В CRM каждому менеджеру указать внутренний номер Binotel (Настройки → Пользователи), чтобы
   звонки привязывались к сотруднику.

Входящий звонок от неизвестного номера создаёт контакт и лид с источником «Телефон». Пропущенный
входящий публикует событие `call.missed`, на него по умолчанию ставится задача «перезвонить».

## Telegram

1. Создать бота через @BotFather, токен в `TELEGRAM_BOT_TOKEN`.
2. После запуска сервера: Настройки → Каналы → «Зарегистрировать вебхук»
   (или `POST /webhooks/telegram/setup` с токеном администратора).
3. Клиент пишет боту, диалог появляется в инбоксе. Ссылку на бота размещают на сайте.

Ограничение: бот не может написать первым. Для переписки с личного номера менеджера нужен
Telegram user API (MTProto), это отдельная интеграция с риском блокировки аккаунта.

## Viber

1. Создать бота в Viber Admin Panel (partners.viber.com), токен в `VIBER_AUTH_TOKEN`.
2. Настройки → Каналы → «Зарегистрировать вебхук».

Бот отвечает только подписавшимся. Рассылки по номерам идут через Viber Business Messages
у официальных партнёров, это платно и не входит в текущую версию.

## Facebook Messenger и Instagram

1. Приложение в developers.facebook.com, тип Business. Добавить продукты Messenger и Instagram.
2. Webhooks → Callback URL `{PUBLIC_URL}/webhooks/meta`, Verify token = `META_VERIFY_TOKEN`.
   Подписки: `page: messages`, `instagram: messages`.
3. `META_APP_SECRET` из настроек приложения, `META_PAGE_ACCESS_TOKEN` — долгоживущий токен страницы.
4. Для работы с реальными клиентами нужны верификация бизнеса и App Review на разрешения
   `pages_messaging`, `instagram_basic`, `instagram_manage_messages`. Закладывайте 1–3 недели.

## WhatsApp

Используется официальный WhatsApp Business Cloud API (Meta). В том же приложении Meta добавить
продукт WhatsApp, получить `WHATSAPP_PHONE_NUMBER_ID` и `WHATSAPP_ACCESS_TOKEN`.
Webhooks → `{PUBLIC_URL}/webhooks/whatsapp`, verify token общий (`META_VERIFY_TOKEN`).

Свободный ответ клиенту возможен в течение 24 часов после его сообщения, дальше только
утверждённые шаблоны (в текущей версии шаблонные сообщения не реализованы).
Неофициальные интеграции через WhatsApp Web намеренно не используются: они ведут к бану номера.

## Email

`IMAP_*` для входящих (ящик опрашивается раз в `IMAP_POLL_SECONDS`), `SMTP_*` для исходящих.
Для Gmail и Google Workspace нужен пароль приложения. Письмо от неизвестного адреса создаёт
контакт и лид с источником «Email». Ответ из CRM уходит с темой `Re: <тема письма>`.

## Отладка

Настройки → Журнал вебхуков показывает каждый входящий запрос, его тело и ошибку обработки.
