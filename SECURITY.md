# Security Policy

## Supported versions

| Version                | Supported                        |
| ---------------------- | -------------------------------- |
| `main` (pre-1.0)       | Yes                              |
| Tagged releases (`v*`) | Yes (latest patch of each minor) |

This project is early-stage. Prefer the latest tagged release or `main`.

## Reporting a vulnerability

**Do not open a public GitHub issue for security reports.**

1. Use [GitHub Private Vulnerability Reporting](https://github.com/involvex/ctrl/security/advisories/new) on this repository, or
2. Email **security@involvex.com** with a description, impact, and reproduction steps (if available).

Please allow up to **7 days** for an initial response. We will coordinate a fix and disclosure timeline with you.

## Scope

In scope:

- Remote code execution, auth bypass, or data exposure in `@involvex/ctrl-a` (gateway), desktop shell, CLI, or published packages
- Insecure defaults in LAN mode (`0.0.0.0` bind, missing pairing)
- Dependency vulnerabilities with a clear exploit path in this repo

Out of scope (for now):

- Social engineering / phishing
- Denial of service against your own local gateway
- Issues that only apply to unsigned Windows builds (code signing is not yet required)
- Reports without a realistic attack scenario

## Hardening notes (operators)

- Prefer `CTRL_A_LAN=0` (loopback-only) unless you intentionally expose the gateway on the LAN
- Treat LAN mode as **trusted network only** until device pairing ships (Phase 3)
- Do not publish gateway ports to the public internet
- Keep Bun and Electron builds updated via Dependabot / release tags

## Disclosure

We follow coordinated disclosure. After a fix is released, we may publish a GitHub Security Advisory summarizing the issue without unnecessary exploit detail.
