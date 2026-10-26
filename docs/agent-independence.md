# Agent independence: the office without herdr, and without Claude

Scope: can herdr-office show OpenAI Codex agents (and other coding agents), and can it run without herdr? This doc holds the research of 2026-10-20. It changes no code. The versions on this machine: herdr 0.8.2 (protocol 20), Claude Code 2.1.292, codex-cli 0.161.0, opencode 1.18.30, cursor-agent 2026.01.23, tmux 3.7b, WezTerm 20240203-110809-5046fc22, Ghostty 1.3.1, Node 25.2.1.

Status: the user chose option A on 2026-10-20 (`INTENT.md` decision 30).

## 1. Answer first

Independent from Claude: feasible, and small. herdr already detects Codex and 21 other agent kinds (23 on herdr 0.9.5) from the process name and the screen, with no integration. The office already draws a Codex desk: a white shirt, the status pose, "Focus in herdr", and the message field. Three features are Claude-only: the chat (the last reply and the history), the meetings (subagents), and the orchestrator seat. The Codex chat needs a reader for the Codex rollout files.

Independent from herdr: feasible for the status, with losses. Claude Code (`claude agents --json`) and Codex (its shared app-server daemon) both report working, blocked, and idle without herdr. No agent source gives the herdr layout (workspace, tab, pane rects), the `seen` flag (`done` against `idle`), a pane focus, or the `agent_blocked` refusal of `agent.prompt`. A tmux or WezTerm adapter gives back the layout and the focus. Ghostty 1.3.1, where herdr runs now, gives no layout.

Recommended first step: keep herdr, and make the chat work for Codex desks. Add a `codexMessagesIn()` parser and a rollout lookup in `readMessages()`, and show the chat for a desk with a reader. Effort S. Section 4.4 has the path.

## 2. What the office takes from herdr and Claude today

The line numbers are for the working tree on 2026-10-20.

### herdr

| Dependency | Where the code uses it | What breaks without it |
|---|---|---|
| The socket path (`HERDR_SOCKET_PATH`, `HERDR_SESSION`, `~/.config/herdr/herdr.sock`) | `bridge.mjs:22-26` `socketPath()` | The bridge has no data source. The page shows "offline" (`public/office.js:1053`). |
| `session.snapshot`, one request each 500 ms | `bridge.mjs:263` `poll()` | All live data. |
| `workspaces[]`: `workspace_id`, `number`, `label`, `agent_status` | `public/model.js:186`, `222-223` | The rooms, their order, the door sign, and the door light. |
| `tabs[]`: `tab_id`, `workspace_id`, `label`, `number`, `agent_status`, and the array order (the tab-bar order) | `public/model.js:190`, `196`, `214` | The pods, their order, and the pod lamp. |
| `layouts[]`: `area`, `panes[].rect`, `focused_pane_id`, `zoomed` | `public/model.js:191`, `25-47` (`podLayout()`), `197` | The desk positions in a pod. Without rects, `podLayout()` puts the desks in one row (`public/model.js:37`). |
| `panes[]`: `pane_id`, `tab_id`, `terminal_id`, `label`, `cwd`, `foreground_cwd`, `terminal_title_stripped` | `public/model.js:192`, `203-206` | The desks. `terminal_id` seeds the look of a worker (`public/office.js:310`, `351`). The cwd is in the panel and links a meeting to its orchestrator. |
| `agents[]`: `pane_id`, `agent`, `name`, `display_agent`, `agent_status`, `terminal_title_stripped`, `state_change_seq` | `public/model.js:182`, `207-211` | The worker at the desk, the shirt color by kind (`public/office.js:15-16`, `348`), the pose by status, the badge name (`public/office.js:17`), and the HUD order (`public/office.js:797`). |
| `focused_workspace_id`, `focused_tab_id`, `focused_pane_id` | `public/model.js:205`, `348` | The blue spotlight (`public/office.js:778`) and the first camera frame (`public/office.js:753`). |
| `panes[].agent_session` (`{ kind: 'id', value: <uuid> }`) | `bridge.mjs:213-216` | The exact transcript of a claude pane. The fallback is the newest transcript of the cwd (`bridge.mjs:227`). |
| The pane id format `w<id>:p<id>` | `bridge.mjs:162` (`PANE`) | The input check of `POST /action` and `GET /messages`. A new id format gets 400. |
| The status set `blocked`, `done`, `working`, `idle`, `unknown`, and the roll-up rank | `public/model.js:4-13` | Every color, pose, and roll-up. herdr derives each status from the screen, hooks, and the `seen` flag (`docs/herdr-agent-model.md` section 2). |
| `done` against `idle`: the herdr `seen` flag of the pane | herdr side only (`docs/herdr-agent-model.md` section 1) | The raised paper. Without `seen`, a finished agent shows `idle`. |
| `idle` as the trigger for the idle breaks | `public/office.js:512` | The kitchen, lunch, party, and game trips. |
| `pane.focus` | `bridge.mjs:321`, caller `public/office.js:963` | "Focus in herdr" and "Focus orchestrator". |
| `agent.prompt` and its `agent_blocked` refusal | `bridge.mjs:320`, callers `public/office.js:968`, `975` | The message field and the chat reply. The refusal is the guard that the office never answers a blocked question (INTENT.md decision 21). |
| The terminal raise: `pgrep -x herdr`, `ps eww`, `open -b` | `bridge.mjs:392-421` | The terminal app does not come to the front after a focus. |
| The words "herdr" in the UI | `public/index.html:78-79`, `public/office.js:923`, `933`, `963`, `1053` | Nothing. These are labels. |

