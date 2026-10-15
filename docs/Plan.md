# `@involvex/ctrl` – Universal Agent Plan

Lokale Agent-Plattform mit Expo (Android/Web), Electron (Desktop), Bun-Gateway (`@involvex/ctrl-a`) und späterem Rust-Backend.

## 1. Leitentscheidungen

- **Gateway als eigener Prozess:** Bun + TypeScript in `packages/ctrl-a`, kompiliert mit `bun build --compile`. Eingebettet, lokaler Daemon oder LAN-Server.
- **Desktop-Shell:** Electron. Startet und überwacht das Gateway; Tray, Autostart, Updates, Secrets.
- **Mobile und Web:** Separate Expo-Apps (`apps/mobile`, `apps/web`) mit Expo Router.
- **Alle Clients sind gleichwertig:** Desktop-Renderer, Android, PWA und CLI sprechen nur das Gateway-Protokoll (`@involvex/ctrl-s` / später `ctrl-i`).
- **Rust später:** Backend `agentd` ersetzt das Gateway schrittweise, abgesichert durch Contract-Tests (`ctrl-t`).
- **Nicht im Scope:** Flutter, Ionic als Hauptarchitektur, alles in Rust.
- **Naming & Publish:** Siehe [Namespace_and_Design.md](Namespace_and_Design.md) und [ADR-0002](adr/ADR-0002-ctrl-naming-and-publish.md). Nur `ctrl-f5` ist publishable.
- **Quality:** Bun-native only — [CodeQuality.md](CodeQuality.md), [ADR-0003](adr/ADR-0003-bun-native-quality.md).

## 2. Architektur

```text
Electron Desktop | Expo Android | Expo Web/PWA | CLI (ctrl-f5)
        \            |              |           /
         ------- AgentClient (HTTP / WebSocket) -------
                          |
                 Gateway @involvex/ctrl-a (Bun + TS)
   Sessions | Workspaces | Agents | Jobs | Events | Auth
   Agent Loop | Tool Router | Context Builder | Permissions
   Provider Registry | MCP | Skills | Knowledge | Memory
        |                    |                  |
  Provider Adapter     Runtime Adapter    Channel Adapter
  OpenAI-kompatibel    llama-server       Webhook, Telegram
  Custom HTTP, CLI     LiteRT-LM          Discord, Slack
```

Regel: Die UI spricht nie direkt mit einem Provider, sondern immer über `AgentClient` und das Gateway.

## 3. Monorepo

```text
ctrl/
├─ apps/
│  ├─ desktop/        # Electron: main, preload, renderer (Vite + React)
│  ├─ mobile/         # Expo Android
│  ├─ web/            # Expo Router Web/PWA
│  └─ cli/            # @involvex/ctrl-f5 (publishable)
├─ packages/
│  ├─ ctrl-a/         # Gateway (Bun Binary)
│  ├─ ctrl-s/         # Protocol: Zod, Events, JSON Schema / OpenAPI
│  ├─ ctrl-r/         # Runtimes & Providers
│  ├─ ctrl-z/         # Memory, SQLite, Storage
│  ├─ ctrl-space/     # Shared Matrix UI tokens / components
│  ├─ ctrl-c/         # Channels
│  ├─ ctrl-m/         # MCP Client
│  ├─ ctrl-t/         # Contract tests
│  ├─ ctrl-k/         # Knowledge
│  ├─ ctrl-i/         # Typed Agent Client
│  ├─ ctrl-x/         # Agent Core (loop, tools, context)
│  ├─ ctrl-l/         # Logger
│  ├─ ctrl-comma/     # Config
│  └─ ctrl-slash/     # Skills
├─ crates/            # later: agentd
├─ native/android-litert/
└─ docs/
```

### Scaffold vs. later packages

| Jetzt (Phase 0)                        | Später                                                                                                                             |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Root workspaces, `bunfig.toml`         | —                                                                                                                                  |
| `packages/ctrl-s`, `packages/ctrl-a`   | `ctrl-r`, `ctrl-z`, `ctrl-space`, `ctrl-c`, `ctrl-m`, `ctrl-t`, `ctrl-k`, `ctrl-i`, `ctrl-x`, `ctrl-l`, `ctrl-comma`, `ctrl-slash` |
| `apps/desktop`, `mobile`, `web`, `cli` | Electron lifecycle, LAN pairing, packaging                                                                                         |
| Docs + ADRs                            | `crates/`, `native/android-litert/`, threat-model                                                                                  |

