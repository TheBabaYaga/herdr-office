# IDR 0004: the office as one command

Date: 2026-10-27

Status: accepted

## Context

The user wants to give herdr-office to colleagues (`INTENT.md` decision 36). The spec is `.local/specs/2026-10-27-one-command-design.md`. This record holds the technical choices of the build, the install, and the release.

## Decision

- The binary is a Node single executable application (SEA), not a copy of the `node` binary with loose files. A person gets one file for each system, and both systems use the same build path.
- The 30 s exit rule runs in command mode only (`quitMs: 30000`). The bridge stops 30 s after the last `/events` client leaves, and also when no client ever connects. So an orphan bridge stops. Ctrl-C stops it at once.
- three.js downloads at build time. The build checks each file against the sha384 values of the importmap `integrity` block. The SEA copy of `index.html` points the importmap at `/vendor/`, so the office loads nothing from the internet at run time.
- CI makes a draft release. The user checks the files and publishes it, because a public release is an outward step.
- `install.sh` writes a new file and then runs `mv` over the old one. On macOS, a signed binary that changes in place can die with "Killed: 9" at its next start.
- `openUrl()` starts Chromium detached, with `stdio: 'ignore'`. So Ctrl-C on the bridge does not end the browser.
- The repo runs on Node 26. Node 25 support ended in June 2026, and the SEA ships its runtime, so an old runtime would ship to each person.

## Facts from the Task 1 probe

The probe ran on darwin-arm64 with Node 26.12.1.

- A top-level `await` works in an ES module SEA main (`"mainFormat": "module"`). The main block of `bridge.mjs` needs this.
- A copy of the Node binary made with `strip -x` works as the SEA `executable`. It cuts the size from 145.7 MB to 108.7 MB. `strip` breaks the signature, and `codesign --sign -` after the build fixes it.

## Ruling on strip

The build strips on darwin only, because only darwin was probed. The Linux binary stays about 30 MB larger.
