# `@involvex/ctrl-f5`

Headless CLI for the `@involvex/ctrl-a` gateway. This is the only publishable package in the monorepo.

```bash
# Lifecycle (spawns packages/ctrl-a, pid under data/ctrl-a.pid)
ctrl-f5 start
ctrl-f5 status
ctrl-f5 stop

# Health / demo
ctrl-f5 health
ctrl-f5 demo

# Chat (one-shot or interactive TTY)
ctrl-f5 chat "hello"
ctrl-f5 chat

# Cross-device pair — terminal QR for Expo "scan pair QR"
ctrl-f5 pair
ctrl-f5 pair --host 192.168.178.69 --token "$CTRL_GATEWAY_TOKEN"
```

`start` binds `CTRL_A_HOST` / `0.0.0.0` by default. Pair never advertises `127.0.0.1`.
