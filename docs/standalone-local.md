# Standalone local AI

Each device can chat without the other. Pairing is optional for sync / cloud.

**v0 try path** (5 bullets):

1. **Phone alone** — install APK → Menu → Model setup → download/import `.litertlm` → Load → Chat with cascade **On this phone**.
2. **PC alone** — run desktop → Host → local models → detect → start llama or litert-lm → use → chat (no cloud key required).
3. **Pair (optional)** — same Wi‑Fi → Host QR (or `ctrl-f5 pair`) → phone Scan → CLI exits after ack.
4. **Model pick** — desktop Providers → model browser → select id for next turn.
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

## PC (Desktop / gateway)

| Backend      | Default probe              | Env                                         |
| ------------ | -------------------------- | ------------------------------------------- |
| llama-server | `http://127.0.0.1:8080/v1` | `CTRL_LLAMA_BIN`, `CTRL_LLAMA_PORT`         |
| litert-lm    | `http://127.0.0.1:9379/v1` | `CTRL_LITERT_LM_BIN`, `CTRL_LITERT_LM_PORT` |

Desktop **Host → local models**: detect binaries / running `/models`, Start / Stop, then **use** to switch the gateway provider. Providers panel includes a **model browser** (`GET /api/v1/models`).

Install examples (Windows PowerShell):

```powershell
# After placing binaries on disk:
setx CTRL_LLAMA_BIN "C:\path\to\llama-server.exe"
setx CTRL_LITERT_LM_BIN "C:\path\to\litert-lm.exe"
# Restart desktop so the gateway child inherits env.
```

Desktop Host can also set a binary path, pick a file, or download from a URL when you have one.

## Skills + MCP (Host tools panel)

1. Open desktop **tools** (exclusive panel).
2. **Skills** — toggle `knowledge-assistant` (or a user skill under `data/skills/`). Enabled skills append instructions to the agent profile on the next chat turn.
3. **MCP** — enter id / name / command / args → **save**. Gateway writes `data/mcp.json`, reloads stdio servers, and remounts `mcp__*` tools. Empty command keeps the in-process demo echo stub.
4. **reload MCP** forces reconnect without changing config. Mobile/web can toggle skills; add MCP from the Host (it owns the daemon).

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

Operator soak rows 1–5 may still be pending on your hardware ([soak-v0.md](soak-v0.md)) — finish them when you can; they no longer block Skills/MCP work.

Still parked:

1. Discord / Slack **inbound** (outbound already works)
2. Device↔host incremental sync beyond backups
3. Rust `agentd` / monetization experiments
4. Shared UI package (`ctrl-space`), logger (`ctrl-l`), config package (`ctrl-comma`)
