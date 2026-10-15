# Threat model (Phase 3)

Scope: local gateway (`ctrl-a`) with sandboxed tools, approval UI, MCP stdio, LLM tool calling, Electron desktop host (tray, autostart, updater, safeStorage), optional llama-server sidecar, and LAN pairing via bearer token.

## Assets

- Conversation history and audit log in SQLite (`ctrl-z`)
- Sandbox filesystem under `CTRL_SANDBOX_ROOT`
- Provider API keys in Electron `safeStorage` (and/or process env)
- Gateway pairing token in `safeStorage` → `CTRL_GATEWAY_TOKEN`
- Host shell via allowlisted `shell` tool
- Optional local model weights / llama-server process

## Trust boundaries

| Boundary                                | Trust                                                     |
| --------------------------------------- | --------------------------------------------------------- |
| Renderer / Expo / CLI → gateway HTTP/WS | Untrusted input; Zod at edges; bearer token when set      |
| Gateway → provider HTTP / llama-server  | External or local sidecar; keys never returned to clients |
| Gateway → sandbox FS/shell              | Constrained by jail + allowlist                           |
| MCP stdio subprocess                    | Treat remote tools as high-risk; require approval         |
| Electron main → renderer                | contextIsolation + sandbox; IPC Zod-validated             |

## Threats & controls

| Threat                    | Control                                                                                                                    |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Path traversal via `fs_*` | `Sandbox.resolve` realpath + prefix check                                                                                  |
| Arbitrary shell           | Allowlist + reject metacharacters                                                                                          |
| Silent high-risk tools    | `requiresApproval` / profile `requireApprovalFor` + UI gate                                                                |
| Stuck approvals           | Approval timeout → `timeout` decision                                                                                      |
| Run runaway               | Profile `runTimeoutMs` + client `run.cancel` / AbortSignal                                                                 |
| Prompt injection → tool   | `/tool` and LLM tool calls both gated by approval                                                                          |
| Audit gaps                | Append-only `audit_logs` for tool/approval/run lifecycle                                                                   |
| LAN eavesdrop / hijack    | Default bind `0.0.0.0` for Expo/LAN; set `CTRL_GATEWAY_TOKEN` on untrusted networks; `/healthz` public; TLS still non-goal |
| Secret theft from disk    | Desktop secrets via `safeStorage` (DPAPI / Keychain); not stored in `app.db`                                               |
| Unexpected autostart      | Explicit user toggle via `app.setLoginItemSettings`                                                                        |
| Malicious update payload  | `electron-updater` only in packaged builds; GitHub Releases as publish source                                              |

## Non-goals (this phase)

- Multi-tenant auth, mutual TLS, certificate pinning
- MCP HTTP/SSE transport (stdio only)
- OS-level containers / seccomp
- Full device identity / revocation UI beyond token rotate

## Review triggers

Revisit before exposing the gateway beyond a trusted LAN, before connecting untrusted MCP servers, and before enabling auto-download of model weights.
