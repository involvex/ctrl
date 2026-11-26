# ctrl v0 — try guide

Local-first agent platform: phone LiteRT and PC llama/litert-lm without requiring each other.

Current workspace line: **0.2.0** (root `package.json`). The Release workflow syncs artifact names from the tag (`v0.5.0` → `ctrl-0.5.0-…`). Published tags on `origin`: **`v0.2.0`**, **`v0.3.0`**, **`v0.4.0`**, **`v0.5.0`**. Soak rows 1–6 in [`soak-v0.md`](soak-v0.md) stay pending on hardware; cutting a feature tag does **not** mark them pass.

1. **Phone** — Install the APK → Model setup → download/import `.litertlm` → Load → chat **On this phone** (PC optional). One resident `.litertlm`; no phone GGUF runner.
2. **Desktop** — Install the Windows build → Host → local models → detect / fetch → start → use → chat offline from cloud.
3. **Pair (optional)** — Same Wi‑Fi → Host QR / `ctrl-f5 pair` → phone Scan → pairing ack closes the CLI.
4. **Models** — Providers → refresh models → pick an id for the next turn.
5. **Help** — [standalone-local.md](standalone-local.md) · [soak-v0.md](soak-v0.md) · Windows firewall TCP **7331**.

Artifacts on each `v*` tag Release (via `.github/workflows/release.yml`):

| Artifact                                | Source                                                   |
| --------------------------------------- | -------------------------------------------------------- |
| Windows portable / setup / unpacked zip | `build-win`                                              |
| `ctrl-<version>-android-release.apk`    | `build-android` (`prebuild:android` + `android:release`) |

Auto-update is scaffolded — treat tagged builds as a manual install.

## Tag recipe — `v0.2.1` (after soak 1–6)

Optional polish tag. Do **not** push until [`soak-v0.md`](soak-v0.md) rows 1–6 are `pass` on your hardware. Feature tags below are independent of soak.

```bash
# on main, clean tree, after soak green:
git checkout main
git pull origin main
git tag -a v0.2.1 -m "ctrl v0.2.1 — polish + channel approvals daily-driver"
git push origin v0.2.1
```

GitHub Actions `Release` workflow then builds Windows artifacts + Android APK and attaches them to the Release.

## Tag recipe — `v0.3.0` (device knowledge) — published

Already on `origin` at the device-knowledge merge. Ship story: unpaired phone/web notes + pinned memory + local FTS in LiteRT prompts; paired append-only sync of notes/memory/chunks with the host.

## Tag recipe — `v0.4.0` (local model install) — published

Already on `origin` at the local GGUF + llama `-m` merge. Ship story: desktop HF catalog Download → `userData/models/*.gguf` → Start llama with `-m` → use → chat. `llama-server` binary still installed separately; phone stays `.litertlm`.

## Tag recipe — `v0.5.0` (knowledge sync + model tooling) — published

Already on `origin`. Covers device note/memory edit-delete with LWW tombstones, on-demand attachment blob download, desktop HF quantization picker, pinned sha256 fetch for `llama-server` / `litert-lm`, and the phone single-`.litertlm` gap note. Does **not** sign off soak rows 1–6.

Ship story: paired devices sync note/memory edits and deletes; attachments download on demand; desktop picks GGUF quantization and can fetch known-good `llama-server` / `litert-lm` by pinned URL + sha256 (skip when `CTRL_*_BIN` is set). Phone remains one resident `.litertlm`.
