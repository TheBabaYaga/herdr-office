# bridge.mjs: the herdr bridge

`bridge.mjs` is the local HTTP server of herdr-office. It polls the herdr socket, reads Claude Code subagent metadata from `~/.claude/projects`, and streams both to the page over SSE. It also serves `public/`, sends two writes to herdr (`pane.focus` and `agent.prompt`), and answers `GET /messages` with the conversation of one claude or codex pane. In the release binary, it also asks GitHub for the latest release. For the herdr wire protocol, read `docs/herdr-agent-model.md` section 3.

## When to read this doc

- A change to a herdr request, the poll, the SSE stream, a guard, or the start (port, socket path, terminal raise).
- A change to `GET /messages`, `readMessages()`, `messagesIn()`, `readCodexMessages()`, or `codexMessagesIn()`.
- A new field in `meetings`, a new `POST /action` type, or a new static file type.
- A change to the update check (`newer()`, `latestRelease()`, `check()`).
- A failed test in `test/bridge.test.mjs`. Also read `docs/testing.md`.

## Module state

| Name | Holds | Written by |
|---|---|---|
| `cwds`, `models` | transcript path to its first `"cwd"`, and to its last `claude-*` id | `cwdOf()`, `modelIn()`, hits only |
| `metas` | the rollout path to `{ cwd, top }` of its first line | `codexMeta()`, only for a complete first line |
| `clients` | the open `/events` responses | `/events` branch, `res` `close`, `close()` |
| `last` | the last SSE payload, or `null` | `send()`, the end of `poll()` |
| `snap` | the last good snapshot, or `null` after a failed cycle or when the loop stops | `poll()` |
| `polling`, `meetings`, `readAt` | the loop flag, the last `readMeetings()` result, and its time | `poll()` |
| `update`, `updateTimer` | `{ current, latest, atStart }` while a newer release exists, else `null`, and the timer of the next update check | `check()`, `close()` (the timer) |

`cwds`, `models`, and `metas` live for the process, with no eviction. The rest live inside `startBridge()`.

## Flow

At start, the `import.meta.main` block awaits `startBridge()` with `socketPath()`, `Number(PORT) || 4747`, `public/`, `~/.claude/projects`, `codexDir` (`$CODEX_HOME/sessions`, else `~/.codex/sessions`), and `raiser(terminal)` as the `raise`. The block first finds `terminal` with `detectTerminals()`: `pgrep -x herdr`, then `ps eww -o command= -p <pid>` for each pid, and `bundleIdsIn()` keeps only the valid `__CFBundleIdentifier` values (never the rest of the environment). One id wins and the bridge logs `herdr-office: terminal <id>`. With none or many, `pickTerminal()` shows a numbered selector on a TTY (the detected ids, a fixed list of 7 terminals, and "none"), else it takes the first id, else WezTerm. "none" gives no `raise`. At each raise, `raiser()` runs `detectTerminals()` again, then `execFile('open', ['-b', id])` with no shell. One id wins, else it opens `terminal`, the start pick. So a move of herdr to another terminal needs no restart. The raise works on macOS only and does not select the herdr window or tab. Without command mode, `PORT=0` gives 4747, not a free port. Command mode changes this: see "Main block and `openUrl()`". Each start makes a new token. The bridge sends no `session.snapshot` request before the first `/events` client.

`handle()`, for each HTTP request:

1. A `Host` other than `127.0.0.1:<port>` or `localhost:<port>` gets 403.
2. `POST /action` goes to the action branch, `GET /events` to the SSE branch, `GET /messages` to the messages branch, and each other `GET` to the static branch. The rest gets 404.
3. A throw goes to `.catch(() => res.destroy())`, so the client gets no status line.

`poll()`, for each cycle:

1. `herdrRequest(sock, 'session.snapshot')`. `snap` keeps the snapshot. A failed cycle sets `snap` to `null`.
2. If `claudeDir` is set and `meetMs` passed since `readAt`: set `readAt`, and call `readMeetings()` with `foreground_cwd || cwd` of each `snapshot.agents` entry with `agent === 'claude'`. A rejection keeps the old `meetings`.
3. `send({ online: true, snapshot, meetings, update })`. A throw in steps 1 to 3 sends `{ online: false, snapshot: null, error, update }`.
4. `sleep(pollMs)`. The loop runs while `clients.size > 0`, then resets `polling`, `last`, and `readAt`.