**UI-Sharing:** Types, Hooks, API-Client, State Machines, Markdown-Renderer, Theme-Tokens und Form-Schemas über `ctrl-space` / `ctrl-i` / `ctrl-s`. Das Desktop-UI (Split-Panes, Shortcuts, Tray) bleibt **Vite + React**, nicht React Native Web als Primary.

Theme-Akzent: `#00ff66` (siehe Namespace).

## 4. Desktop-Host mit Electron

### Prozessmodell

```text
Electron Main
 ├─ Single-Instance-Lock
 ├─ Gateway-Child-Process (ctrl-a Binary, 127.0.0.1)
 ├─ Tray, Autostart, Updater, safeStorage
 └─ BrowserWindow (Renderer, Vite + React)
       └─ Preload: schmale, typisierte IPC-API
```

### Regeln

- Der Renderer nutzt HTTP/WebSocket zum Gateway. IPC nur für Native: Dateidialoge, Tray, Notifications, Autostart, Secrets.
- `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`. Jede IPC-Nachricht mit Zod (`ctrl-s`) validieren.
- CSP setzen, Navigation und `window.open` blockieren.
- SQLite liegt im Gateway (`bun:sqlite` via `ctrl-z`). Keine Native-Module-Rebuilds für Electron.
- Gateway-Token in `safeStorage`; Übergabe per Env oder Stdin.
- Sidecars (`llama-server`) verwaltet der `RuntimeManager` im Gateway (`ctrl-r`), nicht Electron.

### Gateway-Lifecycle

1. Electron startet die Binary mit zufälligem oder konfiguriertem Port.
2. Wartet auf `/healthz`.
3. Bei Absturz: Restart mit exponentiellem Backoff.
4. Beim Beenden: SIGTERM, Timeout, dann Kill.
5. Optional: Daemon-Modus nach UI-Close.

### Betriebsmodi

| Modus        | Bindung                      | Zweck                             |
| ------------ | ---------------------------- | --------------------------------- |
| embedded     | Prozess-intern oder Loopback | Android, einfache Desktop-Nutzung |
| local-daemon | 127.0.0.1:7331               | Desktop, CLI, IDE-Plugins         |
| lan-server   | 0.0.0.0:7331                 | nur explizit aktivierbar          |

LAN: Pairing-Code, Token pro Gerät, Widerruf, Origin/IP-Checks, Rate Limiting, Audit Log, optional TLS.

## 5. Provider- und Runtime-Abstraktion

Intern gilt ein kanonisches Format (in `ctrl-s`), nicht das OpenAI-Schema.

```ts
export interface ModelProvider {
  id: string;
  capabilities(): Promise<ModelCapabilities>;
  listModels(): Promise<ModelDescriptor[]>;
  generate(
    req: GenerateRequest,
    ctx: ProviderContext
  ): AsyncIterable<AgentEvent>;
  cancel?(runId: string): Promise<void>;
}

export type AgentEvent =
  | { type: 'run.started'; runId: string }
  | { type: 'message.delta'; text: string }
  | { type: 'reasoning.delta'; text: string }
  | { type: 'tool.requested'; call: ToolCall }
  | { type: 'tool.started'; callId: string }
  | { type: 'tool.completed'; callId: string; result: unknown }
  | { type: 'usage.updated'; usage: TokenUsage }
  | { type: 'run.completed'; finishReason: string }
  | { type: 'run.failed'; error: SerializedError };
```

Adapter v1 (`ctrl-r`): `OpenAICompatibleProvider`, `CliProvider`, `MockProvider`, `LlamaCppProvider`.

### Lokale Runtimes

- **Desktop:** Gateway verwaltet `llama-server` als Sidecar.
- **Android:** Zuerst externer Endpoint (Desktop-Gateway im LAN); später LiteRT-LM Native Module.

## 6. Datenmodell und Speicher

```text
Workspace
├─ Agents (Instructions, Modell, Tools, MCP, Skills, Memory- und Permission-Policy)
├─ Conversations (Messages, Runs, Tool Calls, Attachments, Branches)
├─ Knowledge Sources, Skills, MCP Servers, Provider Profiles, Policies
```

```text
data/  app.db | blobs/ | workspaces/ | skills/ | knowledge/ | models/ | logs/
```

- Secrets nicht in `app.db`: Desktop `safeStorage`, Android Keystore.
- Context, Knowledge, Memory, Skills getrennt.
- Skills ohne automatische Systemrechte — Permission Policy.
- Versionierte Migrationen; genau ein Backend besitzt die DB.

