# ROADMAP

Living backlog for `@involvex/ctrl`. Historical phase notes stay in [docs/Plan.md](docs/Plan.md). Operator soak stays in [docs/soak-v0.md](docs/soak-v0.md).

Root `package.json` is still `0.2.0` (Release workflow syncs from the tag). Desktop packaging is still `0.0.1` in-repo until a tag cut. Published on `origin`: `v0.2.0`, `v0.3.0`, `v0.4.0`, `v0.5.0` (APK incomplete), `v0.5.1`, `v0.6.0`. Optional `v0.2.1` remains soak-gated.

## Now

_(empty — promote from Later when ready)_

## Next

_(empty)_

## Later

- [ ] Share phone LiteRT catalog: free announcement draft in SHARE.md
- [ ] Rust `agentd` (Plan phase 9 / §11) — process manager → pairing/auth → storage; agent loop only with a reason; contract tests stay Bun.
- [ ] Monetization — sponsors in [docs/funding.md](docs/funding.md); needs an explicit product decision before any billing code.
- [ ] Extract `ctrl-space`, `ctrl-l`, `ctrl-comma` — only when a second caller needs shared UI tokens, logging, or config.
- [ ] Semantic reranking — hybrid search is RRF only; left out of Plan slice 11 on purpose.
- [ ] Non-MVP from Plan §10 — WhatsApp, plugin marketplace, multi-agent orchestration, inbound internet exposure, automatic skill generation, full OpenAI compatibility, separate vector database.

## Operator (not agent work)

- [ ] Soak rows 1–6 in [docs/soak-v0.md](docs/soak-v0.md) — pending on your hardware; do not push `v0.2.1` until green ([docs/RELEASE-v0.md](docs/RELEASE-v0.md)). Cutting `v0.5.0` does not mark soak pass.
- [x] Cut `v0.3.0` / `v0.4.0` for device knowledge and local model install (on `origin`).
- [x] Cut `v0.5.0` — knowledge edit/delete + attachment blobs + HF quant picker + pinned local-bin fetch ([docs/RELEASE-v0.md](docs/RELEASE-v0.md)). Android APK job failed (foojay portal); use `v0.5.1`.
- [x] Cut `v0.5.1` — skip flaky foojay-resolver portal fetch so Release publishes APK ([docs/RELEASE-v0.md](docs/RELEASE-v0.md)).
- [x] Cut `v0.6.0` — CLI leftovers: restart, knowledge wrappers, Discord/Slack channel add ([docs/RELEASE-v0.md](docs/RELEASE-v0.md)).

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
- [x] Known-good fetch of `llama-server` / `litert-lm` (pinned URL + sha256; skip when CTRL_*_BIN set)
- [x] CLI leftovers — `ctrl-f5 restart`, knowledge search/reindex/status, Discord/Slack channel add + usage
- [x] Phone multi-path `.litertlm` catalog (replace-to-switch; one engine; no phone GGUF)
