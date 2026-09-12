# Подготовка production

Сейчас проект не развёрнут. Этот документ фиксирует дальнейший безопасный порядок.

## Общая платформа

Бот подключается к существующим `directus`, PostgreSQL и сети
`bot_platform_backend`. Отдельный Directus, Redis или публичная база ему не нужны.
Для очереди webhook создаётся отдельная база или отдельный пользователь и схема в общей
PostgreSQL-инфраструктуре — данные приложения не смешиваются с таблицами Directus.

## До первого деплоя

1. Применить additive bootstrap CMS и создать `instagram-direct-bot`.
2. Создать PostgreSQL database/user для очереди Instagram.
3. Положить env в `/etc/bot-platform/bots/instagram-direct-bot.env` с правами `600`.
4. Создать GitHub repository и включить protection для `main`.
5. Добавить self-hosted runner label `instagram-direct-prod`.
6. Выпустить SemVer-версию через workflow Release.
7. Добавить маршрут Tailscale Funnel только к `/webhook` контейнера.
8. Зарегистрировать callback в Meta и выполнить smoke test.

## Обновление и откат

Deploy workflow принимает уже опубликованную версию образа. `latest` не используется.
Для отката повторно запускается Deploy с предыдущим номером версии.

## Наблюдение

```shell
/opt/instagram-direct-bot/scripts/status.sh
```

В логах не должно быть access token, app secret или полного содержимого сообщений.
События со статусом `dead` остаются в `instagram_events` для диагностики.

## Отдельная проверка Meta

Attachment Upload и отправку полученного `attachment_id` необходимо проверить реальным
аккаунтом до релиза. API-вызовы покрыты тестами, но sandbox не заменяет живой ответ Meta.
