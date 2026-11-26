# ROADMAP

Living backlog for `@involvex/ctrl`. Historical phase notes stay in [docs/Plan.md](docs/Plan.md). Operator soak stays in [docs/soak-v0.md](docs/soak-v0.md).

Root `package.json` is still `0.2.0` while slices 26–28 are already described as v0.3.0 / v0.4.0. Desktop packaging is still `0.0.1`. Tags (`v0.2.1`, `v0.3.0`, `v0.4.0`) are a release step after soak or an explicit cut — not a code change.

## Now

- [ ] **Known-good fetch of `llama-server` / `litert-lm`** — pinned URL plus checksum for those two binaries; skip when `CTRL_LLAMA_BIN` is set; no silent background download.

## Next

_(empty — promote from Later when Now is done)_

## Later

- [ ] Optional app-owned multi-path `.litertlm` catalog on phone (replace-to-switch only; runner still one engine) — only if product wants it.
- [ ] Rust `agentd` (Plan phase 9 / §11) — process manager → pairing/auth → storage; agent loop only with a reason; contract tests stay Bun.
- [ ] Monetization — sponsors in [docs/funding.md](docs/funding.md); needs an explicit product decision before any billing code.
- [ ] Extract `ctrl-space`, `ctrl-l`, `ctrl-comma` — only when a second caller needs shared UI tokens, logging, or config.
- [ ] Semantic reranking — hybrid search is RRF only; left out of Plan slice 11 on purpose.
- [ ] Non-MVP from Plan §10 — WhatsApp, plugin marketplace, multi-agent orchestration, inbound internet exposure, automatic skill generation, full OpenAI compatibility, separate vector database.
- [ ] CLI leftovers (only if touching `ctrl-f5`) — gateway `restart`, knowledge wrappers, channel usage text for Discord/Slack.

## Operator (not agent work)

- [ ] Soak rows 1–6 in [docs/soak-v0.md](docs/soak-v0.md) — pending on your hardware; do not push `v0.2.1` until green ([docs/RELEASE-v0.md](docs/RELEASE-v0.md)).
- [ ] Cut version tags so published versions match shipped slices (`v0.2.1` after soak; `v0.3.0` / `v0.4.0` for device knowledge and local model install).

## Done

- [x] Phases 0–8 (architecture through featured CLI)
- [x] Local-first chat (LiteRT | gateway | zen)
- [x] Vector / hybrid search + in-process HNSW
- [x] Skills + MCP config
- [x] Discord / Slack inbound
- [x] Channel-inbound tool approvals
- [x] Multi-conversation append-only sync
- [x] Skills authoring UI
- [x] Device knowledge (local notes / memory / chunks) — v0.3.0 features
- [x] Desktop HF GGUF download + llama `-m` — v0.4.0 features
- [x] Device knowledge edit/delete sync with last-write-wins tombstones
- [x] Device attachment blob download (`GET /api/v1/attachments/:id/blob`, on-demand mobile/web)
- [x] Desktop HF quantization picker (Q4_K_M / Q5_K_M or Q6_K / Q8_0 per model)
- [x] Phone model files gap documented — one resident `.litertlm`, no phone GGUF runner; no fake picker