### Claude Code

| Dependency | Where the code uses it | What breaks without it |
|---|---|---|
| `~/.claude/projects` as the transcript root | `bridge.mjs:430` | Meetings and the chat. |
| The folder name rule: the cwd with each non-alphanumeric character as `-` | `bridge.mjs:118`, `212` | The bridge does not find the transcript of a cwd. |
| The first `"cwd"` in a session transcript | `bridge.mjs:77-83` `cwdOf()`, `104-111` `newestIn()` | The match of a session to a desk. |
| The transcript JSONL: `type` `user` or `assistant`, `message.content` blocks, `isSidechain`, `isMeta`, `isCompactSummary`, `origin.kind`, the `<teammate-message>` wrappers | `bridge.mjs:157-205` `messagesIn()`, `208-241` `readMessages()` | The last reply and the chat window. |
| `agent === 'claude'` checks | `bridge.mjs:209`, `267`, `public/model.js:328`, `public/office.js:871`, `927` | Only a claude desk gets a chat, a meeting, or the orchestrator seat. |
| Workflow runs: `subagents/workflows/<runId>/journal.jsonl` (`started`, `result`, `failed`), `workflows/<runId>.json`, `workflows/scripts/<name>-<runId>.js`, `agent-<id>.meta.json` | `bridge.mjs:122-143` | The meeting rooms of workflows. |
| Plain subagents: `subagents/agent-<id>.meta.json`, `agent-<id>.jsonl`, and the `end_turn` or `stop_sequence` stop reason | `bridge.mjs:93-98` `plainTail()`, `144-150` | The meeting rooms of plain subagents. |
| `claude-*` model ids, and the families `opus`, `sonnet`, `haiku` | `bridge.mjs:86-90` `modelIn()`, `public/office.js:15`, `18` | The shirt color of a subagent. Another model gets grey. |

The shirt color of a desk worker is not a Claude dependency. It comes from the herdr `agent` string, and `SHIRT` already has `codex`, `gemini`, and `opencode` (`public/office.js:15`). The demo already shows codex, gemini, and opencode desks (`public/model.js:508-521`).

`INTENT.md` has no decision about independence. Three decisions touch it:

- The purpose says: "The user runs coding agents in herdr". The office uses the herdr concepts: a workspace is a room, a tab is a pod, and a pane is a desk.
- Decision 16 chose Claude Code subagents and workflows for meetings.
- Decision 22 chose the Claude Code transcripts as the chat source, not the herdr screen read. So the chat works for claude agents only.

## 3. Sources per agent and per terminal

Each claim names its source. "Local" means a read-only check on this machine on 2026-10-20: a `--help` output, a generated schema, a feature list, or the key names of a file. "Unverified" means that no primary source confirms the claim. Section 6 lists the source URLs.

### 3.1 herdr: is herdr already agent-agnostic?

Yes, for the status. The source paths are at herdr master 143bf5f (2026-10-15, version 0.9.5, protocol 22). The local 0.8.2 has protocol 20.

| Claim | Source |
|---|---|
| herdr maps the process name `codex` to the kind `codex`. It also finds Codex behind `node`, a nix wrapper, `codex.cmd`, and `exec -a codex`. | `src/detect/mod.rs:203`, tests at `1157-1170`, `1558-1570`, `1747-1765` |
| herdr knows 24 kinds. 22 have a screen manifest. The 0.8.2 binary lists 22 kinds, with codex, gemini, cursor, opencode, and amp. | `src/detect/mod.rs:71`, `98`. `docs/herdr-agent-model.md` section 2 |
| A Codex pane gets `agent: "codex"` and a screen-derived `agent_status` with no integration. The docs say that the integration is only for the session restore. | `docs/next/website/src/content/docs/agents.mdx:18-23` |
| Codex `blocked`: the OSC title holds "Action Required", or the screen shows the trust dialog, the update dialog, "allow command?", "press enter to confirm or esc to cancel", or a `[y/n]` prompt. | `src/detect/manifests/codex.toml` (manifest 2026.10.11.1) L6-12, L34-103 |
| Codex `working`: a braille spinner in the OSC title, or the status line with a timer and "esc to interrupt". `idle`: an OSC title with no spinner. | `codex.toml` L14-20, L105-129 |
| The Codex integration v10 is session identity only. It adds one `SessionStart` hook to `~/.codex/hooks.json`, sets `[features] hooks = true`, and sends `pane.report_agent_session`. herdr ignores state reports from `herdr:codex`. | `src/integration/targets.rs:160-223`, `src/integration/assets/codex/herdr-agent-state.sh:51-84`, `src/app/actions.rs:1500-1505` |
| v0.9.4 had Codex turn hooks and needed `codex --no-daemon`, because a shared Codex daemon could send a hook to the wrong pane. v0.9.5 removed them: "Codex status comes from screen detection again". | `CHANGELOG.md:11`, `CHANGELOG.md:59` |
| The Codex hook script exits when `HERDR_PANE_ID` or `HERDR_SOCKET_PATH` is not set. | `herdr-agent-state.sh:20-22` |
| The Claude integration (v11 on master, v8 here) also sends only `SessionStart` identity. herdr keeps the session id and drops the transcript path. Claude state comes from the screen. | `src/integration/claude_settings.rs:19`, `src/agent_resume.rs:116-133`, `integrations.mdx:112` |
| `agent_session` is `{ source, agent, kind: "id" \| "path", value }`. Only official integrations set it. | local `herdr api schema --json` (`AgentSessionInfo`), `src/agent_resume.rs:328-349` |
| herdr has no model id and no conversation text in its API. It has the screen text (`pane.read`), the OSC title, and display-only `tokens`, `state_labels`, and `display_agent`. | local and master schema |
| Local state: the claude integration is "current (v8)", and the codex integration is "not installed". All 21 live agents are `claude`. | local `herdr integration status`, `herdr agent list` (counts only) |

