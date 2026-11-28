# ctrl v0 — try guide

Local-first agent platform: phone LiteRT and PC llama/litert-lm without requiring each other.

Current workspace line: **0.2.0** (root `package.json`). The Release workflow syncs artifact names from the tag (`v0.7.0` → `ctrl-0.7.0-…`). Published tags on `origin`: **`v0.2.0`**, **`v0.3.0`**, **`v0.4.0`**, **`v0.5.0`** (APK incomplete), **`v0.5.1`**, **`v0.6.0`**. Cut **`v0.7.0`** with the recipe below (phone LiteRT catalog). Soak rows 1–6 in [`soak-v0.md`](soak-v0.md) stay pending on hardware; cutting a feature tag does **not** mark them pass.

1. **Phone** — Install the APK → Model setup → download/import `.litertlm` into the catalog → pick active → Load → chat **On this phone** (PC optional). One resident engine (replace-to-switch); no phone GGUF runner.
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

## Tag recipe — `v0.5.0` (knowledge sync + model tooling) — published (APK incomplete)

Already on `origin`. Feature contents match `v0.5.1`. The Release workflow’s `build-android-apk` failed resolving `foojay-resolver-convention` from the Gradle Plugin Portal; Windows artifacts built but `github-release` was skipped. Use **`v0.5.1`** for installable APK + Release assets.

## Tag recipe — `v0.5.1` (Android release harden) — published

Already on `origin`. Skips the flaky `org.gradle.toolchains.foojay-resolver-convention` portal fetch in `@react-native/gradle-plugin` (JDK 17 already from `setup-java` / local `JAVA_HOME`). Same product features as `v0.5.0`, plus reliable Android `assembleRelease` in CI.

## Tag recipe — `v0.6.0` (CLI leftovers) — published

Already on `origin` at the CLI leftovers merge (#36). Ship story: `ctrl-f5 restart`, thin `knowledge search|reindex|status`, Discord/Slack `channel add` + usage/completions. Soak rows 1–6 stay independent.

```bash
# on main, clean tree (already cut — keep for reference):
git checkout main
git pull origin main
git tag -a v0.6.0 -m "ctrl v0.6.0 — CLI restart, knowledge wrappers, Discord/Slack channel add"
git push origin v0.6.0
```

## Tag recipe — `v0.7.0` (phone LiteRT catalog)

Ship story: app-owned multi-path `.litertlm` catalog on phone (PR #38). Model setup keeps several paths; switching unloads the current LiteRT engine and loads the next (one engine in RAM — replace-to-switch, not dual load). Download the default Gemma E2B or import from storage. GGUF stays on desktop. Free announcement draft: [`SHARE.md`](../SHARE.md) (human posts). Soak rows 1–6 stay independent.

```bash
# on main, clean tree, after release-notes merge:
git checkout main
git pull origin main
git tag -a v0.7.0 -m "ctrl v0.7.0 — phone multi-path LiteRT catalog (replace-to-switch)"
git push origin v0.7.0
```

Confirm GitHub Actions `Release` completes `build-android` and `github-release` (APK attached) before treating the tag as installable.
