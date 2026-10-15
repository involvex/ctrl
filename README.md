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

## Build

```bash
bun run build              # all packages + apps
bun run build:packages     # ctrl-s, ctrl-a
bun run build:apps         # cli, desktop, mobile, web
bun run build:ctrl-a       # single workspace
bun run build:desktop
```

## Gateway health check

```bash
bun run dev:gateway
# in another terminal:
curl http://127.0.0.1:7331/healthz
# or:
bun run --filter @involvex/ctrl-f5 start -- health
```

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

## Theme

Matrix dark: background `#000000`, accent `#00ff66`.
