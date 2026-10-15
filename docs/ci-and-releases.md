# CI, Dependabot, and Releases

## CI checks

Workflow: [`.github/workflows/ci.yml`](../.github/workflows/ci.yml)

| Job                   | Purpose                                                      |
| --------------------- | ------------------------------------------------------------ |
| `validate`            | `bun run validate` (check + lint + fmt)                      |
| `build-packages`      | Build `ctrl-s` / `ctrl-i` / `ctrl-a` / `ctrl-t` + CLI        |
| `contract-tests`      | `bun run test:contracts` against ephemeral gateway           |
| `desktop-package-win` | Electron `win-unpacked` smoke package                        |
| `CI`                  | Aggregate gate — **require this check** in branch protection |

### Branch protection (recommended)

On `main`, require status check **`CI`** (the aggregate job), not each leaf job.

## Dependabot

Config: [`.github/dependabot.yml`](../.github/dependabot.yml)

- Weekly updates for **Bun** dependencies and **GitHub Actions**
- Grouped PRs with `dependencies` labels

## Docs site (GitHub Pages)

Workflow: [`.github/workflows/docs.yml`](../.github/workflows/docs.yml)

- Deploys VitePress from `docs/` to **https://involvex.github.io/ctrl/**
- Triggers on pushes to `main` that touch docs (or manual `workflow_dispatch`)
- Enable **Settings → Pages → Source: GitHub Actions** once after the first deploy

Local:

```bash
bun run docs:dev
bun run docs:build
```

## Funding

Sponsor links are defined in [`.github/FUNDING.yml`](../.github/FUNDING.yml) and mirrored on the docs [Sponsor page](./funding.md) and root README.

## Security

See [SECURITY.md](../SECURITY.md) for reporting and operator hardening notes.

## Releases (tags)

Workflow: [`.github/workflows/release.yml`](../.github/workflows/release.yml)

Push a version tag to publish a GitHub Release with Windows x64 artifacts:

```bash
# after commits are on main
git tag v0.1.0
git push origin v0.1.0
```

The workflow:

1. Validates + runs contract tests
2. Syncs `package.json` versions from the tag (`v0.1.0` → `0.1.0`)
3. Builds desktop (`dir` + portable + NSIS)
4. Creates a GitHub Release attaching:
   - `ctrl-<ver>-win-x64-portable.exe`
   - `ctrl-<ver>-win-x64-setup.exe`
   - `ctrl-<ver>-win-x64-unpacked.zip`

Prerelease tags (e.g. `v0.1.0-rc.1`) are marked as prerelease automatically.