## 7. Channels

Channels (`ctrl-c`) sind dünne Transportadapter (`start`, `stop`, `sendMessage`, `onMessage`).

Reihenfolge: Webhook, Telegram, Discord, Slack, WhatsApp zuletzt.

Identitäten: `ExternalUser → ChannelIdentity → LocalUser → Workspace-Rechte`.

## 8. API

Interne API unter `/api/v1`: Workspaces, Conversations, Runs, Providers, Models, Skills, MCP, Pairing.

Kompatibilitätsschicht: `/v1/models`, `/v1/chat/completions`, `/v1/responses`, `/v1/embeddings` — Adapter auf den Core, nicht das Domain-Modell.

## 9. Phasenplan

**Phase 0 – Architecture Spike:** Bun Workspace, Expo Android/Web, Electron-Shell, `ctrl-s`, WebSocket-Streaming, Electron startet Gateway-Binary, Android verbindet sich im LAN. Abbruchkriterium: Dieselbe Conversation auf Desktop und Android, Streaming auf beiden, keine Provider-Logik in der UI.

**Phase 1 – Chat MVP:** Workspace-/Conversation-CRUD, Streaming, OpenAI-kompatibler Provider, Markdown/Code, Stop/Retry, SQLite (`ctrl-z`), Export/Import, Mock Provider.

**Phase 2 – Agent Runtime:** Tool Registry, Approval-UI, Shell-/FS-Tool mit Sandbox, Agent Profiles, Cancellation, Timeouts, Audit Log, MCP (`ctrl-m`).

**Phase 3 – Desktop Host:** Electron-Lifecycle, Tray, Autostart, Updater, `safeStorage`, `llama-server`-Sidecar, lokaler OpenAI-Endpoint, LAN-Pairing, Packaging.

**Phase 4 – Personal Knowledge:** Attachments, Extraktion, Chunking, FTS vor Vector Search, Memory-Review-UI, Context Inspector (`ctrl-k` / `ctrl-z`).

**Phase 5 – Channels:** Telegram, Discord, Slack, Identity Mapping, Queue/Retry, Rate Limits (`ctrl-c`).

**Phase 6 – On-Device-Inferenz (Android):** Native Module, LiteRT-LM, Capability Detection, Thermal/Battery-Policies.

**Phase 7 – Sync (host-centric):** Gateway owns the DB. Clients never sync SQLite files peer-to-peer. MVP = on-host backup snapshots (create / list / restore) of workspace exports under `data/backups/`; desktop UI + contract tests. Later = passphrase-encrypted backups. Incremental pull/push between devices is out of MVP (see §10).

**Phase 8 – Featured CLI (`ctrl-f5`):** Publishable ops tool after Sync. Full local ops: config file (`CTRL_*` / `~/.config/ctrl/config.json`), gateway start/stop/restart/status (spawn `ctrl-a`), pairing/token, workspaces + interactive/one-shot chat (`streamChat`), thin wrappers for knowledge/channels. Shell tab-completions for **bash** and **PowerShell** (`ctrl-f5 completion bash|powershell`). Speaks only HTTP/WS protocol via `ctrl-i` (prep for Rust `agentd`).

**Phase 9 – Rust-Backend (optional):** Siehe Abschnitt 11 (was Phase 8).

## 10. Nicht ins MVP

WhatsApp, Cross-Device-Konfliktlösung, autonomes Long-Term-Memory, eigener Vector-DB-Server, Model-Downloader, eingebettetes Android-LLM, Plugin-Marketplace, Multi-Agent-Orchestrierung, Internetzugriff von außen, automatische Skill-Generierung, volle OpenAI-Kompatibilität.

## 11. Weg zum Rust-Backend (`agentd`)

### Voraussetzungen

1. `ctrl-s` ist Quelle der Wahrheit (JSON Schema / OpenAPI).
2. Contract-Tests (`ctrl-t`) gegen jedes Backend über HTTP/WebSocket.
3. Ein Prozess besitzt die DB; Schema versioniert.
4. CLI spricht nur das Protokoll.

### Migrationsreihenfolge

1. RuntimeManager / Process-Manager als Rust-Sidecar.
2. Pairing, Auth, LAN-Server.
3. Storage-Layer bei Bedarf (Schema vorher einfrieren).
4. Agent Loop nur bei klarem Grund.

