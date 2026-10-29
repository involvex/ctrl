# Agents.md

This file provides guidelines and context for AI coding agents working on the `@involvex/ctrl` monorepo.

## Project Overview

`@involvex/ctrl` is a local-first agent platform with a Bun gateway daemon (`ctrl-a`), Electron desktop shell, Expo mobile/web apps, and a CLI (`ctrl-f5`). It follows a modular architecture with clear separation of concerns across packages and apps. The project uses a Matrix/hacker dark theme with accent color `#00ff66`.

## Useful Commands

### Installation
```bash
# Install dependencies (requires Bun >= 1.3.4)
bun install
```

### Development
```bash
# Run gateway daemon
bun run dev:gateway

# Run desktop app (starts gateway automatically)
bun run dev:desktop

# Run mobile app (Android)
bun run dev:android

# Run CLI
bun run dev:cli
```

### Validation & Quality (Bun-native only)
```bash
# Run all checks (type check, lint, format check) - use this for validation
bun run validate

# Type checking only
bun check
bun check -p <path>        # Check specific package
bun check <files>          # Check specific files

# Linting (native Bun linter)
bun lint
bun lint --fix             # Auto-fix issues
bun lint --type-aware      # Type-aware linting
bun lint --staged          # Lint staged files
bun lint --changed         # Lint changed files vs default branch
bun lint --rules           # List all rules
bun lint --explain <rule>  # Explain a rule
bun lint --max-warnings 0  # CI strict mode

# Formatting
bun run format            # Check formatting
bun run format:write      # Write formatting
bun fmt                   # Direct format command
bun fmt --check           # Check formatting
```

### Building
```bash
# Build all packages and apps
bun run build

# Build packages only
bun run build:packages

# Build apps only
bun run build:apps

# Build specific packages
bun run build:ctrl-a
bun run build:ctrl-s
bun run build:ctrl-z
# ... etc for ctrl-c, ctrl-k, ctrl-r, ctrl-x, ctrl-m, ctrl-i, ctrl-t

# Build desktop
bun run build:desktop      # Full package (unpacked + portable + NSIS)
bun run build:desktop:dir  # Unpacked only (fastest)
bun run build:desktop:vite # Vite build only

# Build other apps
bun run build:cli
bun run build:mobile
bun run build:web
```

### Testing
```bash
# Run all tests
bun test

# Run contract tests (starts ephemeral gateway, runs ctrl-t against it)
bun run test:contracts
```

### Documentation
```bash
# Run docs site locally
bun run docs:dev

# Build docs site
bun run docs:build

# Preview docs site
bun run docs:preview
```

### Utilities
```bash
# Free gateway port if stuck
bun run gateway:free
```

## Technologies

