# herdr-office

herdr-office shows your herdr agents as workers in a 3D voxel office. Each workspace is a room, each tab is a pod, and each pane is a desk.

![The herdr-office demo](demo.png)

## Requirements

- macOS on Apple Silicon (`darwin-arm64`), or Linux x64 (`linux-x64`).
- herdr must run.

## Install and update

Run this command. The same command updates herdr-office.

```bash
curl -fsSL https://github.com/TheBabaYaga/herdr-office/releases/latest/download/install.sh | sh
```

The script puts the binary in `~/.local/bin`. If that folder is not on your `PATH`, the script prints a line for you to add to your shell config. The script changes no file itself.

To see the version, run this command:

```bash
herdr-office --version
```

## Start

Run this command in a terminal:

```bash
herdr-office
```

On a Mac, the office opens in a tab of your default browser. On Linux, it opens in a Chromium app window. If Chromium is not there, it opens in your default browser.

## Stop

Close the tab. The command exits about 30 seconds later. You can also press Ctrl-C in the terminal.

## Open Anyway on a Mac

A binary from a browser download needs "Open Anyway" one time. Open System Settings > Privacy & Security and click "Open Anyway". Or run this command:

```bash
xattr -d com.apple.quarantine ~/.local/bin/herdr-office
```

## Uninstall

Remove the binary:

```bash
rm ~/.local/bin/herdr-office
```
