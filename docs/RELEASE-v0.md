# ctrl v0 — try guide

Local-first agent platform: phone LiteRT and PC llama/litert-lm without requiring each other.

Current workspace line: **0.2.0** (root `package.json`). Tagged GitHub Releases sync artifact names to the tag (`v0.2.0` → `ctrl-0.2.0-…`).

1. **Phone** — Install the APK → Model setup → download/import `.litertlm` → Load → chat **On this phone** (PC optional).
2. **Desktop** — Install the Windows build → Host → local models → detect → start → use → chat offline from cloud.
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

Do **not** push until [`soak-v0.md`](soak-v0.md) rows 1–6 are `pass` on your hardware.

```bash
# on main, clean tree, after soak green:
git checkout main
git pull origin main
git tag -a v0.2.1 -m "ctrl v0.2.1 — polish + channel approvals daily-driver"
git push origin v0.2.1
```

GitHub Actions `Release` workflow then builds Windows artifacts + Android APK and attaches them to the Release.
