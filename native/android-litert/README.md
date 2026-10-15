# android-litert

Phase 6 on-device inference for `@involvex/ctrl` Android.

## Approach

Primary path (Expo SDK 57+):

- [`react-native-litert-lm`](https://www.npmjs.com/package/react-native-litert-lm) + `react-native-nitro-modules`
- Expo config plugin in `apps/mobile/app.json`
- Capability / thermal / battery gates in `packages/ctrl-s` (`evaluateOnDevicePolicy`, re-exported from `ctrl-r`)

This folder holds **future / optional** Kotlin scaffolding if we need a thinner Google `litertlm-android` bridge besides Nitro.

## Requirements

| Item        | Value                              |
| ----------- | ---------------------------------- |
| Android API | 26+                                |
| ABI         | `arm64-v8a` only                   |
| RAM         | ≥ model floor (≈4 GB for E2B)      |
| Backends    | CPU (default), GPU/NPU when probed |

## Policies

Before `loadModel`:

1. arm64 + LiteRT native present
2. RAM ≥ `minMemoryMb`
3. Battery ≥ 20% unless charging
4. Not in low-power mode
5. Thermal not `serious` / `critical`

See `evaluateOnDevicePolicy` unit tests.

## Build

```bash
cd apps/mobile
bun run prebuild:android
bun run android
```

x86_64 emulators will not run the engine — use a physical arm64 device.