Result: with herdr, a Codex desk already works for the status, the focus, and the message. Only the Claude-only code in the office blocks the chat and the meetings for Codex.

### 3.2 Claude Code without herdr

The docs are at `https://code.claude.com/docs/en/`, read on 2026-10-20. The newest changelog entry is v2.1.304 (2026-10-19). The local CLI is 2.1.292, so some features below are newer than the local CLI.

| Need | Source | Claim |
|---|---|---|
| Status, polled | `agent-view`, "List sessions as JSON" and "Read session state from a script". Local `claude agents --help` | `claude agents --json` prints each live session: `cwd`, `kind` (`interactive` or `background`), `startedAt`, and while the process lives, `pid` and `status` (`busy`, `waiting`, `idle`). With `waiting`, `waitingFor` is `permission prompt`, `input needed`, `sandbox request`, `worker request`, or `dialog open`. `sessionId` and `name` show when set. The doc calls it "the supported way to read session state from outside Claude Code". |
| Status, pushed | `hooks`, "Hook lifecycle" | 33 hook events. `UserPromptSubmit` and `PreToolUse` mean working. `PermissionRequest` "runs when Claude Code is about to ask you for permission" (blocked). `Stop` ends a turn. `StopFailure` ends a turn with an API error. |
| Blocked ends | `hooks`, "PermissionDenied", "PostToolUseFailure" | No hook fires when the user answers a permission prompt. After an allow, `PostToolUse` fires. After a manual deny, no tool event fires. `Stop` does not run after a user interrupt. |
| Notification | `hooks`, "Notification" | `notification_type` `permission_prompt` fires after about 6 s with no keystroke. `idle_prompt` fires about 60 s after the turn ends. |
| Hook transport | `hooks`, "HTTP hook fields". `settings-reference`, "allowedHttpHookUrls" | A hook can be `type: "http"`: a POST of the event JSON to a URL, for example `http://localhost:*`. `SessionStart` supports only `command` and `mcp_tool` hooks. |
| Common hook fields | `hooks`, "Common input fields" | `session_id`, `transcript_path`, `cwd`, `permission_mode`, `hook_event_name`. A subagent adds `agent_id` and `agent_type`. Only `SessionStart` can carry `model`. |
| Transcripts | `sessions`, "Where transcripts are stored" | `~/.claude/projects/<project>/<session-id>.jsonl`. `<project>` is the cwd with each non-alphanumeric character as `-`. A name over 200 characters gets cut and hashed. "The entry format is internal to Claude Code and changes between versions." |
| Retention | `settings-reference`, "cleanupPeriodDays" | The default is 30 days. |
| Status line | `statusline`, "Available data" | The script gets `model.id`, `cwd`, `session_id`, `transcript_path`, and more on stdin. It has no status field. It hides during permission prompts. |
| Subagents | `hooks`, "SubagentStop input". `sub-agents`, "Resume subagents" | `SubagentStart` and `SubagentStop` carry `agent_id` and `agent_type`. `SubagentStop` adds `agent_transcript_path`. Subagent transcripts are `<session>/subagents/agent-<id>.jsonl`. |
| Headless | `headless`, "Stream responses" | `claude -p --output-format stream-json` streams NDJSON for a run that the caller starts. The Agent SDK also starts its own process. Neither attaches to a running TUI. |
| Send a prompt into a running TUI | `plugins/mods/api`, `cross-session-messaging`, `channels-reference` | No documented way exists. The nearest paths: a mod in the session can call `$.prompt.submit({ text, asUser: true })`. The session inbox socket (`CLAUDE_CODE_MESSAGING_SOCKET`) takes messages from other sessions, but its message format is not documented, and a message cannot approve a permission. Channels are a research preview and need `--channels` at start. |
| Terminal status | `terminal-config`, "See session status in your terminal". Changelog 2.1.295 | Claude Code 2.1.295 and later sends OSC 7501 with working, waiting, or done to a terminal that reads it. |
| Telemetry | `monitoring-usage`, "Tool decision event" | `claude_code.tool_decision` reports the answer to a permission prompt. No event carries the session state. |

