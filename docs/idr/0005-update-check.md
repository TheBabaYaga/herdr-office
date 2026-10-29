# IDR 0005: the update check

Date: 2026-10-29

Status: accepted

## Context

The user wants each person who installed herdr-office from the releases repo to see a new release (`INTENT.md` decision 38). The spec is `.local/specs/2026-10-29-update-check.md`. This record holds the technical choices of the main session. The user did not make them.

## Decision

- The bridge checks, not the page. So each bridge sends one request each hour, also with two tabs open, and the page still loads nothing from the internet (IDR 0004).
- The bridge checks once when it listens, then one hour (`updateMs` 3600000) after each call ends. The `setTimeout` chain starts a call only after the last call ended, so two calls never overlap. The timer has `unref()`, so it does not keep the process alive.
- Only the binary (`isSea()`) passes `version` and `latest`. `npm start`, `--command`, and the tests never call GitHub.
- The bridge sends version numbers only. `latestRelease()` keeps only a `tag_name` that matches `^v?\d+\.\d+\.\d+$`. The page builds the release link from the version (`releases/tag/v<latest>`). So no other GitHub text, for example the release name or its notes, reaches the page.
- The page keeps Later in `sessionStorage` under the key `updateLater`, with the token as the value. A reload of the same page then shows only the notice. A new start of the bridge makes a new token, so the dialog opens again.
- The Escape handler of the page skips `close()` while `#update` is open, as it does for `#chat`. So one Esc closes the dialog and leaves the side panel open.

```text
09:00:00  the bridge starts with the token tok-B. The start check finds 0.2.0 (atStart true).
09:00:01  the dialog opens. Anna clicks Later. sessionStorage.updateLater = tok-B.
09:00:30  Anna reloads the tab. The message still has atStart true, but updateLater is tok-B. Only the notice shows.
next day  a new start of the bridge gives the token tok-C. The dialog opens again.
```
