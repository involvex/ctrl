# Threat model (Phase 2)

Scope: local gateway (`ctrl-a`) with sandboxed tools, approval UI, MCP stdio, and LLM-native tool calling. LAN pairing is out of scope until Phase 3.

## Assets

- Conversation history and audit log in SQLite (`ctrl-z`)
- Sandbox filesystem under `CTRL_SANDBOX_ROOT`
- Provider API keys in process env (not in DB)
- Host shell via allowlisted `shell` tool

## Trust boundaries

| Boundary                                | Trust                                             |
| --------------------------------------- | ------------------------------------------------- |
| Renderer / Expo / CLI → gateway HTTP/WS | Untrusted input; Zod at edges                     |
| Gateway → provider HTTP                 | External; keys never returned to clients          |
| Gateway → sandbox FS/shell              | Constrained by jail + allowlist                   |
| MCP stdio subprocess                    | Treat remote tools as high-risk; require approval |

## Threats & controls

| Threat                    | Control                                                                                     |
| ------------------------- | ------------------------------------------------------------------------------------------- |
| Path traversal via `fs_*` | `Sandbox.resolve` realpath + prefix check                                                   |
| Arbitrary shell           | Allowlist + reject metacharacters `;                                                        | &`$<>` |
| Silent high-risk tools    | `requiresApproval` / profile `requireApprovalFor` + UI gate                                 |
| Stuck approvals           | Approval timeout → `timeout` decision                                                       |
| Run runaway               | Profile `runTimeoutMs` + client `run.cancel` / AbortSignal                                  |
| Prompt injection → tool   | `/tool` and LLM tool calls both gated by `requiresApproval` / profile policy + ApprovalGate |
| Audit gaps                | Append-only `audit_logs` for tool/approval/run lifecycle                                    |

## Non-goals (this phase)

- Multi-tenant auth, LAN exposure, TLS
- MCP HTTP/SSE transport (stdio only)
- OS-level containers / seccomp

## Review triggers

Revisit before enabling LAN (Phase 3) and before connecting untrusted MCP servers.