## Functions

### Static branch of `handle()`

- It joins `decodeURIComponent(pathname)` to `publicDir`. It blocks an extension that is not in `TYPES`, and a path outside `publicDir + path.sep`. Each error gives 404.
- It then calls `readStatic(rel)`. `rel` is the path below `publicDir`, with `/` separators and no leading `/`, for example `index.html`. A throw or a rejection gives 404.
- `new URL()` removes `..` and `%2e%2e`. An encoded slash stays encoded until the decode, so only the `startsWith` guard blocks `/..%2f`.
- An HTML file gets the token in place of `__OFFICE_TOKEN__`. A 200 reply sets `cache-control: no-store` and `x-frame-options: DENY`.

### `socketPath(env = process.env, home = os.homedir())`

It returns `HERDR_SOCKET_PATH`, else the `HERDR_SESSION` socket, else the default socket. herdr sets `HERDR_SOCKET_PATH` in each pane, so in a pane it gives the live socket. A test must always pass `sock` (CLAUDE.md "Safety rules").

### `herdrRequest(sock, method, params = {}, timeoutMs = 3000)`

- It opens one connection, writes one line `{ id, method, params }`, and resolves `result` of the first reply line.
- It rejects on a herdr `error` (`<code>: <message>`), a parse error, the timeout, a close before a full line, or a socket error.

### Claude subagent helpers

- `ls(d)` gives `[]` and `readJson(f)` gives `{}` on any error. `chunk(file, from, size = 32768)` reads `size` bytes at an offset (32 KB by default) and throws on an error. `newestIn(dir, cwd)` gives the id of the newest transcript in `dir` whose `cwdOf()` equals `cwd`, else `null`. `readMeetings()` and `readMessages()` use it.
- `cwdOf(file)`: the first `"cwd"` in the first 32 KB, else in the first 256 KB. It caches a hit in `cwds`.
- `modelIn(file, tail)`: the last `claude-*` model id in `tail`, cached in `models`, or `null`.
- `plainTail(file, now)`: the last 32 KB of a plain subagent transcript. It gives `null` when the path is not a regular file or is 30 s quiet, or its last line has an `end_turn` or `stop_sequence` stop reason.

### `readMeetings(projects, cwds, now = Date.now())`

For each unique cwd, inside a `try`/`catch` that drops only that cwd:

1. Folder: `projects/<cwd with each non-alphanumeric character as '-'>`.
2. Session: the newest `.jsonl` regular file whose `cwdOf()` equals the cwd exactly. The `stat()` check skips a FIFO, because `open()` on a FIFO never returns.
3. Workflow agents, for each `subagents/workflows/<runId>/` of the session. An agent still runs when all of these are true:
   - `workflows/<runId>.json`, the end marker of the run, does not exist.
   - The journal has a `started` event for its key, and no later `result` or `failed` event.
   - `agentId` matches `^[\w-]+$`, because the id goes into a file path.
   - Its transcript does not exist, or changed in the last 30 min.
4. Plain subagents: each `subagents/agent-<id>.meta.json` whose `plainTail()` gives a tail. A plain subagent with no transcript never counts.
5. It adds `{ sessionId, cwd, agents }` when `agents` is not empty. Workflow agents come first.

### `messagesIn(text)`

A pure parser for the `GET /messages` data. It reads JSONL text and returns `[{ role, text, from? }]` in file order. `role` is `user`, `agent`, or `subagent`.

