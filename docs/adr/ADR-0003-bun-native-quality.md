# ADR-0003: Bun-Native Quality Toolchain

**Status:** Accepted

**Context:** Bun ships `bun check`, `bun lint` (1,000+ rules, type-aware, ESLint-plugin compatible), and `bun fmt`. Installing ESLint and Prettier duplicates tooling.

**Decision:**

1. Use only Bun-native quality tools configured in root `bunfig.toml`.
2. Do not add `eslint`, `prettier`, or related config packages to the monorepo.
3. Optional ESLint plugins may be listed under `[lint].plugins` when a built-in rule is missing.
4. Gate CI and local work with `bun run validate` (`check` + `lint` + `fmt --check`).

**Consequences:**

- Faster installs and one config surface (`bunfig.toml`).
- Pre-commit can use `bun lint --staged --fix`.
- If Bun lint gaps block the team, revisit adding a plugin first; only then consider a second toolchain.

**See:** [CodeQuality.md](../CodeQuality.md), [Bun lint](https://bun.com/docs/runtime/lint).