`claude agents` can start the agent-view supervisor process (`agent-view`: "The next `claude agents` or `claude --bg` starts a fresh supervisor"). It is unverified whether `--json` alone starts it. This research did not run it.

### 3.3 OpenAI Codex CLI

The source paths are at tag `rust-v0.161.0` of `github.com/openai/codex` (released 2026-10-07, the same as the local version). The docs at `developers.openai.com/codex` redirect to `learn.chatgpt.com/docs`. These pages show no version. They were read on 2026-10-20.

| Need | Source | Claim |
|---|---|---|
| A shared daemon | `codex-rs/features/src/lib.rs` L117-118, L966-971. `codex-rs/tui/src/startup_orchestration.rs` L509-569. Local `codex features list` | The interactive TUI connects to a shared local app-server daemon by default since 0.157.0 (`daemon_auto_start`, stable, true). `--no-daemon` runs an embedded server. A thread in an embedded server is not visible to other clients. |
| The socket | `codex-rs/app-server-transport/src/transport/mod.rs` L53-70, `unix_socket.rs` L31, L168-203. `learn.chatgpt.com/docs/app-server`, "Transport" | `$CODEX_HOME/app-server-control/app-server-control.sock`, mode 0600, no token. It speaks WebSocket over the Unix socket, after an HTTP Upgrade. The folder does not exist on this machine now (local). |
| Experimental | Local `codex --help` | `app-server` shows as "[experimental]". |
| Handshake | `app-server` docs, "Initialization" | A client sends `initialize` with `clientInfo`, then `initialized`. `capabilities.experimentalApi` turns on the experimental methods. |
| List and status | Local `codex app-server generate-json-schema` (v2). `codex-rs/tui/src/app/agents_overview_threads.rs` L316-363 | `thread/loaded/list` gives the ids of the threads in memory. `thread/read` gives a `Thread`: `id`, `cwd`, `model`, `status`, `source`, `parentThreadId`, `agentNickname`, `agentRole`, `gitInfo`, `name`, `preview`. `ThreadStatus` is `notLoaded`, `idle`, `systemError`, or `active` with `activeFlags` `waitingOnApproval` or `waitingOnUserInput`. `codex agents` uses these calls. |
| Status push | `codex-rs/app-server/src/thread_status.rs` L223-249, L447-460 | `thread/status/changed` goes to every initialized connection, also to a client that subscribes to no thread. The status turns `active` with `waitingOnApproval` before the approval request goes out. |
| Approvals | `codex-rs/app-server/src/outgoing_message.rs` L143-183, L467-494 | An approval request goes to each connection that subscribes to the thread. The first answer wins. A spawned subagent thread subscribes every initialized connection (`codex-rs/app-server/src/lib.rs` L1282-1300). So a watcher gets approval requests too, and it must never answer them. |
| Send a prompt | `codex-rs/app-server/src/request_processors/turn_processor.rs` L374-389, L522-536 | `turn/start` and `turn/steer` have no owner check. An outside client can start a turn on a thread that the TUI started. `turn/steer` needs `expectedTurnId` of the active turn. It is unverified whether `turn/start` fails while a turn or an approval is active. |
| Queue | `codex-rs/tui/src/session_queue_commands.rs` L25-36, L111-126. `codex-rs/ext/queue/src/service.rs` L549-562 | `codex queue --thread <id> --message <text>` sends `thread/queue/add` to the daemon. The daemon starts the message when the thread goes idle. The queue methods are experimental. |
| Hooks | `learn.chatgpt.com/docs/hooks`. `codex-rs/hooks/schema/generated/` | Stable and on by default. Events: `SessionStart`, `SessionEnd`, `UserPromptSubmit`, `PreToolUse`, `PermissionRequest`, `PostToolUse`, `PreCompact`, `PostCompact`, `SubagentStart`, `SubagentStop`, `Stop`, `Interrupt`. Common fields: `session_id`, `transcript_path`, `cwd`, `hook_event_name`, `model`, `permission_mode`. Codex runs a hook only after the user trusts its hash in `/hooks`. |
| Hook environment | `codex-rs/app-server-daemon/README.md` L22-24 | Shared clients use the environment of the daemon start. So a hook can miss the `HERDR_PANE_ID` of the pane. This is an inference, unverified. |
| `notify` | `codex-rs/hooks/src/legacy_notify.rs` L13-73 | One event, `agent-turn-complete`, with `thread-id`, `turn-id`, `cwd`, `input-messages`, `last-assistant-message`. The source marks it as legacy. |
| Rollout files | `codex-rs/rollout/src/recorder.rs` L1723-1735, `rollout_file_name.rs` L10-14 | `$CODEX_HOME/sessions/YYYY/MM/DD/rollout-<timestamp>-<thread id>.jsonl`. The docs do not describe the format, so treat it as internal. |
| Rollout entries | `codex-rs/protocol/src/protocol.rs` L1406-1418, L2153-2175, L3123-3160, L3301-3335. Local key names of one file | Each line has `timestamp`, `type`, `payload`, `ordinal`. `session_meta` has `id`, `cwd`, `source`, `parent_thread_id`, `agent_nickname`, `agent_role`. `turn_context` has `cwd` and `model`. `event_msg` `task_started` and `task_complete` (with `last_agent_message`) bound a turn. `response_item` `message` has `role` `user`, `assistant`, or `developer`. |
| History modes | `codex-rs/rollout/src/policy.rs` L92-135, L141-204 | A "legacy" rollout stores `user_message` and `agent_message` events. A "paginated" rollout stores `item_completed`. Approval requests are never written, so a rollout cannot show `blocked`. |
| Injected texts | Local tag names of 3 rollouts | Some `user` texts are not typed by the user: `<environment_context>`, `<skill>`, `<image>`, and a text that starts with `#`. A parser must drop them, as `WRAPPER` does for Claude. |
| Subagents | `learn.chatgpt.com/docs/agent-configuration/subagents`. `codex-rs/protocol/src/protocol.rs` L2908-2923 | "Each subagent gets its own thread", with its own rollout file. `SessionSource` `subagent` `thread_spawn` holds `parent_thread_id`, `depth`, `agent_nickname`, `agent_role`. |
| `codex exec --json` | `codex-rs/exec/src/exec_events.rs` L8-36 | JSONL events `thread.started`, `turn.started`, `turn.completed`, `turn.failed`, `item.*` for a run that the caller starts. |
| `mcp-server` | Local `codex --help` | The 0.161.0 help lists no `mcp-server` subcommand. |
| Terminal title | `codex-rs/tui/src/terminal_title.rs` L1-3 | The TUI writes an OSC title with a spinner. herdr uses it. |