- It skips a line that does not parse, each entry that is not `user` or `assistant`, and each entry with `isSidechain` or `isCompactSummary`. It skips an `isMeta` entry, except a user entry with `origin.kind === 'peer'`.
- A user text is the string content, or the text blocks joined with `\n`. A tool result has no text, so it goes. A text that starts, after spaces, with a wrapper tag goes. A text that starts with `<pasted` stays.
- An agent text is the text blocks joined with `\n`. Thinking and tool calls go.
- A user text that starts with `Another Claude session sent a message` gives one `subagent` message for each `<teammate-message>`, `<agent-message>`, or `<cross-session-message>` block, and nothing else. The head line and the trailing note never show. A peer entry without that head line goes, because it is meta.
- `from` is `teammate_id`, else `from-name`, else `from`.
- A leading `[harness: ...]` line, and the empty line after it, never shows. This holds for each block, and again for the first line of a hand-back report.
- The block text is the first string of `result`, `summary`, `message`, or `content` of a JSON body. With a `failureReason`, the first line is `failed: <failureReason>`. A hand-back (`[Subagent hand-back]`) gives only the lines after the line that ends with `The report follows:`, with up to 2 leading spaces removed. Else the text is the trimmed body. A block with no text is skipped.

### `codexMessagesIn(text)`

A pure parser for the Codex rollout JSONL text. It returns `[{ role, text }]` in file order. `role` is `user` or `agent`.

- It skips a line that does not parse. It keeps only a line with `type === 'response_item'` and `payload.type === 'message'`. Codex writes these in both history modes (`legacy` and `paginated`).
- The role `user` gives `user`, and `assistant` gives `agent`. Each other role (`developer`, `system`) goes. Each `event_msg` goes, because the entries `user_message`, `agent_message`, and `item_completed` repeat the same messages.
- The text is the `text` of each `input_text` or `output_text` block, joined with `\n`. Images, reasoning, tool calls, and tool output have no such block, so they go.
- A user block that starts, after spaces, with an injected tag or with `# AGENTS.md instructions` goes. The tags are `environment_context`, `user_instructions`, `image`, `skill`, `turn_aborted`, `user_shell_command`, `subagent_notification`, `agent_message_board_notification`, `codex_internal_context`, `goal_context`, `external_*`, `recommended_plugins`, and `hook_prompt`. A message with no text left goes.
- The list comes from the injected context fragments of Codex 0.161.0 (tag `rust-v0.161.0`). A new Codex version can add a tag.

### `readMessages(projects, pane, limit = 100)`

1. A pane without `agent === 'claude'` gives `null`.
2. With `agent_session.kind === 'id'` and a uuid value, it looks for `<id>.jsonl` in the cwd folder (`foreground_cwd || cwd`), then in each folder of `projects` (it lists `projects` only when the cwd folder has no such file). A valid id that is not found gives `null`, with no fallback. It uses a regular file only (`open()` on a FIFO never returns).
3. A missing or bad `agent_session` (null, another kind, a value that is not a uuid) uses `newestIn(dir, cwd)`: the newest transcript of the cwd folder whose `cwdOf()` equals the cwd. `readMeetings()` uses the same helper.
4. It reads the last 512 KB with `tailOf(file)` (it uses `chunk()`), starting one byte early. When the read starts after byte 0, it drops the text up to and including the first `\n`. If the extra byte is a newline, the first line of the window is whole and stays. Else that line is partial and goes. Older history is not shown.
5. It returns `messagesIn(tail).slice(-limit)`. No transcript, or a read error anywhere in the lookup or the read, gives `null`.

### `readCodexMessages(sessions, pane, limit = 100)`

`sessions` is the Codex sessions folder (`$CODEX_HOME/sessions`). Its rollouts are in `YYYY/MM/DD/rollout-*.jsonl`.

1. A pane without `agent === 'codex'` gives `null`.
2. With `agent_session.kind === 'id'` and a uuid value, it takes the file in `rollouts(sessions)` whose name ends with `-<id>.jsonl`. A valid id that is not found gives `null`, with no fallback.
3. Else it takes the first rollout, newest first, whose `codexMeta()` has `cwd` equal to `foreground_cwd || cwd` and `top === true`. `codexMeta()` reads the first line (up to 256 KB) of the rollout. `top` is false when `payload.source` is an object, because an object (for example a subagent thread) is not a top-level session. A rollout whose first line is not complete is skipped and not cached.
4. It returns `codexMessagesIn(await tailOf(file)).slice(-limit)`. Any error gives `null`.

