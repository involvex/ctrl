# Standalone local AI

Each device can chat without the other. Pairing is optional for sync / cloud.

**v0 try path** (5 bullets):

1. **Phone alone** — install APK → Menu → Model setup → download/import `.litertlm` → Load → Chat with cascade **On this phone**.
2. **PC alone** — run desktop → Host → local models → detect / set `llama-server` path → Providers → HF catalog → Download a GGUF → Start llama → use → chat (no cloud key required).
3. **Pair (optional)** — same Wi‑Fi → Host QR (or `ctrl-f5 pair`) → phone Scan → CLI exits after ack.
4. **Model pick** — desktop Providers → model browser → select id for next turn (after Start, refresh so the local id appears).
5. **Stuck?** — see firewall / soak notes below and [soak-v0.md](soak-v0.md).

## Matrix

| Device | Without the other                          | With the other                     |
| ------ | ------------------------------------------ | ---------------------------------- |
| Phone  | LiteRT chat + local personas/conversations | Cascade / sync / knowledge ingest  |
| PC     | Local llama / litert-lm / openai key       | Mobile as optional device provider |

## Phone (Expo)

1. **Model setup** — download or import a `.litertlm` file, then Load model.
2. Generator chip **On this phone** — send uses LiteRT only (no PC/cloud cascade).
3. Default provider order is `litert → gateway → zen`.
4. Pairing (Host QR / `ctrl-f5 pair`) is only needed for PC cascade, sync, or cloud keys on the gateway.
5. If chat shows unavailable · …, open Model setup from the banner CTA.

### Phone model files (one `.litertlm`)

`react-native-litert-lm` loads **one** resident engine. A second `loadModel` replaces the first; it does not keep two chat models in RAM. There is no on-device GGUF / llama.cpp runner on the phone.

What Model setup supports today:

- Download the default Gemma 4 E2B `.litertlm`, or import **one** `.litertlm` via the document picker (`multiple: false`).
- Persist that single path (`ctrl.mobile.litert.modelSource`), Load / Unload / Reset.
- Native `listCachedFiles()` only sees the module download cache (`filesDir/models`), not Expo import copies under `documentDirectory/models/`. The app does not call it for a catalog UI.

A multi-file picker stays out of scope until the app owns an explicit multi-path catalog (and loosens the hardcoded E2B policy). GGUF stays on desktop llama (`userData/models/*.gguf`).

## PC (Desktop / gateway)

| Backend      | Default probe              | Env                                         |
| ------------ | -------------------------- | ------------------------------------------- |
| llama-server | `http://127.0.0.1:8080/v1` | `CTRL_LLAMA_BIN`, `CTRL_LLAMA_PORT`         |
| litert-lm    | `http://127.0.0.1:9379/v1` | `CTRL_LITERT_LM_BIN`, `CTRL_LITERT_LM_PORT` |

Desktop **Host → local models**: detect binaries / running `/models`, Start / Stop, then **use** to switch the gateway provider. Providers panel includes a **model browser** (`GET /api/v1/models`) and an **HF model catalog** for pinned GGUF downloads.

### PC GGUF install (desktop)

1. Install `llama-server` (C++ binary) and point Host at it (`CTRL_LLAMA_BIN`, browse, or download-bin URL).
2. Open **Providers → HF model catalog** → **download** on a row (writes under Electron `userData/models/`). A second click skips the network when that `.gguf` is already present.
3. The downloaded file becomes the selected model (`userData/local-llama-model.json`). Host → local models shows `GGUF -m: …`.
4. **Start** llama — desktop passes `-m <path>` (unless `CTRL_LLAMA_ARGS` already includes `-m` / `--model`).
5. **use** → refresh models → pick the local id → chat.

Phone stays on `.litertlm` (Model setup); this flow is desktop-only.

Install examples (Windows PowerShell):

```powershell
# After placing binaries on disk:
setx CTRL_LLAMA_BIN "C:\path\to\llama-server.exe"
setx CTRL_LITERT_LM_BIN "C:\path\to\litert-lm.exe"
# Restart desktop so the gateway child inherits env.
```

Desktop Host can also set a binary path, pick a file, or download a backend binary from a URL when you have one.

## Skills + MCP (Host tools panel)