Typen für Rust aus dem Schema (`typify`, `progenitor`).

## 12. Contract-Test-Strategie

- **Ort:** `packages/ctrl-t`, unabhängig vom Backend; Ziel über `BASE_URL`.
- **Fixtures:** Request/Response- und Event-Sequenzen.
- **Mock Provider:** deterministische Events.
- **Prüfungen:** JSON Schema, Event-Reihenfolge, Auth/Pairing, Cancel/Timeouts, Migrationen.
- **CI:** Gegen Bun-Gateway bei jedem Commit; später parallel gegen `agentd`.

## 13. Technische Leitplanken

- Zod an jeder Prozessgrenze (`ctrl-s`), auch IPC.
- Strukturierte Events und `AbortSignal` überall.
- Provider Capability Detection.
- Migrationsfähiges SQLite; getrennte Secrets.
- Permission Policy und Audit Log.
- Standardbindung `127.0.0.1`.
- Threat Model in `docs/threat-model` vor Phase 2 und vor LAN.

## 14. ADR-0001: Electron als Desktop-Runtime

**Status:** Akzeptiert

**Kontext:** Desktop soll lokales Gateway starten, Tray, Autostart, Updates und Secrets bieten und TypeScript mit dem Monorepo teilen.

**Entscheidung:** Electron als Shell. Gateway bleibt eigener Bun-Prozess (`ctrl-a`). Renderer ist normaler Gateway-Client; IPC nur für Native.

**Konsequenzen:** Höherer RAM/Bundle akzeptiert; CI-Matrix früh; Security-Checkliste pflegen; Tauri später möglich, weil Renderer reines Web ist.

**Alternativen:** Tauri 2, Ionic/Capacitor, Flutter.

## 15. Nächste Schritte

1. Monorepo mit Bun Workspaces anlegen; `ctrl-s` und `ctrl-a` (`/healthz`) — **done**.
2. Electron-Shell mit Gateway-Lifecycle — **done**.
3. Expo-Clients im LAN + WebSocket-Demo-Stream (`/ws/v1/demo`, `@involvex/ctrl-i`) — **done**.
4. Contract-Tests (`ctrl-t`) und CI-Matrix — **done**.
5. Dependabot, SECURITY.md, tag→GitHub Release workflow — **done** (see [ci-and-releases.md](ci-and-releases.md)).
6. Phase 1 Chat MVP — **done**: `ctrl-z` SQLite, workspace/conversation/message API, `ctrl-r` providers (mock + OpenAI-compatible), Markdown chat UI, export/import, contract tests.
7. Phase 2 Agent Runtime — **done**: `ctrl-x` tool registry + sandbox shell/fs, approval gate + desktop UI, cancel/timeouts, audit log, agent profiles, `ctrl-m` MCP stdio JSON-RPC, LLM-native tool calling (OpenAI-compatible + mock `!call`).
8. Phase 3 Desktop Host — **done**: Tray + close-to-tray, autostart, electron-updater scaffold, `safeStorage` (gateway token + OpenAI key), gateway bearer auth / LAN pairing, `ctrl-r` llama-server sidecar (`CTRL_LLAMA_BIN`), packaging via electron-builder.
9. Phase 4 Personal Knowledge — **done**: `ctrl-k` extract/chunk/FTS, attachments + blobs in `ctrl-z` (schema v3), memory review + context inspector APIs/UI.
10. Phase 5 Channels — **done**: `ctrl-c` adapters (webhook + mock telegram/discord/slack), identity mapping, outbox queue/retry/rate limits, gateway hooks + desktop panel.
11. Phase 6 On-Device Inference (Android) — **done**: LiteRT-LM Expo plugin (`react-native-litert-lm`), capability probe (ABI/RAM/battery), thermal/battery policy in `ctrl-s` (re-exported from `ctrl-r`), mobile `/on-device` UI, `native/android-litert` docs.
12. Phase 7 Sync — **done** (MVP): host backups under `data/backups/` (`BackupStore`), `/api/v1/backups` create/list/get/restore, desktop panel, contracts. Encrypted backups later. No device↔device SQLite sync.
13. Phase 8 Featured CLI (`ctrl-f5`) — **in progress**: LAN pair QR (`ctrl-f5 pair` + Expo scan); gateway `0.0.0.0`; Metro host auto-fill. Next: lifecycle + chat + bash/PowerShell completions.
14. Phase 9 Rust `agentd` — optional.