`rollouts()` lists the date folders, keeps regular files only (`open()` on a FIFO never returns), and sorts them by mtime.

### `newer(a, b)` and `latestRelease(fetchFn = fetch, url)`

- `newer(a, b)` is true when version `a` is newer than version `b`. Each is `X.Y.Z` with an optional leading `v`, compared as three numbers, so `0.10.0` is newer than `0.9.9`. Any other form gives false, for example `0.0.0-dev`, `nightly`, or `null`.
- `latestRelease()` sends one GET to `url`, by default the `releases/latest` API of `TheBabaYaga/herdr-office`. It sends `accept: application/vnd.github+json` and stops after 10 s (`AbortSignal.timeout`). A status that is not 200 rejects.
- It returns `tag_name` without the leading `v` when the tag is `X.Y.Z` (with an optional `v`). Else it rejects. So only a checked version string leaves the function.
- `check(atStart)` inside `startBridge()` calls `latest()`. A result that `newer()` finds newer than `version` sets `update` to `{ current: version, latest: result, atStart }`. When `update.latest` is already that result, `update` stays as it is, so `atStart` stays.
- A result that is not newer sets `update` to `null`. A rejection changes nothing. Then, while `latest` is set, `check(false)` runs `updateMs` later (`setTimeout` with `unref()`).
- The next poll cycle sends the new `update`, so a change shows within `pollMs` while a client is connected.

### `startBridge(options)`

The options are:

- `sock` and `port` (on `127.0.0.1`).
- `publicDir`, `claudeDir`, and `codexDir`. A `null` `claudeDir` gives `meetings: []`, and 503 on `GET /messages` for a claude pane. A `null` `codexDir` gives 503 for a codex pane.
- `pollMs` (500), `meetMs` (2000, the shortest time between two meeting reads), and `token` (`crypto.randomUUID()`).
- `raise`: it runs after a successful `pane.focus`.
- `readStatic`: `(rel) => Buffer | Promise<Buffer>` reads one page file. The default reads `path.join(publicDir, rel)` from disk. The single executable passes a reader of its embedded assets.
- `quitMs` (`null`, no exit) and `quit` (a no-op). With `quitMs` set, the bridge calls `quit()` that many ms after it listens with no client, and that many ms after the last `/events` client leaves. A new client stops the timer.
- `version` (`null`), `latest` (`null`), and `updateMs` (3600000, one hour): the update check. `latest` is an async function that returns a version string. With both `version` and `latest`, the bridge calls `check(true)` when it listens (see "`newer(a, b)` and `latestRelease(fetchFn = fetch, url)`").

It returns `{ url, token, close }`. `close()` clears `clients`, the quit timer, and the update timer, and closes the server. It also sets `latest` to `null`, so a call in progress starts no new timer. A cycle that runs then finishes, and the loop stops.

### Main block and `openUrl()`

`openUrl(url, { platform, spawn })` starts the browser. On `darwin` it runs `open <url>`. Else it runs `chromium --app=<url>`, and if that start fails, `xdg-open <url>`. Each child is detached, with `stdio: 'ignore'`, and `unref()` runs. A failed start logs `herdr-office: open: <message>`.

The `import.meta.main` block keeps its place at the top level, because a SEA main runs it there. `--version` prints the version and exits 0 (`getAsset('version')` in a SEA, else `0.0.0-dev`). Command mode is on in a SEA or with `--command`:

- The port is `PORT`, else 0 (a free port). Without command mode it is `PORT`, else 4747.
- `quitMs` is 30000 and `quit` is `process.exit(0)`. Without command mode, `quitMs` is `null`.
- The block calls `openUrl(url)` after the URL line, unless `HERDR_OFFICE_NO_OPEN` is set.
- In a SEA, `readStatic` reads `getAsset('public/' + rel)`.
- In a SEA, the block also passes `version` (the same constant as `--version`) and `latest: () => latestRelease()`. Without a SEA it passes neither, so `npm start` and `--command` never call GitHub.
- On Linux the block skips the terminal pick and `raise` is `null`, because `open -b` is a macOS command.

### `send(msg)`