### 3.4 Other agents

| Agent | Status without herdr | Prompt from outside | Source |
|---|---|---|---|
| opencode 1.18.30 | `opencode serve` has SSE `GET /event` with `session.status` (`idle`, `busy`, `retry`) and `permission.asked`. A plugin `event` hook gets the same events. | `POST /session/:id/prompt_async`. A plain `opencode` TUI listens only with `--port`, `--hostname`, or `--mdns`. The docs say otherwise. | `opencode.ai/docs/server`, `packages/opencode/src/cli/cmd/tui.ts` L233-249 at v1.18.30 |
| Gemini CLI 0.64.0 | Hooks: `BeforeAgent` (working), `AfterAgent` (turn end), `Notification` with `ToolPermission` (blocked). | None found for a running TUI. | `google-gemini/gemini-cli` `docs/hooks/reference.md` |
| Aider 0.86.x | `--notifications-command` runs a command at idle and at a confirm prompt, but it does not tell them apart. History in `.aider.chat.history.md`. No session id. | No server. | `Aider-AI/aider` `aider/args.py` L825-840, `aider/io.py` L1088-1103 |
| Cursor CLI | Hooks in `~/.cursor/hooks.json`: `sessionStart`, `beforeSubmitPrompt`, `stop`. No approval hook found (unverified). The local build 2026.01.23 can miss newer events. | None found. | `cursor.com/docs/hooks`, `cursor.com/docs/cli/changelog` |
| Amp | Plugins: `agent.start`, `agent.end`. Threads live on the Amp server. | Only through ampcode.com. | `ampcode.com/docs` (plugins, remote control pages) |
| ACP (a protocol) | `session/update`, `session/request_permission`, and a `stopReason` per turn. The client starts the agent as a subprocess. It cannot watch a session that a terminal TUI started. | Only to an agent that the client started. | `agentclientprotocol.com`, "Architecture", "Prompt turn" |

### 3.5 Terminals and the process scan

| Tool | Layout | Focus | Send text | Source |
|---|---|---|---|---|
| tmux 3.7b | `list-panes -a -F` with `session_name`, `window_index`, `pane_id`, `pane_pid`, `pane_current_command`, `pane_current_path`, `pane_active`, `pane_left`, `pane_top`, `pane_width`, `pane_height`, `pane_title`. Control mode (`tmux -C`) pushes `%layout-change`, `%window-add`, and more. | `select-pane`, `select-window`, `switch-client -t %N` | `send-keys -t %N -l '<text>'`, then `send-keys -t %N Enter` | `man tmux` 3.7b: FORMATS, CONTROL MODE, `send-keys` |
| WezTerm 20240203 | `wezterm cli list --format json`: `window_id`, `tab_id`, `pane_id`, `workspace`, `size`, `title`, `cwd`, `left_col`, `top_row`, `is_active`, `is_zoomed`, `tty_name`. No pid. No events, so poll. | `wezterm cli activate-pane --pane-id N` | `wezterm cli send-text --pane-id N --no-paste` | `wezterm/src/cli/list.rs`, `wezterm.org/cli/cli/` |
| Ghostty 1.3.1 | AppleScript (since 1.3.0, called "a preview"): windows, tabs, and terminals with `id`, `name` (title), and `working directory`. No split geometry, no pid, no tty, no events. A pid field is on main, not in a release. | `focus <terminal>` | `input text "..." to <terminal>`, `send key "enter"` | Local `Ghostty.sdef`, `ghostty.org/docs/features/applescript`, release notes 1.3.0 |
| iTerm2 | Python API: windows, tabs, sessions, and the variables `path`, `jobPid`, `tty`. Off by default. | `Session.async_activate()` | `Session.async_send_text()` | `iterm2.com/python-api/session.html` |
| Process scan | `ps -A -o pid,ppid,pgid,tpgid,tty,stat,comm,args`: the foreground process of a TTY has `pgid == tpgid`. `lsof -a -p <pid> -d cwd -Fn` gives its cwd. No layout and no status. | None | None | `man ps`, `man lsof` (macOS) |

