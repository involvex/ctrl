# `@involvex/ctrl`

Local agent platform: Bun gateway (`ctrl-a`), Electron desktop, Expo mobile/web, CLI (`ctrl-f5`).

## Requirements

- [Bun](https://bun.sh) `>= 1.3.4`

## Install

```bash
bun install
```

## Validate

```bash
bun run validate
```

Runs `bun check`, `bun lint`, and `bun fmt --check` (Bun-native only). Write format with `bun run format:write`.

## Contract tests

```bash
bun run test:contracts
```

Starts an ephemeral `ctrl-a`, runs `@involvex/ctrl-t` against `BASE_URL`, then stops the gateway. CI runs the same suite on every push/PR.

## Build

```bash
bun run build              # all packages + apps (desktop = vite only via build:apps)
bun run build:packages     # ctrl-s, ctrl-i, ctrl-a
bun run build:apps         # cli, desktop vite, mobile, web
bun run build:ctrl-a       # single workspace
bun run build:desktop      # win x64: unpacked + portable + NSIS installer
bun run build:desktop:dir  # win x64 unpacked only (fastest for local use)
```

Desktop packaging outputs (`apps/desktop/release/`):

| Artifact                             | Path                              |
| ------------------------------------ | --------------------------------- |
| Unpacked (recommended for daily use) | `win-unpacked/ctrl.exe`           |
| Portable                             | `ctrl-0.0.1-win-x64-portable.exe` |
| NSIS installer                       | `ctrl-0.0.1-win-x64-setup.exe`    |

The packaged app embeds a compiled `ctrl-a` sidecar under `resources/`.

## Gateway health + demo stream

```bash
bun run dev:gateway
# in another terminal:
curl http://127.0.0.1:7331/healthz
bun run --filter @involvex/ctrl-f5 start -- health
bun run --filter @involvex/ctrl-f5 start -- demo
```

Desktop (`bun run dev:desktop`) starts the gateway (LAN-bound), shows LAN URLs for Expo, and runs the WebSocket demo stream automatically.

Expo mobile/web: paste the LAN URL from desktop, tap **connect + stream demo**.

## Workspace map

| Package / App       | Role                   |
| ------------------- | ---------------------- |
| `@involvex/ctrl-s`  | Protocol (Zod schemas) |
| `@involvex/ctrl-a`  | Gateway daemon         |
| `@involvex/ctrl-f5` | CLI (publishable)      |
| `apps/desktop`      | Electron shell         |
| `apps/mobile`       | Expo Android           |
| `apps/web`          | Expo PWA               |

Full naming, theme, and roadmap: [docs/Plan.md](docs/Plan.md), [docs/Namespace_and_Design.md](docs/Namespace_and_Design.md).

## CI, Dependabot, releases

- CI / Dependabot / tag releases: [docs/ci-and-releases.md](docs/ci-and-releases.md)
- Security reporting: [SECURITY.md](SECURITY.md)

```bash
git tag v0.1.0
git push origin v0.1.0   # publishes GitHub Release + win-x64 artifacts
```

## Theme

Matrix dark: background `#000000`, accent `#00ff66`.