### Core Stack
- **Runtime/Package Manager**: [Bun](https://bun.sh) >= 1.3.4 (required). Use Bun exclusively for Node.js tasks.
- **Language**: TypeScript with strict mode
- **Monorepo**: Bun workspaces (`apps/*`, `packages/*`)

### Backend/Gateway
- **Gateway**: `@involvex/ctrl-a` - Bun HTTP/WebSocket daemon
- **Database**: SQLite via `bun:sqlite` in `@involvex/ctrl-z`
- **Validation**: Zod schemas in `@involvex/ctrl-s` for all boundaries

### Frontend
- **Desktop**: Electron (Vite + React) in `apps/desktop`
- **Mobile**: Expo (React Native) in `apps/mobile` - Android focused
- **Web**: Expo Router Web/PWA in `apps/web`
- **CLI**: Bun-based CLI in `apps/cli` (`@involvex/ctrl-f5`, publishable)

### Additional Technologies
- **Protocol**: Custom WebSocket event streaming with typed events
- **UI Theme**: Matrix dark theme - background `#000000`, accent `#00ff66`, monospace fonts (JetBrains Mono/Fira Code)
- **On-device ML**: LiteRT-LM for Android (native module in `native/android-litert/`)
- **Build/Packaging**: electron-builder for desktop

## Workspace Structure

### Packages (all private except ctrl-f5 in apps)
| Package | Path | Purpose |
| --- | --- | --- |
| `@involvex/ctrl-a` | `packages/ctrl-a` | Gateway daemon (Agent & All) - HTTP/WS server, lifecycle management |
| `@involvex/ctrl-s` | `packages/ctrl-s` | Protocol - Zod schemas, events, JSON Schema/OpenAPI (source of truth for types) |
| `@involvex/ctrl-r` | `packages/ctrl-r` | Runtimes & provider adapters (OpenAI-compatible, LlamaCpp, Mock, CLI) |
| `@involvex/ctrl-z` | `packages/ctrl-z` | Memory, SQLite, storage layer with migrations |
| `@involvex/ctrl-x` | `packages/ctrl-x` | Agent core (loop, tools, context building) |
| `@involvex/ctrl-m` | `packages/ctrl-m` | MCP client (stdio JSON-RPC) |
| `@involvex/ctrl-k` | `packages/ctrl-k` | Knowledge - extraction, chunking, FTS |
| `@involvex/ctrl-c` | `packages/ctrl-c` | Channels - webhook, Telegram, Discord, Slack adapters |
| `@involvex/ctrl-i` | `packages/ctrl-i` | Typed agent client for gateway communication |
| `@involvex/ctrl-t` | `packages/ctrl-t` | Contract tests |
| `@involvex/ctrl-space` | `packages/ctrl-space` | Shared Matrix UI tokens and components |
| `@involvex/ctrl-l` | `packages/ctrl-l` | Logger |
| `@involvex/ctrl-comma` | `packages/ctrl-comma` | Config |
| `@involvex/ctrl-slash` | `packages/ctrl-slash` | Skills |

### Apps
| App | Path | Purpose |
| --- | --- | --- |
| `@involvex/ctrl-desktop` | `apps/desktop` | Electron shell - tray, autostart, updates, safeStorage |
| `@involvex/ctrl-mobile` | `apps/mobile` | Expo Android app |
| `@involvex/ctrl-web` | `apps/web` | Expo PWA web app |
| `@involvex/ctrl-f5` | `apps/cli` | CLI tool (publishable) |

## Best Practices and Guidelines

### Code Quality
- **Bun-native only**: Never use ESLint or Prettier packages. Use `bun check`, `bun lint`, `bun fmt` exclusively.
- **Validate before committing**: Always run `bun run validate` which runs check, lint, and format check.
- **Type safety**: Use strict TypeScript. All process boundaries and IPC must be validated with Zod schemas from `@involvex/ctrl-s`.
- **No `any` unless necessary**: `@typescript-eslint/no-explicit-any` is disabled, but prefer proper typing.
- **Use `node:` protocol**: `unicorn/prefer-node-protocol` is enforced - use `node:fs`, `node:path`, etc.

### Architecture Principles
- **Local-first**: Identity and transcripts live on clients. Gateway is optional for basic chat functionality.
- **Gateway as home node**: Tools, MCP, channels, backups live on the gateway. Sync is append-only when reachable.
- **Process boundaries**: Gateway runs as independent Bun process. Desktop starts/manages it. Clients communicate via HTTP/WebSocket.
- **Canonical event format**: Use the event types defined in `@involvex/ctrl-s` (see Plan.md). Don't invent custom event schemas.
- **Provider abstraction**: All LLM providers go through `ModelProvider` interface in `ctrl-r`. Adapters normalize to canonical format.
- **SQLite ownership**: Only the gateway process should own the database (`ctrl-z`). Clients never sync SQLite files peer-to-peer.
- **Secrets management**: Never store secrets in `app.db`. Use Electron's `safeStorage`, Android Keystore, etc.

### Security
- **Electron security**: `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`. Validate all IPC with Zod. Set CSP, block navigation and `window.open`.
- **Standard binding**: Bind to `127.0.0.1` by default. LAN mode (`0.0.0.0`) requires explicit activation with pairing.
- **Auth**: Gateway bearer tokens for authenticated access. Pairing codes for LAN connections.
- **Permissions**: Skills have no automatic system rights - use Permission Policy. Audit logs for sensitive operations.
- **Input validation**: Validate all external inputs at boundaries using schemas from `ctrl-s`.

### UI/UX Guidelines
- **Theme**: Matrix dark theme only. Background `#000000`, accent `#00ff66`, containers `#111613`. Monospace fonts throughout.
- **Typography**: Use JetBrains Mono or Fira Code for chat, code, and terminal.
- **Style**: Thin precise borders, sharp technical edges, high-contrast feedback. No rounded iOS-style UI.
- **Desktop UI**: Panels are exclusive (only one open at a time, Escape closes). Nav is keyboard-friendly.

### Development Guidelines
- **Package manager**: Always use `bun`. Never use npm/yarn/pnpm.
- **Imports**: Use workspace dependencies with `workspace:*`. Follow existing import patterns.
- **File operations on Windows**: Use PowerShell-compatible commands. Prefer the `write` tool for files with special characters.
- **Git**: Commits should be atomic. Follow conventional commit style when appropriate.
- **Testing**: Add contract tests in `ctrl-t` for new API endpoints/events. Use mock provider for deterministic tests.
- **Migrations**: Version SQLite migrations properly in `ctrl-z`. Schema changes need migration scripts.
- **Build outputs**: Desktop packages go to `apps/desktop/release/`. Gateway sidecar is embedded in the packaged app.

### TypeScript Configuration
- **Target**: ES2022, module ESNext with bundler resolution
- **Strict mode enabled**: strict, noUncheckedIndexedAccess, noUnusedLocals, noUnusedParameters, noImplicitReturns, noFallthroughCasesInSwitch
- **Module style**: verbatimModuleSyntax, isolatedModules, esModuleInterop
- **JSX**: react-jsx
- **No emit**: Type checking only via `bun check`

### Environment Variables
Key environment variables (see full list in codebase):
- `CTRL_HOST`, `CTRL_PORT` - Gateway binding
- `CTRL_TOKEN` - Gateway auth token
- `CTRL_LLAMA_BIN` - Path to llama-server sidecar
- `BASE_URL` - For contract tests

## Quick Reference

- **Main docs**: [README.md](README.md), [docs/Plan.md](docs/Plan.md), [docs/Namespace_and_Design.md](docs/Namespace_and_Design.md)
- **Quality docs**: [docs/CodeQuality.md](docs/CodeQuality.md)
- **CI/Releases**: [docs/ci-and-releases.md](docs/ci-and-releases.md)
- **Security**: [SECURITY.md](SECURITY.md)
- **Theme color**: `#00ff66` (Matrix green)
- **Node/Bun requirement**: Bun >= 1.3.4

For detailed architecture and phase information, consult the docs in the `docs/` directory. When in doubt about patterns, look at existing code in similar packages for conventions.