herdr runs inside Ghostty here. So Ghostty sees one terminal for each herdr window, and the herdr panes stay inside it (an inference from the object model).

## 4. Analysis

### 4.1 Mapping: each dependency, its replacement, and what is lost

"Codex with herdr" is the state today when a Codex agent runs in a herdr pane. "Without herdr" names the replacement for each source.

| Dependency | Codex with herdr | Without herdr: replacement | Lost without herdr |
|---|---|---|---|
| Rooms (workspaces) | Works | Group by git repo root (Codex `Thread.gitInfo`, or `git rev-parse` on the cwd), or by tmux session or WezTerm workspace | The room order (`number`) and the labels that the user set |
| Pods (tabs) | Works | tmux window or WezTerm tab. Without a terminal adapter: one pod for each repo or worktree | The tab order |
| Desks and rects | Works | tmux `pane_left`/`pane_top`/`pane_width`/`pane_height`, WezTerm `left_col`/`top_row`/`size`. `podLayout()` already puts desks without rects in one row (`public/model.js:37`). | All geometry with Ghostty or with no terminal adapter. Shell desks, because an agent source lists agents only. |
| Worker identity (`terminal_id`) | Works | Claude `sessionId`, Codex thread id, or the pid | A worker look changes when a session restarts. |
| Agent kind | Works (`codex`, white shirt) | The name of the adapter | Nothing |
| `working` | Works (screen) | Claude `status: busy` or a hook. Codex `active` with no flag. opencode `busy`. | A Codex `--no-daemon` session is not in the daemon. Its rollout gives only working and idle. |
| `blocked` | Works (screen) | Claude `waitingFor: permission prompt`, `PermissionRequest`. Codex `waitingOnApproval`, `waitingOnUserInput`. opencode `permission.asked`. | Agents with no API (Aider) |
| `done` against `idle` (`seen`) | Works | None. No source has a `seen` flag. The office must keep its own map: `done` after a turn end, until the user opens the panel. `docs/herdr-agent-model.md` section 6 sketches this. | The link to what the user saw in the terminal |
| `unknown` (startup, shell) | Works | An adapter with no status gives `unknown`. | The 3 s startup grace |
| Focus spotlight | Works | tmux `pane_active` and `window_active`, WezTerm `is_active` (its meaning is unverified), Ghostty `focused terminal` | Everything, with no terminal adapter |
| "Focus in herdr" | Works | tmux `select-pane` and `switch-client`, WezTerm `activate-pane`, Ghostty `focus <terminal>` (match by cwd or title, because 1.3.1 has no pid) | Everything, with no terminal adapter. No agent has a focus API. |
| Terminal raise | Works | `open -b` stays. Ghostty `focus` also raises the window. | Nothing |
| Message (`agent.prompt`) | Works | Codex `turn/start` or `codex queue` on the daemon. Claude: no API into a running TUI, so a terminal adapter must type the text (tmux `send-keys`, WezTerm `send-text`, Ghostty `input text`). | The `agent_blocked` refusal. The office must check the status first, and the agent can block between the check and the send. |
| `agent_session` | Only with the herdr codex integration. The hook can miss `HERDR_PANE_ID` under the daemon (unverified). | Native: Claude `sessionId`, Codex thread id | Nothing. This gets better. |
| Chat | Claude only | Claude transcripts as today. Codex rollouts (internal format) or the daemon `thread/read` and `thread/items/list` | Nothing more than today |
| Meetings | Claude only | Claude as today, with `sessionId` from `claude agents --json` in place of the cwd guess. Codex subagent threads (`parentThreadId`) from the daemon or the rollout `session_meta`. | Nothing more than today |
| Model id | Not in herdr | Codex `Thread.model`, rollout `turn_context.model`. Claude `SessionStart` `model`, the status line. | Nothing. This is new data. |

### 4.2 Sketch of the change

The page reads the herdr snapshot shape. Keep that shape as the normalized snapshot: `{ workspaces, tabs, panes, layouts, agents, focused_* }`. Then `buildOffice()` and most of `public/` stay the same. Each source gets one adapter that returns part of this shape. This is a sketch, not a design.

```text
herdr adapter  (today: herdrRequest('session.snapshot'))       --.
claude adapter (claude agents --json, transcripts)              ---> merge ---> { snapshot, meetings } ---> /events
codex adapter  (daemon socket, or rollout files)                 --'
terminal adapter (tmux or WezTerm): rooms, pods, rects, focus, send
```

The files and functions that change:

