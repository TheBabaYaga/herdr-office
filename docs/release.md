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

Facts:

- `version` is `HERDR_OFFICE_VERSION` without a leading `v`, else `0.0.0-dev`. `dist/herdr-office --version` prints it.
- On darwin, the SEA `executable` is a copy of Node that `strip -x` made smaller (about 145 MB to 109 MB). Only darwin was tested with this. On Linux, the build uses the running Node as is.
- A darwin build gives a binary of about 111 MB and a tar of about 40 MB.
- Git ignores `dist/`.
- `test/build.test.mjs` tests the three exports. The build itself has a manual check: run `dist/herdr-office` with a fake herdr socket and `HERDR_OFFICE_NO_OPEN=1`, then load `/?demo` in headless Chrome with the network cut (`docs/testing.md` "Visual check in the browser").
