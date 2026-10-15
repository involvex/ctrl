**Kurzfassung** Code-Qualität für `@involvex/ctrl` läuft ausschließlich über Bun: `bun check`, `bun lint`, `bun fmt`. Keine ESLint- oder Prettier-Packages. Bun bringt 1.000+ native Regeln (ESLint, typescript-eslint, React, unicorn, jsx-a11y, …) und kann bei Bedarf ESLint-Plugins aus npm laden.

## Quelle der Wahrheit

Root-Skript `validate`:

```bash
bun check && bun lint && bun fmt --check
```

| Befehl                        | Zweck                                      |
| ----------------------------- | ------------------------------------------ |
| `bun check`                   | TypeScript-Typen (alle Cores)              |
| `bun lint`                    | Native Linter (+ optionale ESLint-Plugins) |
| `bun lint --fix`              | Auto-Fix                                   |
| `bun lint --type-aware`       | Regeln mit Typinformationen                |
| `bun lint --staged`           | Nur gestagte Dateien (Pre-Commit)          |
| `bun lint --changed`          | Diff zur Default-Branch                    |
| `bun lint --rules`            | Alle Regeln listen                         |
| `bun lint --explain <rule>`   | Regel-Doku                                 |
| `bun lint --doctor`           | Welche Regeln nativ laufen                 |
| `bun fmt` / `bun fmt --check` | Formatieren / prüfen                       |

## `bunfig.toml` (Root)

```toml
[test]
root = "."
coverage = true

[run]
bun = true

[fmt]
semi = true
singleQuote = true
trailingComma = "es5"
tabWidth = 2

[lint]
typeAware = true
ignorePatterns = ["vendor/", "**/*.gen.ts", "dist/", "node_modules/"]
# Optional: npm ESLint plugins, z. B. "eslint-plugin-perfectionist"
plugins = []

[lint.categories]
correctness = "error"
suspicious = "warn"
perf = "warn"

[lint.rules]
"no-console" = "warn"
"eqeqeq" = ["error", "smart"]
"unicorn/prefer-node-protocol" = "error"
"@typescript-eslint/no-explicit-any" = "off"
```

`bun lint --init` legt die `[lint]`-Section an, falls sie fehlt.

## Workspace-Skripte

```json
{
  "scripts": {
    "check": "bun check",
    "lint": "bun lint",
    "format": "bun fmt --check",
    "format:write": "bun fmt",
    "validate": "bun check && bun lint && bun fmt --check"
  }
}
```

Note: do not name a script `fmt` — Bun would intercept `bun fmt` and recurse. Use `format` / `format:write` instead.

Wenn `package.json` ein `lint`-Skript hat, führt `bun lint` dieses Skript aus; innerhalb des Skripts ist `bun lint` der eigentliche Linter.

## ESLint-Plugins (ohne ESLint-CLI)

Braucht eine Regel, die nicht built-in ist:

```toml
[lint]
plugins = ["eslint-plugin-perfectionist", "./lint/plugin.js"]

[lint.rules]
"perfectionist/sort-imports" = "error"
```

Built-in Regeln bleiben an. Siehe [Bun lint plugins](https://bun.com/docs/lint/plugins).

## Pre-Commit

```sh
#!/bin/sh
bun lint --staged --fix
```

Kein `lint-staged` nötig.

## CI (GitHub Actions)

```yaml
steps:
  - uses: actions/checkout@v4
  - uses: oven-sh/setup-bun@v2
  - run: bun install
  - run: bun run validate
  - run: bun lint --max-warnings 0
```

Report-Formate: `--format json|junit|checkstyle|gitlab|sarif|unix|github`.

## Migration von ESLint/oxlint

`bun lint` liest bestehende `eslint.config.js` / `.eslintrc` / `.oxlintrc.json`. Für dieses Repo gilt: **keine** ESLint-/Prettier-Abhängigkeiten installieren. Details: [Migrate from ESLint](https://bun.com/guides/lint/migrate-from-eslint), [ADR-0003](adr/ADR-0003-bun-native-quality.md).
