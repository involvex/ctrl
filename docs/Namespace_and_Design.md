**Kurzfassung** Masterplan für `@involvex/ctrl`: Shortcut-basiertes Namensschema (`@involvex/ctrl-*`), Matrix/Hacker-Dark-Theme (Akzent `#00ff66`), Bun als alleiniger Package Manager, und die vollständige Monorepo-Architektur.

## 1. Das `@involvex/ctrl` Namens- & Paket-Schema

Das gesamte Projekt läuft unter der GitHub-Organisation und dem npm-Scope **`@involvex`**. Packages und Apps spiegeln Tastenkombinationen (`ctrl-*`) wider.

### Publish-Policy

- Nur **`@involvex/ctrl-f5`** (CLI) ist publishable.
- Root (`@involvex/ctrl`) und alle anderen Packages/Apps sind `"private": true`.

### Vollständige Shortcut-Map

| npm name               | Path                  | Rolle                                     |
| ---------------------- | --------------------- | ----------------------------------------- |
| `@involvex/ctrl`       | repo root             | Workspace-Orchestrator (private)          |
| `@involvex/ctrl-a`     | `packages/ctrl-a`     | Gateway-Daemon (Agent & All)              |
| `@involvex/ctrl-f5`    | `apps/cli`            | CLI / Hard Refresh (publishable)          |
| `@involvex/ctrl-r`     | `packages/ctrl-r`     | Runtimes & Provider-Adapter               |
| `@involvex/ctrl-s`     | `packages/ctrl-s`     | Protocol / Zod / OpenAPI                  |
| `@involvex/ctrl-space` | `packages/ctrl-space` | Shared Matrix UI (Tokens, Komponenten)    |
| `@involvex/ctrl-z`     | `packages/ctrl-z`     | Memory, SQLite, Storage                   |
| `@involvex/ctrl-c`     | `packages/ctrl-c`     | Channels                                  |
| `@involvex/ctrl-m`     | `packages/ctrl-m`     | MCP Client                                |
| `@involvex/ctrl-t`     | `packages/ctrl-t`     | Contract Tests                            |
| `@involvex/ctrl-k`     | `packages/ctrl-k`     | Knowledge                                 |
| `@involvex/ctrl-i`     | `packages/ctrl-i`     | Agent Client (typisierter Gateway-Client) |
| `@involvex/ctrl-x`     | `packages/ctrl-x`     | Agent Core (Loop, Tools, Context)         |
| `@involvex/ctrl-l`     | `packages/ctrl-l`     | Logger                                    |
| `@involvex/ctrl-comma` | `packages/ctrl-comma` | Config                                    |
| `@involvex/ctrl-slash` | `packages/ctrl-slash` | Skills                                    |

Apps `desktop` / `mobile` / `web` bleiben path-benannt unter `apps/` (nicht published). Sie hängen an `@involvex/ctrl-s` und später `ctrl-i` / `ctrl-space`.

## 2. UI/UX & Theming (Matrix / Hacker Aesthetic)

- **Dark Theme First:** Kein helles Theme; tiefstes Schwarz (`#000000` / `#0a0f0d`) als Standard.
- **Primärer Akzent:** Matrix-Grün `#00ff66` (Borders, Cursor, Live-Streams, Event-Logs).
- **Sekundär (optional):** Cyan `#00f0ff` nur für sekundäre Highlights.
- **Hintergründe:** Deep Charcoal `#111613` und Pitch Black.
- **Typografie:** Monospace durchgehend (JetBrains Mono / Fira Code) für Chat, Code und Terminal.
- **Ergonomie:** Dünne, präzise Rahmen; scharfe technische Kanten; High-Contrast-Feedback. Kein runder iOS-Look.

## 3. Aktualisierte Monorepo-Struktur

```text
ctrl/
├─ apps/
│  ├─ desktop/           # Electron (Shell, Tray, safeStorage, startet @involvex/ctrl-a)
│  ├─ mobile/            # Expo Android (Mobile Client)
│  ├─ web/               # Expo PWA (Web Client)
│  └─ cli/               # @involvex/ctrl-f5 (Terminal-Client, publishable)
├─ packages/
│  ├─ ctrl-a/            # Gateway (Bun + TS) — Phase 0
│  ├─ ctrl-s/            # Protocol (Zod, Events, OpenAPI) — Phase 0
│  ├─ ctrl-r/            # Runtime & Provider Adapter — later
│  ├─ ctrl-z/            # Memory, State & SQLite — later
│  ├─ ctrl-space/        # Shared UI — later
│  ├─ ctrl-c/            # Channels — later
│  ├─ ctrl-m/            # MCP — later
│  ├─ ctrl-t/            # Contract tests — later
│  ├─ ctrl-k/            # Knowledge — later
│  ├─ ctrl-i/            # Agent client — later
│  ├─ ctrl-x/            # Agent core — later
│  ├─ ctrl-l/            # Logger — later
│  ├─ ctrl-comma/        # Config — later
│  └─ ctrl-slash/        # Skills — later
├─ crates/               # later: agentd
├─ native/android-litert/ # later: Expo native module
└─ docs/
```

## 4. Scaffold vs. später

**Phase 0 (jetzt):** Root-Workspaces, `ctrl-s`, `ctrl-a` (`/healthz`), `apps/desktop`, `apps/mobile`, `apps/web`, `apps/cli`.

**Später anlegen:** alle übrigen `ctrl-*` Packages, `crates/`, `native/android-litert/`. Siehe [Plan.md](Plan.md) Phasenplan und [ADR-0002](adr/ADR-0002-ctrl-naming-and-publish.md).

## 5. Agent-Prompt für die Umsetzung

```markdown
You are an expert full-stack developer and systems architect. Implement the next phase of the `@involvex/ctrl` ecosystem (Universal Agent Platform) adhering strictly to these architectural guidelines:

1. **Package Manager & Runtime:**
   - Use **Bun** exclusively as package manager, script runner, and bundler.
   - The monorepo uses the `@involvex` scope (`@involvex/ctrl-a` for gateway, `@involvex/ctrl-s` for protocol, `@involvex/ctrl-space` for UI, etc.).
2. **UI/UX & Theming:**
   - Enforce a strict **Matrix / Hacker Dark Theme**. Deep black (`#000000`), charcoal containers, neon green `#00ff66`, JetBrains Mono.
3. **Architecture & Safety:**
   - Validate every process and IPC boundary using Zod schemas in `@involvex/ctrl-s`.
   - The Gateway (`@involvex/ctrl-a`) runs as an independent Bun process via WebSocket `AgentEvent` streams.
   - SQLite (`bun:sqlite`) in `@involvex/ctrl-z` — no Electron native rebuilds for DB.
4. **Quality:**
   - Use Bun-native `bun check`, `bun lint`, `bun fmt` only. No ESLint/Prettier packages.

Write modular, production-ready TypeScript optimized for terminal-first developer ergonomics.
```
