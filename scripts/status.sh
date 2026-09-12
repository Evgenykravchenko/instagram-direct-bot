#!/bin/sh
set -eu

project_dir=/opt/instagram-direct-bot
env_file=/etc/bot-platform/bots/instagram-direct-bot.env

docker compose --project-directory "$project_dir" --env-file "$env_file" \
  -f "$project_dir/compose.production.yaml" ps
docker compose --project-directory "$project_dir" --env-file "$env_file" \
  -f "$project_dir/compose.production.yaml" logs --tail=100 bot
