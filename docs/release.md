# Release

## Build

`npm run build` runs `build.mjs`. It uses Node built-ins only. It builds for the system that it runs on, and it needs Node 25.5 or later (`--build-sea`).

Steps:

1. Read the five three.js URLs of the importmap `integrity` block in `public/index.html` (`threeFiles()`).
2. Download each file from jsDelivr. Stop if the status is not 200, or if `sha384()` differs from the block.
3. Write `dist/stage/`: each file of `public/`, the three.js files below `public/vendor/<jsDelivr path>`, and `version`.
4. Write `index.html` with `localHtml()`. It changes `https://cdn.jsdelivr.net/npm/` to `/vendor/`. The hashes stay the same, because the files are the same. `public/index.html` in the repo does not change.
5. Write `dist/sea.json` and run `node --build-sea dist/sea.json`. The asset keys are `public/<path>` and `version`. The bridge reads them with `getAsset()`.
6. On the Mac, run `codesign --sign -` on the binary.
7. Write `dist/herdr-office-<os>-<arch>.tar.gz` with `tar`. The tar keeps the exec bit.

The build stops when the `integrity` block has no three.js entry, and each download stops after 60 s. The SEA config uses `main: 'bridge.mjs'` and runs from the repo root, so the binary holds no absolute path.

After a build, check that the binary holds no local path. This command must print nothing (`/Users/admin/build` is a build path of Node itself, and `/home/demo` is the fake path of the demo data):

```sh
strings dist/herdr-office | grep -e /Users/ -e /home/ | grep -v -e /Users/admin/build -e /home/demo
```

Facts:

- `version` is `HERDR_OFFICE_VERSION` without a leading `v`, else `0.0.0-dev`. `dist/herdr-office --version` prints it.
- On darwin, the SEA `executable` is a copy of Node that `strip -x` made smaller (about 145 MB to 109 MB). Only darwin was tested with this. On Linux, the build uses the running Node as is.
- A darwin build gives a binary of about 111 MB and a tar of about 40 MB.
- Git ignores `dist/`.
- `test/build.test.mjs` tests the three exports. The build itself has a manual check: run `dist/herdr-office` with a fake herdr socket and `HERDR_OFFICE_NO_OPEN=1`, then load `/?demo` in headless Chrome with the network cut (`docs/testing.md` "Visual check in the browser").

## Install

`install.sh` is a POSIX `sh` script. It passes `shellcheck`. CI attaches it to each release.

```sh
curl -fsSL https://github.com/TheBabaYaga/herdr-office/releases/latest/download/install.sh | sh
```

Steps:

1. Read `uname -s` and `uname -m`. `Darwin arm64` gives `darwin-arm64`, and `Linux x86_64` gives `linux-x64`. Any other pair stops with "not supported".
2. Download `herdr-office-<target>.tar.gz` with `curl -fsSL` into a temp folder. `HERDR_OFFICE_URL` replaces the URL, for a check.
3. Copy the binary to a temp name in `~/.local/bin`, then `mv -f` it onto `herdr-office`. A new file is needed because a signed binary that changes in place can die with "Killed: 9" on macOS.
4. If `~/.local/bin` is not on the `PATH`, print the `export` line for `~/.zshrc` (Mac) or `~/.bashrc` (Linux). The script never changes a shell config file and never uses `sudo`.

To uninstall, remove `~/.local/bin/herdr-office`.

`test/install.test.mjs` runs the script with a temp `HOME`, a fake `uname`, and a fake `curl`.

## Make a release

The workflow `.github/workflows/release.yml` runs on each tag that starts with `v`. The `linux` job runs `npm test`, runs `shellcheck install.sh`, and builds the Linux tar. The `mac` job builds the Mac tar and checks the signature. Each build job then starts the binary, fetches `/` and a three.js file, and checks `--version`. Each job stops after 20 minutes. The `release` job makes a draft release in `TheBabaYaga/herdr-office` with both tars and `install.sh`.

Before the first release, make the README commit in `TheBabaYaga/herdr-office`. A release needs a tag, and a tag needs a commit.

Steps:

1. Push a tag, for example `git tag v0.1.0 && git push origin v0.1.0`.
2. Wait for the workflow to finish in the Actions tab of `TheBabaYaga/herdhouse`.
3. Open the draft release in `TheBabaYaga/herdr-office`. Check that it has three files: `herdr-office-darwin-arm64.tar.gz`, `herdr-office-linux-x64.tar.gz`, and `install.sh`.
4. Publish the draft.

Before you re-run the workflow for the same tag, delete the old draft, because `gh release create` fails when the release exists.

The `release` step uses the secret `RELEASES_TOKEN`. The token must be a fine-grained token with "Contents: read and write" on `TheBabaYaga/herdr-office` only. Only that step can read it. The workflow makes a draft only, so a failed run publishes nothing.

## Update check

The binary asks GitHub for the latest release at its start and then each hour (`INTENT.md` decision 38). `latestRelease()` in `bridge.mjs` sends one GET to `https://api.github.com/repos/TheBabaYaga/herdr-office/releases/latest`. `npm start` and `--command` never send it.

- `/releases/latest` skips drafts and pre-releases. So a colleague sees an update only after step 4 of "Make a release" (publish the draft).
- A colleague sees the dialog at the next start of herdr-office, or the notice in the bottom-right corner within one hour.
- The tag must be `vX.Y.Z`, for example `v0.2.0`. The workflow runs only on a tag that starts with `v`. The check ignores a tag that is not `X.Y.Z` after the `v`, for example `v0.2.0-beta`, and changes nothing.
- A build without `HERDR_OFFICE_VERSION` has the version `0.0.0-dev`. `newer()` gives false for it, so that binary never shows an update.
- The dialog shows the install command of "Install" and the link `releases/tag/v<version>`. After the install, the notice stays until herdr-office starts again.

```text
Mon 09:00  Anna runs herdr-office 0.1.0. The start check finds 0.1.0. Nothing shows.
Mon 10:30  the user publishes the draft of v0.2.0.
Mon 11:00  the hourly check finds 0.2.0. The notice shows. No dialog.
Tue 09:00  Anna starts herdr-office 0.1.0 again. The start check finds 0.2.0. The dialog opens.
Failure:   GitHub does not answer at 11:00. Nothing changes. The next check comes at 12:00.
```

## README of the releases repo

`release/README.md` and `release/demo.png` are the README and the screenshot of `TheBabaYaga/herdr-office`. That repo holds only these files and the releases. Copy both files to it by hand. The agent does not touch the public repo.

To take `demo.png` again, start `dist/herdr-office` with `HERDR_OFFICE_NO_OPEN=1` on a free port. Open `/?demo&season=none&time=15:00` in headless Chrome at 1280 x 800 within 30 s of the start, because the binary exits when no `/events` client connects.
