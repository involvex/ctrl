# v0 soak matrix (R0)

Operator checklist for the standalone ship story. Automated proxies ran in-repo; device rows need a hands-on pass on your phone/PC.

## Automated (2026-10-31)

| Check                                                     | Result                               |
| --------------------------------------------------------- | ------------------------------------ |
| Cascade litert-only / offline skip unit tests             | pass (19 related tests)              |
| Pairing ack schema                                        | pass                                 |
| LAN list / litert-lm sidecar env / listModels fixtures    | pass                                 |
| Desktop CSP `img-src 'self' data:`                        | present in `apps/desktop/index.html` |
| Live probe `:8080` / `:9379` `/v1/models` on this machine | offline (no local server running)    |

## Device soak (fill during smoke)

| #   | Path                                   | Pass criteria                                   | Status      |
| --- | -------------------------------------- | ----------------------------------------------- | ----------- |
| 1   | Phone unpaired LiteRT                  | Reply without PC running                        | pending you |
| 2   | Phone generator litert while PC online | Still on-device, not Zen                        | pending you |
| 3   | Desktop Host QR                        | Image visible; scan saves; `ctrl-f5 pair` exits | pending you |
| 4   | Desktop local models                   | Start llama or litert-lm → Use → chat           | pending you |
| 5   | Model browser                          | List + select model affects next turn           | pending you |
| 6   | Cold start                             | Reboot; reconnect or stay local                 | pending you |

Tag / GitHub Release after rows 1–5 pass on your hardware. Code + unit coverage for 1–5 behaviors is in place; R1 hardens first-run copy for friends.

## Friend install checklist

1. Install [Bun](https://bun.sh) ≥ 1.3.4 (dev) **or** use the desktop installer / APK from the GitHub Release.
2. Optional local AI on PC: put `llama-server` or `litert-lm` on PATH (see [standalone-local.md](standalone-local.md)).
3. Phone: install APK → Model setup → download/import `.litertlm` → chat with **On this phone**.
4. Pair only if you want PC cascade/sync: same Wi‑Fi → Host QR → Scan.
