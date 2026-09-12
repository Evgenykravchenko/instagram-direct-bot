# Локальная проверка

## 1. Автоматические проверки

```shell
npm ci
npm run format:check
npm run lint
npm run typecheck
npm test
npm run build
```

## 2. CMS

Сначала администратор применяет обновлённый bootstrap из `bot-platform-infra` к тестовой
CMS и создаёт пространство:

```shell
BOT_KEY=instagram-direct-bot \
BOT_NAME='Instagram Direct Bot' \
BOT_PLATFORM=instagram \
DIRECTUS_URL=https://ваша-cms.example \
DIRECTUS_TOKEN=... \
node scripts/create-bot.mjs
```

На production-сервере эти команды пока выполнять не нужно.

## 3. Переменные

Скопируйте `.env.example` в `.env` и заполните реальные тестовые значения. Сам файл
`.env` нельзя коммитить.

## 4. Docker

```shell
docker compose up --build
curl http://127.0.0.1:8091/health
```

Ожидаемый ответ: `{"status":"ok"}`.

## 5. Контент

Создайте минимальный опубликованный ответ `Проверка`, текстовый блок и точный ключ
`тест`. Затем добавьте fallback. Для медиа используйте небольшой тестовый JPG.

## 6. Живой webhook

1. Поднимите временный HTTPS-туннель на порт `8091`.
2. Укажите `<адрес>/webhook` и ваш verify token в Meta.
3. Отправьте аккаунту слово `тест` с другого Instagram-пользователя.
4. Проверьте текст, неизвестную фразу, командную кнопку, ссылку и фото.
5. Перезапустите контейнер во время теста и убедитесь, что событие не потерялось.

## Что считается готовностью

- все автоматические проверки зелёные;
- webhook верифицирован Meta;
- повтор одного webhook не создаёт второй ответ;
- временная ошибка Meta уходит на повторную попытку;
- медиа проходит `queued → processing → ready`;
- контент другого `bot_id` не выдаётся.
