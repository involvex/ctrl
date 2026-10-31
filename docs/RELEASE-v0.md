# ctrl v0.1.0 — try guide

Local-first agent platform: phone LiteRT and PC llama/litert-lm without requiring each other.

1. **Phone** — Install the APK → Model setup → download/import `.litertlm` → Load → chat **On this phone** (PC optional).
2. **Desktop** — Install the Windows build → Host → local models → detect → start → use → chat offline from cloud.
3. **Pair (optional)** — Same Wi‑Fi → Host QR / `ctrl-f5 pair` → phone Scan → pairing ack closes the CLI.
4. **Models** — Providers → refresh models → pick an id for the next turn.
5. **Help** — [standalone-local.md](standalone-local.md) · [soak-v0.md](soak-v0.md) · Windows firewall TCP **7331**.

Artifacts: Windows desktop package + Android release APK attached to this GitHub Release.
Auto-update is scaffolded — treat this tag as a manual install.