- `bridge.mjs` `poll()`: call the adapters and merge, in place of one `herdrRequest()`.
- `bridge.mjs` `readMessages()`: pick a reader by `pane.agent`. The Claude reader stays. A new `codexMessagesIn()` reads `response_item` `message` entries (and the legacy `user_message` and `agent_message` events), and drops `developer` texts and injected texts.
- `bridge.mjs` `newestIn()`: a Codex variant that walks `~/.codex/sessions/YYYY/MM/DD` and matches `session_meta.cwd`.
- `bridge.mjs` `readMeetings()`: a Codex variant from subagent threads.
- `bridge.mjs` `PANE` (line 162) and the `POST /action` branch: without herdr, a pane id such as `codex:<thread id>` fails the check. The action must go to the adapter that owns the pane.
- `public/model.js:328`: the orchestrator test `d.agent?.kind === 'claude'`. Better: the meeting names its desk.
- `public/office.js:871` `isClaude()` and `:927`: show the chat for each desk with a reader.
- `public/office.js:15`, `:18` `SHIRT` and `family()`: model families for Codex subagents.
- `public/office.js:923`, `:963`, `:1053`, `public/index.html:78-79`: the words "herdr".
- `test/bridge.test.mjs`: a fake rollout tree with a `SECRET` check, and a fake daemon socket for a daemon adapter.

The bridge has no npm dependencies. A daemon adapter needs a WebSocket client over a Unix socket. Node can make the HTTP Upgrade with `http.request({ socketPath })`, and the frame code is small. It is unverified whether the Node 25 global `WebSocket` can use a Unix socket.

### 4.3 Options

| Option | What | Effort | Risk |
|---|---|---|---|
| A. Codex chat with herdr | `codexMessagesIn()`, the Codex rollout lookup, and the chat for Codex desks. Find the rollout by `agent_session` when the herdr codex integration sets it, else the newest rollout of the cwd. | S | The rollout format is internal and has two history modes. Two panes with one cwd can show one chat, as for Claude today. |
| B. Codex meetings with herdr | Read subagent rollouts (`session_meta.source.subagent.thread_spawn.parent_thread_id`). A subagent runs while its last `task_started` has no `task_complete` and the file changed lately. | M | Internal format. The "runs" test is a heuristic, like `plainTail()` for Claude. |
| C. Read-only adapters without herdr | Claude: poll `claude agents --json`. Codex: a daemon client with `thread/loaded/list`, `thread/read`, and `thread/status/changed`. Rooms by repo root. No actions. | L | The Codex app-server is experimental. A Codex `--no-daemon` session is not visible. `claude agents` can start a supervisor. No `seen`, no layout, no shell desks. |
| D. Terminal adapter | tmux or WezTerm for the layout, the focus, and the send. Ghostty for the focus and the send only. | M, on top of C | The send has no `agent_blocked` refusal. Each terminal needs its own code. |
| E. Process scan only | `ps` and `lsof` give the agent kind and the cwd. | S | No status. Each worker shows `unknown`. Not useful alone. |

### 4.4 Recommendation

Keep herdr. It already gives the status of Codex and 21 other agent kinds, the layout, the focus, and a message that herdr refuses for a blocked agent. Take option A first:

1. Add `codexMessagesIn()` and a Codex rollout lookup in `bridge.mjs`. Check: a test with a fake rollout tree passes, and its `SECRET` text from `developer` texts, reasoning, and tool calls is not in the output.
2. Show the chat for each desk with a reader (`public/office.js:871`, `:927`). Check: a browser check with a fake herdr socket and a fake Codex desk.
3. Record a new INTENT.md decision, because decision 22 says that the chat works for claude agents only.

Take option B only if Codex subagents must sit in a meeting room. Take options C and D only if the office must run without herdr. Then start with C, read-only, and add the message last.

## 5. Open questions

1. What is the goal: Codex agents in the office (herdr already gives this), or an office with no herdr at all? The purpose in `INTENT.md` says "The user runs coding agents in herdr".
2. Do you run Codex with its shared daemon (the default) or with `--no-daemon`? The daemon decides what a daemon adapter sees. It can also hide `HERDR_PANE_ID` from the herdr codex hook (unverified).
3. May you install the herdr codex integration? It writes a hook to `~/.codex/hooks.json` and `[features] hooks = true` to `~/.codex/config.toml`, and Codex asks you to trust the hook. Without it, the Codex chat uses the newest rollout of the cwd.
4. For the Codex chat: the rollout files (internal format, no server) or the daemon API (experimental, needs a WebSocket client)?
5. Must Codex subagents get a meeting room? Decision 16 chose Claude Code subagents.
6. Without herdr: group the rooms by git repo, by cwd, or by terminal tab? Which terminal: tmux, WezTerm, or Ghostty (no geometry)?
7. Without herdr: is a message with no `agent_blocked` refusal acceptable? Decision 21 relies on that refusal.
8. Upgrade herdr from 0.8.2 to 0.9.5? 0.9.5 has protocol 22 and the Codex manifest 2026.10.11.1. This research did not check which manifest 0.8.2 uses now.

## 6. Sources

All sources were read on 2026-10-20.

herdr, master `143bf5fd4781d164260c63fe28e7dc08054ad32f` (2026-10-15, 0.9.5). Prefix each path with `https://github.com/herdrdev/herdr/blob/143bf5fd4781d164260c63fe28e7dc08054ad32f/`:

- `src/detect/mod.rs`, `src/detect/manifests/codex.toml`, `src/detect/manifest.rs`
- `src/integration/mod.rs`, `src/integration/targets.rs`, `src/integration/claude_settings.rs`, `src/integration/assets/codex/herdr-agent-state.sh`, `src/integration/assets/claude/herdr-agent-state.sh`
- `src/agent_resume.rs`, `src/app/actions.rs`, `CHANGELOG.md`
- `docs/next/website/src/content/docs/agents.mdx`, `docs/next/website/src/content/docs/integrations.mdx`
- https://herdr.dev/llms.txt
- Local: `herdr --help`, `herdr integration status`, `herdr api schema --json`, `herdr agent list` (counts only), herdr 0.8.2

Claude Code, docs with no version on the page, changelog to v2.1.304 (2026-10-19). Local CLI 2.1.292:

- https://code.claude.com/docs/en/agent-view
- https://code.claude.com/docs/en/hooks
- https://code.claude.com/docs/en/sessions
- https://code.claude.com/docs/en/settings-reference
- https://code.claude.com/docs/en/statusline
- https://code.claude.com/docs/en/headless
- https://code.claude.com/docs/en/sub-agents
- https://code.claude.com/docs/en/plugins/mods/api
- https://code.claude.com/docs/en/cross-session-messaging
- https://code.claude.com/docs/en/channels-reference
- https://code.claude.com/docs/en/terminal-config
- https://code.claude.com/docs/en/monitoring-usage
- https://code.claude.com/docs/en/changelog
- Local: `claude --version`, `claude agents --help`

OpenAI Codex, tag `rust-v0.161.0` (2026-10-07). Prefix each path with `https://github.com/openai/codex/blob/rust-v0.161.0/`:

- `codex-rs/features/src/lib.rs`, `codex-rs/tui/src/startup_orchestration.rs`, `codex-rs/tui/src/app/agents_overview_threads.rs`, `codex-rs/tui/src/session_queue_commands.rs`, `codex-rs/tui/src/terminal_title.rs`
- `codex-rs/app-server-transport/src/transport/mod.rs`, `codex-rs/app-server-transport/src/transport/unix_socket.rs`, `codex-rs/app-server-daemon/README.md`
- `codex-rs/app-server/src/thread_status.rs`, `codex-rs/app-server/src/outgoing_message.rs`, `codex-rs/app-server/src/lib.rs`, `codex-rs/app-server/src/request_processors/turn_processor.rs`
- `codex-rs/ext/queue/src/service.rs`, `codex-rs/hooks/src/legacy_notify.rs`, `codex-rs/hooks/schema/generated/`
- `codex-rs/rollout/src/recorder.rs`, `codex-rs/rollout/src/rollout_file_name.rs`, `codex-rs/rollout/src/policy.rs`, `codex-rs/protocol/src/protocol.rs`, `codex-rs/exec/src/exec_events.rs`
- https://learn.chatgpt.com/docs/app-server (redirect from developers.openai.com/codex)
- https://learn.chatgpt.com/docs/hooks
- https://learn.chatgpt.com/docs/config-file/config-advanced
- https://learn.chatgpt.com/docs/agent-configuration/subagents
- Local: `codex --help` and subcommand help, `codex features list`, `codex app-server generate-json-schema` (into a scratch folder), the key names of `~/.codex/config.toml`, `hooks.json`, and three rollout files

Other agents:

- opencode v1.18.30: https://opencode.ai/docs/server, https://opencode.ai/docs/plugins, https://github.com/anomalyco/opencode/blob/v1.18.30/packages/opencode/src/cli/cmd/tui.ts
- Gemini CLI v0.64.0 (2026-10-13): https://github.com/google-gemini/gemini-cli/blob/main/docs/hooks/reference.md
- Aider v0.86.2: https://github.com/Aider-AI/aider/blob/main/aider/args.py, https://aider.chat/docs/usage/notifications.html
- Cursor CLI: https://cursor.com/docs/hooks, https://cursor.com/docs/cli/changelog
- Amp: https://ampcode.com/docs (the plugins and remote control pages, last modified 2026-09-12 to 2026-10-18)
- ACP schema-v1.26.0 (2026-10-16): https://agentclientprotocol.com/get-started/architecture, https://agentclientprotocol.com/protocol/v1/prompt-turn, https://agentclientprotocol.com/get-started/agents

Terminals:

- tmux 3.7b: `man tmux` (local), https://github.com/tmux/tmux/blob/master/osdep-darwin.c
- WezTerm 20240203-110809-5046fc22: https://wezterm.org/cli/cli/index.html, https://wezterm.org/cli/cli/list.html, https://wezterm.org/cli/cli/send-text.html, https://wezterm.org/cli/cli/activate-pane.html, https://github.com/wezterm/wezterm/blob/main/wezterm/src/cli/list.rs
- Ghostty 1.3.1: https://ghostty.org/docs/features/applescript, https://ghostty.org/docs/install/release-notes/1-3-0, local `Ghostty.app/Contents/Resources/Ghostty.sdef`
- iTerm2 Python API 0.26: https://iterm2.com/python-api/session.html
- macOS `man ps`, `man lsof` (local)