1. Open desktop **tools** (exclusive panel).
2. **Skills** — toggle `knowledge-assistant`, or **create / edit / delete** user skills (id, name, description, instructions, optional tool names). Builtins are toggle-only. Enabled skills append instructions to the agent profile on the next chat turn. Same authoring UI on mobile/web when paired.
3. **MCP** — enter id / name / command / args → **save**. Gateway writes `data/mcp.json`, reloads stdio servers, and remounts `mcp__*` tools. Empty command keeps the in-process demo echo stub.
4. **reload MCP** forces reconnect without changing config.

Env overrides still work: `CTRL_MCP_SERVERS` (JSON array) or `CTRL_MCP_STDIO=1` for the bundled stdio demo. File config wins when `data/mcp.json` has servers.

## Pairing

1. Desktop Host QR (CSP allows `img-src data:`) or `ctrl-f5 pair`.
2. Use **copy LAN URL** on Host (prefer `192.168.x.x`, not `127.0.0.1`).
3. Phone Scan / Connect → health + save → `POST /api/v1/pairing/ack`.
4. CLI `pair` polls until ack, then exits 0.

If connect fails: same Wi‑Fi, gateway running, firewall open, use LAN IP (not `127.0.0.1`).

### Windows firewall (one-liner)

Allow inbound TCP for the gateway port (default **7331**), or temporarily:

```powershell
New-NetFirewallRule -DisplayName "ctrl-a gateway" -Direction Inbound -Protocol TCP -LocalPort 7331 -Action Allow
```

## Backup restore smoke (R3)

Once on a working PC:

```bash
ctrl-f5 backup create --label soak
ctrl-f5 backup list
# note an id, then:
ctrl-f5 backup restore <id>
```

Or use desktop **backups** panel: create → restore. Confirm a workspace/conversation returns.

## Parked (R4+)

Operator soak rows 1–6 may still be pending on your hardware ([soak-v0.md](soak-v0.md)) — finish them when you can; they no longer block Skills/MCP, channel-inbound, or approval work.

### Channels (Discord / Slack inbound)

- **Telegram** — bot token; long-poll `getUpdates`.
- **Discord** — bot token; Gateway WebSocket (`MESSAGE_CREATE`). Enable Message Content Intent in the Discord developer portal.
- **Slack** — bot token (`xoxb-…`) + app-level token (`xapp-…` with `connections:write`) for Socket Mode inbound; subscribe the bot to `message.im` / channel messages as needed.
- Channel status `running` means the inbound loop/socket is up. Replies use the chat/channel id as the test recipient.

### Channel-inbound tool approvals

Desktop / mobile / web subscribe to `GET /ws/v1/workspaces/:id/approvals` while connected. Channel runs that need tool approval fan out there; Approve/Deny from the chat UI. With no listener, the gateway **denies immediately** (default). Set `CTRL_CHANNEL_APPROVAL_FALLBACK=timeout` to wait on the gate timer instead.

### Conversation continuity (multi-thread sync)

Phone and web brains sync **every** local conversation to its own gateway chat (append-only). Unseen host threads are pulled into the conversation list. The paired workspace id is pinned after the first successful sync.

### Device knowledge (local notes + memory)

Phone and web brains store notes, memory, and text chunks offline. Unpaired: create notes/memory and keyword-search them; LiteRT prompts include pinned memory + local hits. Paired: sync pushes creates/edits/deletes (last-write-wins) and pulls host chunks (`GET /api/v1/workspaces/:id/knowledge/chunks`). Vector/hybrid search still needs the gateway.

### Device knowledge edit/delete sync

Paired sync uses last-write-wins on notes and memory (`updatedAt`). Deletes are tombstones on the device and soft-delete (`deletedAt`) / archive on the host so a slower peer cannot resurrect them. Messages stay append-only.

### Device attachment blob download

Paired knowledge notes with a host attachment id can **download blob** on demand. Bytes stay on the host until then; sync still only replicates chunk text and metadata. Soft-deleted attachments return 404.

### Desktop HF quantization picker

Providers → HF model catalog: pick a quant (Q4_K_M default, plus Q5_K_M or Q6_K and Q8_0 where the repo publishes them), then download. Size label follows the selected quant.

Still parked:

1. Auto-download of `llama-server` / `litert-lm` binaries (pinned URL + checksum)
2. App-owned multi-path `.litertlm` catalog on phone (only if product wants replace-to-switch UX; runner still holds one engine)
3. Rust `agentd` / monetization experiments
4. Shared UI package (`ctrl-space`), logger (`ctrl-l`), config package (`ctrl-comma`)

Living order for remaining work: [ROADMAP.md](../ROADMAP.md).