It writes `data: <JSON>\n\n` to each client when the string differs from `last`. It destroys a client with more than 1 MB unread. That `EventSource` connects again, and `es.onerror` in `public/office.js` reloads the page when the stream opens again.

### `GET /events` branch

It replies 200 `text/event-stream` with `cache-control: no-store`, and adds `res` to `clients`. It writes `last` at once when it is set, and starts `poll()` when `polling` is `false`. It stops the quit timer. When `res` closes and `clients` is empty, it starts the timer again. Each message holds `update`, so a new client, also after a reload, gets it without a new check.

### `GET /messages` branch

1. Token check, the same as for `POST /action`. Else 403.
2. `pane` must match `^w[0-9A-Za-z]+:p[0-9A-Za-z]+$`. Else 400.
3. No `snap` gives 503 `no snapshot yet`.
4. A pane that is not in `snap.panes` gives 404 `no such pane`.
5. The `readers` map (a `Map`) has no reader for `pane.agent`: 404 `no transcript`. The map holds `claude` (`claudeDir`, `readMessages()`) and `codex` (`codexDir`, `readCodexMessages()`).
6. The reader has a `null` folder: 503 `no transcript directory`.
7. The reader gives `null`: 404 `{ error: 'no transcript' }`. Else 200 `{ messages }`.

The branch sends no request to herdr. The page caller is `loadMessages()` in `public/office.js`.

### `POST /action` branch

1. Token check, before the body read: the same byte length and `crypto.timingSafeEqual()`. Else 403.
2. `readBody()` keeps at most 4096 bytes. A larger body gives 413.
3. The body must be `{ type: 'focus', pane_id }` or `{ type: 'prompt', pane_id, text }`. `pane_id` must match `^w[0-9A-Za-z]+:p[0-9A-Za-z]+$`. `text` must be a string with at least one non-space character (the local `say`). Else 400.
4. A focus calls `herdrRequest(sock, 'pane.focus', { pane_id })`. A prompt calls `herdrRequest(sock, 'agent.prompt', { target: pane_id, text })`. A rejection gives 502 with its message. herdr rejects a prompt to a blocked agent with `agent_blocked`.
5. A prompt returns 200 `{ ok: true }` here. It does not call `raise`.
6. `raise?.()` inside a `try`/`catch`, with no `await`. A throw logs and does not change the reply. The `raiser()` promise never rejects.
7. 200 `{ ok: true }`.

A rejected request sends nothing to herdr. The page callers are `$('focus').onclick` and `$('say').onsubmit` in `public/office.js`. Both post through `act()`.

## What may reach the browser

| Field | Source |
|---|---|
| HTML `__OFFICE_TOKEN__` | the bridge `token` |
| `snapshot` | `session.snapshot` with no filter: live labels, cwds, and titles |
| `meetings[].sessionId`, `cwd` | the transcript name, and the herdr `foreground_cwd` or `cwd` |
| `agents[].agentId` | the journal `started` event, or the `<id>` in a plain meta file name |
| `agents[].label` | journal `label`, else meta `description` |
| `agents[].phase` | journal `phase`, else meta `workflowPhase` |
| `agents[].model` | meta `model` (it can be an alias such as `sonnet`), else `modelIn()` |
| `agents[].workflow`, `runId` | `<name>` of `workflows/scripts/<name>-<runId>.js`, and the run folder name |
| `update` | `null`, or `{ current, latest, atStart }`. `current` is the `version` asset of the binary. `latest` is a GitHub `tag_name` that `latestRelease()` checked against `X.Y.Z`. No other GitHub text goes out. |
| `error` (offline) | the `Error.message` of the failed cycle. It can hold the socket path. The page does not show it. |
| `GET /messages` reply | `messages[]`: the user prompts, agent replies, and subagent messages of one claude or codex pane (`role`, `text`, and `from` for a subagent), behind the token. It is the only route that sends transcript text. |
| `POST /action` reply | `{ ok: true }` or `{ error }`, shown with `textContent`. A 502 `error` is the `herdrRequest()` message, so it can also hold the socket path. |

