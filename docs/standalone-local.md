# Standalone local AI

Each device can chat without the other. Pairing is optional for sync / cloud.

## Matrix

| Device | Without the other                          | With the other                     |
| ------ | ------------------------------------------ | ---------------------------------- |
| Phone  | LiteRT chat + local personas/conversations | Cascade / sync / knowledge ingest  |
| PC     | Local llama / litert-lm / openai key       | Mobile as optional device provider |

## Phone (Expo)

1. **Model setup** — download or import a `.litertlm` file.
2. Generator chip **On this phone** — send uses LiteRT only (no PC/cloud cascade).
3. Default provider order is `litert → gateway → zen`.
4. Pairing (Host QR / `ctrl-f5 pair`) is only needed for PC cascade, sync, or cloud keys on the gateway.

## PC (Desktop / gateway)

| Backend      | Default probe              | Env                                         |
| ------------ | -------------------------- | ------------------------------------------- |
| llama-server | `http://127.0.0.1:8080/v1` | `CTRL_LLAMA_BIN`, `CTRL_LLAMA_PORT`         |
| litert-lm    | `http://127.0.0.1:9379/v1` | `CTRL_LITERT_LM_BIN`, `CTRL_LITERT_LM_PORT` |

Desktop **Host → local models**: detect binaries / running `/models`, Start / Stop, then **use** to switch the gateway provider. Providers panel includes a **model browser** (`GET /api/v1/models`).

This pass does **not** download binaries in-app — install CLIs yourself and put them on PATH (or set the env vars).

## Pairing

1. Desktop Host QR (CSP allows `img-src data:`) or `ctrl-f5 pair`.
2. Phone Scan / Connect → health + save → `POST /api/v1/pairing/ack`.
3. CLI `pair` polls until ack, then exits 0.

If connect fails: same Wi‑Fi, gateway running, firewall open, use LAN IP (not `127.0.0.1`).
