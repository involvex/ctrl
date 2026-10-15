# ADR-0002: ctrl-* Naming and Publish Policy

**Status:** Accepted

**Context:** The monorepo needs a memorable, consistent npm scope under `@involvex`, aligned with a terminal/hacker aesthetic. Only one artifact should be published early.

**Decision:**

1. Every package uses a `ctrl-*` shortcut name (see [Namespace_and_Design.md](../Namespace_and_Design.md)).
2. Only `@involvex/ctrl-f5` (`apps/cli`) is publishable.
3. Root `@involvex/ctrl` and all other apps/packages are `"private": true`.
4. Gateway lives in `packages/ctrl-a`, not under `apps/`.

**Consequences:**

- New packages must claim a free `ctrl-*` shortcut in the Namespace table before landing.
- Desktop/mobile/web stay unpublished path apps under `apps/`.
- CLI is the only npm bin consumers install globally.

**Revisit when:** A shared library (e.g. `ctrl-s`) needs public consumption outside the monorepo.
