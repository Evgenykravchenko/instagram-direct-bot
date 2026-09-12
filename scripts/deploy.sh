#!/bin/sh
set -eu

project_dir=/opt/instagram-direct-bot
env_file=/etc/bot-platform/bots/instagram-direct-bot.env

test -f "$env_file"
docker compose --project-directory "$project_dir" --env-file "$env_file" \
  -f "$project_dir/compose.production.yaml" pull
docker compose --project-directory "$project_dir" --env-file "$env_file" \
  -f "$project_dir/compose.production.yaml" up -d --remove-orphans
docker compose --project-directory "$project_dir" --env-file "$env_file" \
  -f "$project_dir/compose.production.yaml" ps
