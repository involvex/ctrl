# `@involvex/ctrl-f5`

Headless CLI for the `@involvex/ctrl-a` gateway. This is the only publishable package in the monorepo.

```bash
# Health / demo (uses LAN IP when CTRL_A_URL unset)
ctrl-f5 health
ctrl-f5 demo

# Cross-device pair — print terminal QR for Expo "scan pair QR"
ctrl-f5 pair
ctrl-f5 pair --host 192.168.178.69 --token "$CTRL_GATEWAY_TOKEN"
```

Gateway should listen on `0.0.0.0:7331` (`br dev:gateway`). Pair never advertises `127.0.0.1`.
