# `@involvex/ctrl-f5`

Headless CLI for the `@involvex/ctrl-a` gateway. This is the only publishable package in the monorepo.

```bash
# Lifecycle (spawns packages/ctrl-a, pid under data/ctrl-a.pid)
ctrl-f5 start
ctrl-f5 status
ctrl-f5 restart
ctrl-f5 stop

# Health / demo
ctrl-f5 health
ctrl-f5 demo

# Chat (one-shot or interactive TTY)
ctrl-f5 chat "hello"
ctrl-f5 chat

# Knowledge (against a running gateway)
ctrl-f5 knowledge search "notes about pairing" --mode hybrid
ctrl-f5 knowledge reindex --force
ctrl-f5 knowledge status

# Channels
ctrl-f5 channel add telegram --token "$TELEGRAM_BOT_TOKEN"
ctrl-f5 channel add discord --token "$DISCORD_BOT_TOKEN"
ctrl-f5 channel add slack --token "$SLACK_BOT_TOKEN" --app-token "$SLACK_APP_TOKEN"
ctrl-f5 channel add webhook
ctrl-f5 channel list

# Cross-device pair — terminal QR for Expo "scan pair QR"
ctrl-f5 pair
ctrl-f5 pair --host 192.168.178.69 --token "$CTRL_GATEWAY_TOKEN"
```

`start` / `restart` bind `CTRL_A_HOST` / `0.0.0.0` by default. Pair never advertises `127.0.0.1`.