A plain subagent has `phase`, `workflow`, and `runId` set to `null`. The `/events` stream holds no transcript text: `cwdOf()` gives a cwd only, and `modelIn()` gives a `claude-*` id only. The `plainTail()` text goes only into `modelIn()`. Transcript text goes out only in a `GET /messages` reply. Never copy page output into a repo file. The rules for a new field are in CLAUDE.md "Safety rules".

## Change recipes

Add a field to a meeting agent:

1. `readMeetings()`: add it to both `agents.push()` calls, from metadata only (journal, meta file, file name, `stat()` time).
2. `public/model.js`: add it to `subagents.push()` in `buildOffice()` and to `demoMeetings()`.
3. `public/office.js`: show it with `textContent` in `fill()` or the badge in `update()`. A 3D change also goes into `sig`.
4. Tests: the expected objects in the `readMeetings:` tests and the `/events` meetings test (keep the `SECRET` check). In `test/model.test.mjs`: `meeting()`, and the `deepEqual` on `o.subagents[0]` in `the orchestrator desk is away: its worker takes the head seat`.
5. Docs: CLAUDE.md "Contracts between the files" and "What may reach the browser".

Read a new file under `~/.claude`:

1. Read only. Check with `stat()` that the path is a regular file before `chunk()` or `readFile()`.
2. Check a journal or meta value with `^[\w-]+$` before a path uses it.
3. Update the comment above `ls` and CLAUDE.md "Safety rules".
4. Add a test that writes `SECRET` into the file and checks that the output does not hold it.

Add an action type:

1. Ask the user first. INTENT.md decision 2 allows only a focus.
2. Extend the validation and its 400 text. Keep the token check before the body read.
3. Get the params from `herdr api schema --json`. Add the page caller next to `$('focus').onclick`.
4. Test the exact line that the fake gets, and that a rejected input sends nothing. Never send the new method to the live socket.
5. Docs: CLAUDE.md "Contracts between the files" and a new INTENT.md decision.

Add a herdr read to the poll: check the method with `herdr api schema --json` (read-only). Call `herdrRequest()` inside the `try` of `poll()`, so a failure sends the offline message. Extend the fake `answer()` in `test/bridge.test.mjs`, never the live socket. Then follow "Add a field to the SSE message".

Change the poll or meeting rate: change the default in `startBridge()`. The polling tests pass their own values. Update the `startBridge(options)` line above, and each bridge-rate line that `grep -rn '500 ms\|2000 ms' docs *.md` finds. The 500 ms in `docs/herdr-agent-model.md` section 2 is a herdr rate, so keep it.

Serve a new file type: add it to `TYPES`. Write a sample into `pub` in `test/bridge.test.mjs`, and check its `content-type` in `GET / injects the token, static files serve, traversal is blocked`.

Add a field to the SSE message:

1. Add it to the `send()` calls in `poll()`.
2. Read it in `es.onmessage` in `public/office.js`.
3. Update the `deepEqual` checks in the two `GET /events` tests and in the `update:` tests.
4. Docs: CLAUDE.md "Contracts between the files" and "What may reach the browser".

## Pitfalls

- Inside `readMeetings()`, the parameter `cwds` hides the module cache `cwds`.
- The tests in a file share the caches, so a test that rewrites a transcript at the same path gets the old cwd. Give a new test its own transcript path (`docs/testing.md`).
- The bridge (`snapshot.agents`) and `buildOffice()` (`snapshot.panes`) compare cwds as exact strings. Change both sides together.
- `family()` and `attendee()` in `public/office.js` call `model?.match()`. `readMeetings()` has no type check, so a `model` that is not a string throws there.
- With `claudeDir` set, a snapshot with no `agents` array throws in each cycle that reads meetings. The page then shows offline about every `meetMs`.
- `send()` compares the full JSON, so a timestamp field sends a message every `pollMs`. It drops a slow client only on a changed message.
- Only the Host check guards `GET /events` and the static files. A `json()` reply has `cache-control: no-store` and no `x-frame-options`. A new HTML route must set both.
- `raise` must be synchronous, or catch its own errors. In Node 26, an unhandled rejection ends the process. `raiser()` catches its own: a failed detection logs and opens nothing.
- The traversal guard checks the path string only. `readFile()` follows a symlink inside `public/`.
