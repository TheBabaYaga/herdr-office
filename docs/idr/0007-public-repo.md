# IDR 0007: the public repo

Date: 2026-10-31

Status: accepted

## Context

The code moves from the private repo `TheBabaYaga/herdhouse` into the public repo `TheBabaYaga/herdr-office` (`INTENT.md` decision 40). Before the move, a tag push in `herdhouse` built the binaries and made a draft release in `herdr-office` with the token `RELEASES_TOKEN`. This record holds the technical choices of the main session. The user did not make them.

## Decision

- The code moves into `herdr-office`. We do not rename `herdhouse`. Each installed binary asks `repos/TheBabaYaga/herdr-office/releases/latest`, and `install.sh` downloads from that repo. A rename would leave both places on the old name.
- We merge with `--allow-unrelated-histories` and push normally, so no force-push happens. The 2 public commits and their tags stay.
- `git filter-branch --env-filter` on a copy branch changes the author to `Kevin T'Syen <info@kevintsyen.be>`. Git has it built in, so nothing needs an install. The 2 public commits keep their authors.
- release-please and the build run in one workflow. A tag or a release that `GITHUB_TOKEN` makes starts no other workflow. `GITHUB_TOKEN` replaces `RELEASES_TOKEN`, so the repo holds no personal token.
- The config sets `draft` and `force-tag-creation`. Without `draft`, `/releases/latest` returns the new release before its files exist, and `install.sh` gets a 404. GitHub makes no tag for a draft until someone publishes it, so `force-tag-creation` makes the tag at once. Without the tag, release-please cannot find the last release.
- The config sets `include-component-in-tag: false`. The tag stays `vX.Y.Z`. The default is `herdr-office-vX.Y.Z`, and `latestRelease()` rejects that form, so the update check finds nothing.
- `last-release-sha` is for the first release only. The public tag v0.3.0 points at the README commit `46362a3` (30 October 2026, 10:08). The water-cooler commits came after it, from 11:30 to 13:24, and v0.3.0 already holds them. Without the key, release-please lists them again in the next release. We set the key to the new id of the water-cooler merge after the author rewrite, and remove it after the first release-please release. The commits after v0.3.0 hold no `feat` and no `fix`, so the first run opens no release PR.
- The repo setting `can_approve_pull_request_reviews` must be `true`. Else release-please cannot open the release PR with `GITHUB_TOKEN`.
- GitHub cannot move an issue from a private repo to a public repo. The links `TheBabaYaga/herdhouse#N` in the docs stay. A public reader cannot open them.

```text
Without draft (the failure we avoid):
10:00  the release PR merges. release-please publishes v0.4.0.
10:02  the binary of Anna asks /releases/latest and finds 0.4.0. The dialog opens.
10:03  Anna runs install.sh. The tar is not there yet. curl gets a 404.
10:15  the build ends and uploads the tars. Too late for Anna.
With draft: /releases/latest still shows 0.3.0 until the user publishes the draft at 10:15.
```

## Consequences

- A release needs a merge of the release PR, then a manual publish of the draft (`docs/release.md` "Make a release").
- A flaky build failure leaves a draft with no files. "Re-run failed jobs" fills it, because `gh release upload --clobber` replaces a file.
- A build that fails because of the code leaves an empty draft and a tag. Push a `fix` commit, and release-please proposes the next patch version. Never publish the empty draft (`docs/release.md` "Make a release").
- The old links to `herdhouse` issues stay dead for a public reader.
