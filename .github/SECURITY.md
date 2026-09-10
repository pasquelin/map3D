# Security Policy

## Supported versions

map3d is a `0.x` library: only the **latest published version** is supported. Fixes land on the
newest minor and are released as a new version — earlier `0.x` lines are not back-patched.

| Version | Supported |
| --- | --- |
| latest `0.x` on [npm](https://www.npmjs.com/package/@pasquelin/map3d) | ✅ |
| any earlier version | ❌ — upgrade first |

## Reporting a vulnerability

**Please do not open a public issue.**

Report privately through GitHub:

👉 **[Open a security advisory](https://github.com/pasquelin/map3D/security/advisories/new)**

Include, as far as you can: the affected version, what an attacker gains, and a minimal
reproduction. A proof of concept is welcome; a working exploit is not required.

You can expect an acknowledgement within **5 working days** and, when the report is confirmed, a fix
in the next release. This is a solo-maintained project — best effort, not a contractual SLA. Please
give the fix a reasonable window before disclosing publicly; credit is given in the `CHANGELOG.md`
entry unless you'd rather stay anonymous.

## Scope

What is in scope is the code published in the npm package `@pasquelin/map3d` — the library itself,
its build output and its release pipeline.

Out of scope, because they belong to someone else or are the host application's responsibility:

- **Third-party services and their keys.** map3d consumes Google Photorealistic 3D Tiles (via a
  Cesium Ion token), Google Routes and any XYZ basemap you point it at. The library never ships a
  key: tokens come from the host app's configuration. Restricting, rotating and billing them is the
  host's job. Report issues in those services to their vendors.
- **Peer dependencies** — `react`, `react-dom`, `three` — and the externalised MIL-STD-2525D SDK
  (`@armyc2.c5isr.renderer/mil-sym-ts-web`), which is installed alongside the package, never inside
  its `dist/`. Report to those projects.
- **The demo site and the example app** (`site/`, `examples/react/`), which exist to show the API.
- Anything that requires the attacker to already control the host application's code.

## Supply chain

Releases are published from GitHub Actions on a `vX.Y.Z` tag, with **npm Trusted Publishing (OIDC)**
— no long-lived npm token exists — and `--provenance`, so every published version carries a signed
attestation linking it to the commit and the workflow that built it. Verify with:

```bash
npm audit signatures
```
