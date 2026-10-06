# How herdr works with coding agents: analysis for a three.js office

Scope: the facts come from the herdr source at commit 5da0a01 ([herdrdev/herdr](https://github.com/herdrdev/herdr), master, Cargo version 0.9.3, protocol 22). They also come from read-only probes against the installed herdr 0.8.2 server (protocol 20). When the two versions differ, the text says so. For an office that talks to this machine, the contract is the live `herdr api schema --json` output. The scratchpad `herdr-api.schema.json` is byte-identical to it.

## 1. How herdr models agents

### Hierarchy

| Level | ID example | Facts |
|---|---|---|
| Server / session | socket path | One background server owns all processes. Clients attach and detach. A named session is a separate namespace with its own socket. |
| Workspace | `w1`, `w2` | The top-level project container. `number` is the sidebar position (index + 1). It changes when you reorder workspaces. A workspace can have a `worktree` record. |
| Tab | `w1:t1Q` | One layout in a workspace. `number` is stable and herdr never reuses it (live values include 55, 101 and 102). A tab with no custom name uses its position as the label. |
| Pane | `w1:p4H` | One rectangle in a tab layout. Pane numbers are per workspace, and herdr never reuses them. The `seen` flag is on the pane. |
| Terminal | `term_<hex µs><hex counter>` | An opaque process identity. The agent state, the agent kind and the agent name are on the terminal. The terminal ID does not change when a pane moves. |
| Agent | pane ID or agent name | A terminal that herdr recognizes. `snapshot.agents` is a subset of `panes`. |

- The ID suffix uses bijective base-32 with the alphabet `123456789ABCDEFGHJKMNPQRSTVWXYZ0`. For example, 55 encodes as `1Q`.
- Workspace IDs come from a global counter. Tab and pane numbers are per workspace.
- A pane can exist without an agent. In the live session, 2 of the 48 panes have an agent.
- `snapshot.agents` lists only terminals where `is_agent_terminal()` is true. This includes a named terminal during a pending managed launch, which can have no agent kind yet.
- Server internals: `AppState.terminals` is a `HashMap<TerminalId, TerminalState>`. `TerminalState` holds `state`, `detected_agent`, `agent_name`, `last_agent_state_change_seq` and `last_agent_completion_seq`.

### Lifecycle states

The detector has 4 raw states. The API has 5 statuses.

| API `agent_status` | Server state | Meaning |
|---|---|---|
| `working` | `Working` | The agent is in a turn. |
| `blocked` | `Blocked` | The agent waits for the user, for example at a permission dialog. |
| `done` | `Idle` and `seen == false` | The agent finished, and nobody viewed the pane after that. |
| `idle` | `Idle` and `seen == true` | The agent is ready for input. Either somebody saw the completion, or there was no completion. |
| `unknown` | `Unknown` | One of these: a plain shell, an unrecognized program, the 3 s startup grace window of a new agent, or a released agent. |

The docs say that `idle` and `done` both mean "ready for input". `done` is not a detected state. The API derives it from `Idle` and the `seen` flag of the pane.

### The `seen` flag on the server

- The server sets `seen = false` only on a completion transition (`Working` or `Blocked` to `Idle`). The pane must also be outside the active tab, or the outer terminal must have reported a focus loss.
- The outer-terminal focus starts as "not reported" (`None`), and herdr treats `None` as focused. Thus a completion in the active tab stays `idle` until the terminal reports a focus loss.
- `seen` also stays true while completion suppression is on (agent acquisition, forced suppression).
- Any state other than `Idle` sets `seen = true`.
- These events also set `seen = true`: a tab switch, `mark_active_tab_seen`, and a change of the agent label or agent session (`completion_reset`).
- The `pane.focus` and `agent.focus` API calls run `mark_active_tab_seen`. That call marks every pane in the tab, not only the target pane.
- A new pane starts with `seen = true`. The first `Idle` after a new detection or a managed launch is not a completion. A new agent shows `idle`, not `done`.
- Reads do not change `seen`.
- A change of `seen` emits no hub event and does not change `state_change_seq`.

### The `seen` flag in each TUI client (master)

From 0.9.0, the terminal UI runs in each client, and each client keeps its own seen state. The 0.8.2 docs do not describe per-client badges.

- The client stores `acknowledged[pane_id] = state_change_seq`.
- It acknowledges a completion only when it draws that pane on screen and its terminal window has focus.
- It does not use the server's done/idle split. It derives completion again from what it saw (`Working`, then `Idle`), or from server completions keyed by `state_change_seq`.
- When a client attaches, it fills `acknowledged` with the current `state_change_seq` of each agent. A new client therefore shows all older completions as `idle`.
- So one client can show `done` while a second client shows `idle`. API and CLI statuses use the server `seen` flag, and they need not match any client badge.

### Roll-up

Status rolls up from pane to tab to workspace. The highest rank wins:

```text
blocked (4) > done (3) > working (2) > idle (1) > unknown (0)
```

- A done agent ranks above a working agent. The test `aggregate_state_done_unseen_beats_working` asserts this.
- The server calculates `tab.agent_status` and `workspace.agent_status` with this rule (`Workspace::aggregate_state`, `tab_info`). The TUI client calculates them again over its own statuses.
- A collapsed worktree group shows the maximum over the parent and its linked children only.
- No event reports a change in roll-up status. `workspace.updated` comes only from worktree code. Calculate the roll-up yourself, or read `session.snapshot` again.
- When two panes have the same rank, the roll-up value is the same. The pane that "wins" depends on HashMap iteration order.

### Layout geometry

`snapshot.layouts[]` has one entry for each tab:

```text
{ workspace_id, tab_id, zoomed, focused_pane_id,
  area:   {x, y, width, height},
  panes:  [{pane_id, focused, rect}],
  splits: [{id, direction: "right" | "down", ratio, rect}] }
```

- Rects are in terminal cells. They are absolute in the server view. To get positions relative to the tab, subtract `area.x` and `area.y`.
- `area` is one global value (the server terminal area), so all tabs share it. In the live snapshot, all 25 layouts have x=36, y=1, 239 × 62.
- A split ID is `split_<idx>_root` or `split_<idx>_<path bits>`.
- A zoomed tab still reports the rects from before the zoom. Only `zoomed: true` tells you that the focused pane fills the area.
- Each tab remembers 1 focused pane. The top-level `focused_workspace_id`, `focused_tab_id` and `focused_pane_id` give the global focus.

### Worktree groups

- A workspace can have `worktree {repo_key, repo_name, repo_root, checkout_path, is_linked_worktree}`. The client field is `worktree.key`.
- A group forms only when one key has a main checkout (`is_linked_worktree: false`) and at least 1 linked worktree.
- The sidebar indents children with `├─` and `└─`.
- A child that has no custom label shows its branch without the `worktree/` prefix. A child that has no branch keeps the workspace label.
- `▾` and `▸` toggle the group. A collapsed group still shows the focused linked child as a row.
- No live workspace had a worktree record. This shape comes only from the source and the schema.

### Presentation in the TUI

- **Colors:** working is yellow `#f9e2af`, blocked is red `#f38ba8`, done is teal `#94e2d5`, idle is green `#a6e3a1` and unknown is overlay0 `#6c7086`. These are theme palette slots, and the hex values are the Catppuccin defaults.
- **Glyphs:** the default style is "dots". It uses `●` for working, blocked and done (only the color differs), `○` for idle and `·` for unknown. With `ui.status_indicators = "symbols"`, herdr uses `×` blocked, `◐` working, `✓` done, `○` idle and `·` unknown.
- **Spaces sidebar:** the default rows are `[state_icon, workspace]` and `[branch, git_status]`.
- **Agents panel:** the default rows are `[state_icon, machine, workspace, tab]` and `[agent]`. `ui.agent_panel_sort` is `spaces` (the default, with the header label "grouped") or `priority` (rank first, then the newest `state_change_seq`). An active agent view from `agent.view.set` overrides both.
- **Desktop tab bar:** it draws no agent badge. It shows only the label, plus ` Z` for a zoomed tab.
- **Mobile summary:** it shows counts in the order blocked, done, working, idle, for example "◉ 1 blocked · ● 2 done". Only the first segment gets a status color. A done count in first position is blue. A red icon in the header shows when any agent is blocked.
- AGENTS.md calls colors and sidebar layout client presentation. A visualizer can choose its own.

### Notifications and sounds

| Trigger | Sound | Toast title | Suppression |
|---|---|---|---|
| A transition into `Blocked` | `Request` | `<agent label> needs attention` | The active tab does not mute it. Delivery waits `toast.delay_seconds` (default 1 s), and herdr drops the notification if the state is no longer `Blocked`. |
| `Working` or `Blocked` to `Idle` | `Done` | `<agent label> finished` | Herdr suppresses it when the pane is in the active, focused tab. The client shows the toast only if the pane still shows as `done`. |

- Both notifications need `sound.allows(agent)` to be true and completion suppression to be off.
- The toast context is `<workspace label> · <workspace number>`. Herdr adds ` · <tab label>` only when the workspace has more than 1 tab.
- Toast delivery is `off` by default. The other values are `herdr`, `terminal` and `system`. A toast stays for 8 s (needs attention) or 5 s (finished), and the queue holds at most 8.
- Sounds are on by default and use embedded mp3 files. The config keys are `path`, `done_path` and `request_path`. You can enable or disable sound per agent. Droid is disabled by default.
- The socket API has no notification events. An office must derive "needs attention" and "finished" from status transitions.

## 2. How herdr detects state

### Process detection: which program is the agent

- Each pane has a detection task. The task polls at these intervals:
  - every 300 ms when it knows the agent
  - every 500 ms when it does not know the agent
  - every 100 ms during an idle confirmation
  - every 50 ms during a pending release
- The task reads the foreground process group of the pane TTY (`e_tpgid` on macOS). It checks the group leader first. If the leader does not match, it scores each job member.
- It reads through wrappers (`node`, `bun`, `python -m`, `sh -c`, `cmd /c`, `pwsh -File`) and known npm package paths.
- An alias table maps process names to kinds. Master knows 24 kinds: pi, claude, codex, gemini, cursor, devin, agy, cline, omp, mastracode, opencode, copilot, kimi, kiro, droid, amp, grok, hermes, kilo, qodercli, qwen, letta, maki and muse. The 0.8.2 binary lists 22 kinds, without letta and muse.
- `HERDR_AGENT=<kind>` in the environment of a foreground process overrides the name lookup. This exists for sandbox wrappers. `HERDR_PROCESS_DETECTION=child-groups` is an opt-in fallback for Linux runtimes that have no TTY foreground group.
- The agent identity is sticky. Herdr clears it only after 6 probe misses in a row. When the shell returns to the foreground, herdr first publishes an `idle` "process exit", so waiters see the completion.
- A new agent starts as `Unknown`. Herdr does not read the screen for the first 3 s (the startup grace window).

### Screen detection: TOML manifests

- 22 kinds have a bundled manifest. OMP and MastraCode have none.
- Herdr selects a manifest in this order:
  1. a valid local override in `~/.config/herdr/agent-detection/<id>.toml`
  2. the remote cache from herdr.dev, if it is not older than the bundled copy
  3. the bundled copy
- The engine version is 3. A remote manifest must declare a `min_engine_version` of 3 or less. `[update] manifest_check = false` disables background checks. `herdr server update-agent-manifests` and `reload-agent-manifests` apply changes without a restart.
- A rule has `id`, `state`, `priority` and `region`. It can have the flags `visible_idle`, `visible_blocker`, `visible_working` and `skip_state_update`. It can also have nested `all`, `any` and `not` gates with `contains` (case-insensitive), `regex` and `line_regex`.
- Most regions read the live bottom of the buffer, not the scrolled viewport. `osc_title` reads the OSC 0/2 title and `osc_progress` reads the OSC 9 progress (256 characters maximum).
- The engine evaluates all rules, and the highest-priority match wins. On a tie, the first rule in the file wins. If no rule matches a known agent, the state is `idle` with `fallback_reason = default_known_agent_idle_fallback`.
- A `skip_state_update` rule must use state `unknown`, and herdr does not publish it, so the previous state stays. Examples are the Claude transcript viewer, the Claude model picker and the Codex transcript viewer.
- Claude rules:
  - A braille or half-circle spinner in the OSC title gives `working` (priority 1100).
  - "esc to interrupt" gives `working` (970).
  - Permission and form dialogs give `blocked` (980, 850 or 840).
  - The `❯` prompt box gives `idle` (950).
  - An OSC title that starts with `✳ ` gives `idle` (250).

### Debounce and timers

- A change from `working` to a plain `idle` (one with no `visible_idle` evidence) waits for 3 confirmations, 100 ms apart, with a 700 ms cap. A `visible_idle` rule publishes at once.
- A stable visible blocker publishes again every 800 ms.
- The task does not scan the screen when the state is `idle` (or when a Codex agent is `unknown`) and the screen did not change.

### Hooks and precedence

Hooks call `pane.report_agent` (`state`, `seq`, `source`, optional `message`) or `pane.report_agent_session` on `$HERDR_SOCKET_PATH`. The hook script runs only when `HERDR_ENV=1` and `HERDR_PANE_ID` are set. It uses a 0.5 s timeout and `time.time_ns()` as `seq`. Herdr drops a report if its `seq` is not higher than the last accepted `seq` from the same source. After the first report with a `seq`, herdr also ignores reports without one from that source.

Precedence in `recompute_effective_state`:

1. **Full-lifecycle hooks** (`herdr:pi`, `herdr:omp`, `herdr:mastracode`, `herdr:opencode`, `herdr:kilo`, `herdr:kimi`) own the state while the matching process is alive. Herdr does not read the screen (`screen_detection_skipped`), and a screen blocker cannot override the hook.
2. **Session-only integrations** (`herdr:hermes`, `herdr:qwen`, `herdr:letta`, `herdr:antigravity_cli`) cannot set state. Herdr drops their state reports.
3. **Other hooks** (`herdr:codex`, custom sources, self-reporting agents such as Crush): the hook state beats the screen state, with one exception. A screen `visible_blocker` for the same agent, seen at or after the hook report, makes the state `blocked`. A screen `blocked` without `visible_blocker` cannot override a hook. An example is the Claude rule `legacy_no_prompt_blocker` at priority 300.
4. **Claude:** the integration (v10) sends only the `SessionStart` session identity. Herdr gets the Claude state only from the screen.

Herdr drops hook reports in some more cases:

- a known label that conflicts with the detected process
- a report (not from a full-lifecycle source) that arrives soon after a process exit
- a session owner conflict
- a Codex session mismatch

`pane.report_agent` accepts any non-empty label. A known alias becomes the canonical label (`claude-code` becomes `claude`). Herdr keeps an unknown label as a trimmed string, so Crush and Command Code show their own names. Codex hooks map `UserPromptSubmit` to working and `Stop` or `Interrupt` to idle. They are reliable only with `codex --no-daemon`.

### Extra detail that a visualizer can read

- **AgentInfo:** the server returns it only for agent terminals. It has `agent`, `name`, `display_agent`, `title`, `terminal_title`, `terminal_title_stripped`, `state_labels`, `tokens`, `agent_session`, `screen_detection_skipped`, `launch_pending`, `interactive_ready`, `state_change_seq`, `focused`, `cwd`, `foreground_cwd` and `revision`.
- **PaneInfo:** it does not have the four launch and detection fields. It has `label` and `scroll`. The herdr version in use also sends `agent_session` on each pane (`null` when unset).
- The server leaves out null, false and empty fields. A missing `name` means that the agent has no name.
- `terminal_title_stripped` removes one leading spinner glyph. For Claude, it gives the task title.
- `title`, `display_agent`, `state_labels` (one label for each state) and `tokens` come from `pane.report_agent` and `pane.report_metadata`. They are display-only and have a maximum of 80 characters.
- `state_change_seq` is the value of a server-wide counter at the last state transition of this terminal. It is 0 if the state never changed. The counter starts again at 0 when the server starts.
- `revision` is a counter per terminal. It increments on these changes: the stripped title, metadata tokens, token TTL expiry and `restore_error`.
- `completion_seq` exists only on master. The 0.8.2 schema does not have it.
- The API does not show the hook `message` (the blocked reason that Pi and OMP send). The matched rule ID, for example `bash_permission_prompt`, shows only in `herdr agent explain`, and that output includes screen text.

## 3. How to read it live

### Socket path

The first match wins:

1. `HERDR_SOCKET_PATH`
2. `HERDR_SESSION=<name>`, which gives `<config>/sessions/<name>/herdr.sock`
3. `<config>/herdr.sock`

`<config>` is `$XDG_CONFIG_HOME/herdr`, or `~/.config/herdr` when that variable is not set. A CLI `--session` flag overrides all three. Herdr sets `HERDR_SOCKET_PATH` in each managed pane. The default path is `~/.config/herdr/herdr.sock`, with mode `srw-------`. A browser cannot open a Unix socket, so the office needs a bridge.

### Framing

- The wire format is newline-delimited JSON, with one request per connection.
- The server reads only the first line (5 s timeout, 1 MiB maximum). It writes one response line and then closes the socket. Only `events.subscribe` and the wait methods keep the socket open.
- There is no handshake. `ping` is optional.
- `params` is required. A request without it returns `invalid_request`, with `id: ""` on 0.8.2. Always send `"params":{}`.
- Do not write anything after the subscribe line. The server treats any byte as a close. In the probe, the server closed the subscription 348 ms after one `\n`.
- There is no keepalive, and an idle server writes nothing. To detect a server stop, watch the socket `end` and `close` events.

### Request lines that the probe proved

Ping:

```json
{"id":"probe:ping","method":"ping","params":{}}
```

```text
<- {"id":"probe:ping","result":{"type":"pong","version":"0.8.2","protocol":20,"capabilities":{"detached_server_daemon":...,"live_handoff":...}}}
   (the server then closes the socket)
```

Snapshot (read-only):

```json
{"id":"probe:snapshot","method":"session.snapshot","params":{}}
```

```text
<- {"id":"probe:snapshot","result":{"type":"session_snapshot","snapshot":{
     "version","protocol","focused_workspace_id","focused_tab_id","focused_pane_id",
     "workspaces":[],"tabs":[],"panes":[],"layouts":[],"agents":[]}}}
```

The live snapshot had 17 workspaces, 25 tabs, 48 panes, 25 layouts and 2 agents. The probe saw these record fields:

| Record | Fields |
|---|---|
| workspace | `workspace_id, number, label, focused, pane_count, tab_count, active_tab_id, agent_status`, plus an optional `worktree` |
| tab | `tab_id, workspace_id, number, label, focused, pane_count, agent_status` |
| pane | `pane_id, terminal_id, workspace_id, tab_id, focused, cwd, foreground_cwd, label?, agent?, agent_status, terminal_title, terminal_title_stripped, agent_session, scroll{offset_from_bottom, max_offset_from_bottom, viewport_rows}, revision` |
| agent | `pane_id, terminal_id, workspace_id, tab_id, agent, agent_status, focused, cwd, foreground_cwd, terminal_title, terminal_title_stripped, state_change_seq, revision`, plus the optional presentation fields |
| layout | `workspace_id, tab_id, zoomed, focused_pane_id, area, panes[], splits[]` (see section 1) |

Subscribe. The probe sent a line of this shape (the dossier does not give the middle of the list):

```text
-> {"id":"probe:sub","method":"events.subscribe","params":{"subscriptions":[{"type":"workspace.created"},...,{"type":"pane.agent_detected"},{"type":"layout.updated"},{"type":"pane.agent_status_changed","pane_id":"<id>"}]}}
<- {"id":"probe:sub","result":{"type":"subscription_started"}}
<- one event per line
```

The line below has all 24 subscription types that need no `pane_id`. I built it from the schema list. The probe did not send this exact line.

```json
{"id":"office:life","method":"events.subscribe","params":{"subscriptions":[{"type":"workspace.created"},{"type":"workspace.updated"},{"type":"workspace.metadata_updated"},{"type":"workspace.renamed"},{"type":"workspace.moved"},{"type":"workspace.reordered"},{"type":"workspace.closed"},{"type":"workspace.focused"},{"type":"worktree.created"},{"type":"worktree.opened"},{"type":"worktree.removed"},{"type":"tab.created"},{"type":"tab.closed"},{"type":"tab.focused"},{"type":"tab.renamed"},{"type":"tab.moved"},{"type":"pane.created"},{"type":"pane.closed"},{"type":"pane.updated"},{"type":"pane.focused"},{"type":"pane.moved"},{"type":"pane.exited"},{"type":"pane.agent_detected"},{"type":"layout.updated"}]}}
```

Per-pane status, for two example agent panes from `herdr agent list`:

```json
{"id":"office:status","method":"events.subscribe","params":{"subscriptions":[{"type":"pane.agent_status_changed","pane_id":"w1:p1"},{"type":"pane.agent_status_changed","pane_id":"w1:p2"}]}}
```

- Three types need a `pane_id`: `pane.agent_status_changed` (with an optional `agent_status` filter), `pane.scroll_changed` and `pane.output_matched`.
- Without a filter, the subscription sends no initial event. It sends only later changes, so take the start state from the snapshot.
- With a filter equal to the current status, the server sends one initial event at once. The probe saw this for both agents within 176 ms. A filter also restricts all later events to that status, so use it only for a one-status wait.

### Event envelopes

```text
lifecycle: {"event":"pane_updated","data":{"type":"pane_updated","pane":{...PaneInfo}}}
per-pane:  {"event":"pane.agent_status_changed","data":{"pane_id":"..","workspace_id":"..","agent_status":"working","agent":"claude"}}
error:     {"id":"..","error":{"code":"..","message":".."}}
```

| Wire `event` | Seen live | Payload fields from the dossier |
|---|---|---|
| `pane.agent_status_changed` | yes | `pane_id, workspace_id, agent_status`, and optional `agent, title, display_agent, state_labels` |
| `pane_agent_detected` | yes (2 in 15 s) | `agent`, `released` (left out when false), `final_status` |
| `pane_updated` | yes (60 in 15 s) | the full PaneInfo |
| `workspace_created`, `workspace_focused`, `tab_created`, `tab_focused`, `pane_created`, `pane_focused`, `layout_updated` | yes (1 each) | not recorded. Treat these events as invalidation signals. |
| the other lifecycle kinds, for example `pane_closed` | no | The source uses the snake_case form of the dotted request type. This was not observed live. |

- Request types use dotted names. Lifecycle events arrive in snake_case, with `data.type` equal to `event`. Per-pane events arrive with the dotted name and no `data.type`.
- `pane.agent_status_changed` fires when the status changes. It also fires when only the presentation changes (`title`, `display_agent`, `state_labels`). Compare `agent_status` with the cached value before you animate a transition.
- `pane_updated` fires on changes to the title, the agent name, the pane name and the metadata. It does not fire on a status change, so do not use it as a status signal.
- `pane_agent_detected` fires when the agent label changes or when the agent releases the pane.
- There is no global agent-status stream. If any pane in a subscribe request does not exist, the server rejects the full request with `pane_not_found` and closes the connection. On 0.8.2, the error `id` is an internal value (`<req>:sub:<index>:probe`), not your request ID.
- A `seen` change (`done` to `idle`) emits no hub event. The source shows that the per-pane subscription poll (`pane.get`) catches it. This was not tested live.
- Each status entry runs `pane.get` on each poll in which no hub event matched it. The poll period is the 100 ms sleep plus the time of the `pane.get` calls, which run one after the other. With 4 entries, the probe measured about 175 ms.
- The server runs one OS thread for each connection. An entry for a closed pane sends no error and continues to poll until the client closes the connection.
- `pane.output_changed` is in the schema, but only test code emits it.
- `events.wait` supports only `pane_agent_status_changed` matches.
- `herdr terminal session observe` (0.7.2 or later) gives a read-only live ANSI stream for each pane, as NDJSON `terminal.frame` records.

### Order and recovery

- Order is guaranteed only inside one subscription entry. The server polls the entries one after the other, so a batch groups events by entry. A `layout_updated` can arrive before a `pane_created` that happened first.
- Snapshots and events share no sequence. Do not replay buffered events onto a snapshot. Treat each event as a signal that something changed.
- The server keeps the last 512 events. The sequence number never goes on the wire.
- **Replay:** from 0.9.0, a new lifecycle subscription starts with live events only. On 0.8.2, a new subscription seems to replay retained events. A 3 s `pane.created` subscription returned a `pane_created` event while the pane count stayed at 48. Subscribe first and then read the snapshot. That order works on both versions.
- **`events_lost` (0.9.2 and later):** the server sends `{"id":<sub id>,"error":{"code":"events_lost"}}` and closes. To recover:
  1. Open a new subscription.
  2. Wait for `subscription_started`.
  3. Read `session.snapshot` on a second connection.
  4. Replace the cache.

  The 0.8.2 binary does not contain the `events_lost` string. Its behavior with a slow reader is not known.
- Master sets a 5 s write timeout. If the client stops reading, the subscription ends with an I/O error.
- **Error shape:** `{"id","error":{"code","message"}}`. These codes apply to a read-only client: `invalid_request`, `invalid_params`, `pane_not_found`, `workspace_not_found`, `tab_not_found`, `agent_not_found`, `layout_not_found`, `invalid_regex`, `unsupported_event_wait_match`, `connection_local_only`, `server_unavailable`, `timeout`, `internal_error` and `events_lost`. The source has about 80 codes in total.

### Version floor

| Version | Change |
|---|---|
| 0.2.0 | socket API and event subscriptions, including agent state |
| 0.4.5 | the `done` status |
| 0.6.3 | status subscriptions reliably deliver a state that already matches |
| 0.7.0 | plugins v1 and short IDs (`w1:p1`) |
| 0.7.2 | `session.snapshot`, `herdr api schema` and `layout.updated` (the minimum for this design) |
| 0.9.0 | lifecycle subscriptions start live, without replay |
| 0.9.2 | the `events_lost` error |

## 4. Orchestration concepts

- **Three primitives:** layout (workspace, tab and pane topology), pane (a raw terminal) and agent (the recognized process in a pane). `agent start` never creates layout.

- **Names:**
  - A name must match `[a-z][a-z0-9_-]{0,31}` and be unique among live agents. The errors are `invalid_agent_name` and `agent_name_taken`.
  - Herdr stores the name on the terminal (`agent_name`), not on the pane, and the name follows the terminal on `pane move`.
  - Herdr clears the name when the agent exits with no agent detected, when a different kind or session takes over, or when a managed launch times out. Detection uncertainty keeps the name.
  - A manually launched agent has no name until `agent rename`. `agent rename` refuses during a pending launch (`agent_launch_pending`).
  - Herdr resolves a target as the pane ID first (only if that pane has an agent), then as a unique live name. Duplicates give `agent_target_ambiguous`.
  - Agent targets do not accept `terminal_id` or a kind label.

- **Start:**
  - `herdr agent start <name> --kind K --pane P` needs an existing pane whose shell owns the foreground. It types the canonical executable and its arguments into that shell.
  - A managed launch has a 3 s settle time and a 30 s default timeout. The valid timeout range is more than 3 s and at most 300 s.
  - The raw socket `agent.start` returns at once. Only the CLI waits for readiness: it polls `agent.get` every 100 ms.
  - The CLI reports success when the expected kind owns the same terminal and is `idle` or `done` with `interactive_ready`. Codex is also ready when it is `unknown` with `interactive_ready`.
  - A `blocked` state during startup gives `agent_not_ready`, and the name stays usable. The other CLI outcomes are `agent_kind_mismatch`, `agent_name_not_found`, `agent_start_failed` and `timeout`.
  - During a pending launch, the agent already shows in `agent.list` with `launch_pending: true`.

- **Prompt:**
  - `agent prompt` writes the text, waits 300 ms and sends Enter, as one ordered submission.
  - It refuses a blocked agent with `agent_blocked` and sends nothing. It refuses a pending launch, or an agent that is no longer in the foreground, with `agent_not_ready`. It refuses empty text with `empty_agent_prompt`.

- **Wait:** `agent prompt --wait` has two phases.
  1. Activity gate (5 s): the agent must show `working` or `blocked`. If the gate fails, the result is `agent_prompt_stalled`. If 5 s or less of the timeout remains, the result is a plain `timeout`.
     - The gate does not run if the agent was already `working`, or if the prompt response already shows `working` or `blocked`.
     - A `pane.agent_status_changed` event counts at once. A probed state needs a `state_change_seq` higher than the baseline.
  2. Settle: herdr waits for `--until`. The default is `idle|done|blocked`.

  Each wait pins the terminal ID, the name and the kind. A close, an exit, a move, a replacement, or a release without a matching `final_status` gives `agent_not_running`. Waits have no default timeout.

- **Blocked:** herdr never answers a dialog. The documented loop is `agent wait --until blocked`, then `agent read`, then a deliberate `agent send-keys` (`esc`, `enter`, arrow keys, `ctrl+c`). The bundled skill tells agents to ask the user first.

- **Focus:** `agent focus` marks the active tab as seen, for all panes in that tab. Reads do not mark anything as seen.

- **Worktrees:**
  - `worktree create` makes a Git worktree and opens it as a new workspace under the repo workspace. It returns `workspace`, `tab`, `root_pane` and `worktree`, and `root_pane` is the natural target for `agent start`.
  - Herdr has no "one agent per worktree" rule.
  - `worktree remove` runs `git worktree remove` and never deletes the branch.
  - On master, to close a primary workspace that has linked worktrees, you need `--group`.

- **Plugins:**
  - `herdr-plugin.toml` declares startup hooks, actions, event hooks, panes (`overlay|popup|split|tab|zoomed`) and link handlers. The full CLI, through `HERDR_BIN_PATH`, is the plugin API.
  - Startup hooks run once and herdr does not supervise them. Plugin v1 cannot draw a non-terminal UI.
  - Event hooks accept 22 kinds. These include `pane.agent_status_changed` (for any pane, with no `pane_id`) and `pane.agent_detected`. They do not include `pane.updated`, `pane.output_changed`, `layout.updated` or `workspace.metadata_updated`.
  - Each hook event starts one process. The process gets the event in `HERDR_PLUGIN_EVENT_JSON`.

- **Agent view:** `agent.view.set` installs one temporary filter and sort for the Agents sidebar. It does not change `agent.list`, notifications, detection or the global attention counts.

- **Notifications:** `notification show <title> [--body] [--position] [--sound none|done|request]` uses the `[ui.toast]` delivery setting. The title has a maximum of 80 characters and the body a maximum of 240.

- **Custom commands:** a `[[keys.command]]` entry has the type `popup`, `pane`, `shell` or `plugin_action`. It gets `HERDR_SOCKET_PATH`, `HERDR_BIN_PATH` and the `HERDR_ACTIVE_*` IDs.

- **Machines (master only):** the 0.8.2 binary contains no `machine` string.
  - Each SSH machine runs its own server, and IDs and names belong to one server.
  - `herdr --machine <label-or-id>` sends supported commands to one machine over SSH, without a TUI. The supported commands include `agent`, `pane`, `tab`, `workspace`, `worktree`, `notification`, `api snapshot`, `plugin` and `status server`. `events.subscribe` is not on the list.
  - The TUI streams state from machines that are not selected. When a connection is lost, the TUI shows the cached state dimmed.

- **Persistence:**
  - A detach keeps all processes alive. A server restart restores layout, cwd and focus, but not processes. `--handoff` tries to keep processes alive.
  - A conversation resumes only when one of these exists: an official integration reported a session reference, or the agent reported a `resume_argv` (0.9.2 or later). Herdr then types a command such as `claude --resume <id>` into a new shell, after a client attaches, with a delay between agents.
  - Managed names come back only for resumed panes or after a live handoff. If two panes have the same session reference, only the first one resumes.
  - The 2 live Claude agents have no `agent_session`. After a restart, they would return as plain shells.

## 5. Concept-to-office mapping

| herdr concept | Office element | Visual behaviour |
|---|---|---|
| Server / named session (socket) | Building | One building for each socket. The building goes dark when the socket closes, and the lights return after the bridge reconnects. On master, use one building for each SSH machine, and key everything by machine plus ID. |
| Workspace | Room on a corridor | Order the rooms by `number` (the sidebar position). The door light shows `workspace.agent_status`. The door sign shows `label`. |
| Worktree group | Main room with annex rooms on a short side corridor | The main checkout is the main room. Each linked worktree is an annex with its branch name (without `worktree/`) when it has no custom label. A collapsed group shows only the main-room light, with the maximum over the parent and the linked children. The focused child stays visible. |
| Tab | Desk cluster (pod) in the room | The pod lamp shows `tab.agent_status`. The herdr tab bar does not draw this badge, so it is office-only. |
| Pane | Desk with a monitor | A desk exists with or without a worker. `pane_created` adds a desk, and `pane_closed` removes it. |
| Layout geometry | Floor plan of the pod | Desk position and size = (rect − area origin) ÷ area size, with x to floor X and y to floor Z. A `right` split is a glass wall at `rect.x + ratio × width`. A `down` split is a wall at `rect.y + ratio × height`. If `zoomed` is true, make the focused desk larger and dim the others. Ignore the rects from before the zoom. |
| Terminal | Worker identity | Key each avatar by `terminal_id`. When a pane moves, the same worker walks to the new desk. |
| Agent kind | Avatar model or uniform | Use one model for each kind (24 on master, 22 on 0.8.2). An unknown self-reported label gets a generic avatar. The nameplate shows `display_agent`, or `agent` when `display_agent` is not set. |
| Agent name | Name badge | Show `name`. An agent without a name shows its pane ID on a sticky note. The badge leaves with the worker, because the name belongs to the occupant, not the desk. |
| Managed launch (`launch_pending`) | New hire | The worker walks to the desk and waits until `interactive_ready` is true. |
| `pane_agent_detected`, `released` false | Worker arrives | The worker sits. The first 3 s are `unknown` (startup grace). |
| `pane_agent_detected`, `released` true | Worker leaves | The worker stands and leaves. `final_status` selects the exit pose. The desk becomes an empty shell desk. |
| `idle` | Worker at rest at the desk | Green `#a6e3a1`. The worker rests in the chair, and the monitor shows a prompt. The worker is ready for input. Keep the worker at the desk, because the agent still occupies the pane. **Replaced by `INTENT.md` decision 19:** an idle worker browses at the desk and sometimes walks to the kitchen. |
| `working` | Worker types | Yellow `#f9e2af`. The monitor text scrolls. A spinner shows above the head when `terminal_title` starts with a spinner glyph. The monitor can show `terminal_title_stripped` or `title` if the viewer enables it. |
| `blocked` | Raised hand and a red beacon | Red `#f38ba8`. After 1 s, if the agent is still blocked, the desk phone rings ("needs attention", 8 s). A speech bubble shows `state_labels.blocked` when the agent set it. Herdr does not give the blocked reason. |
| `done` | Finished work that nobody saw | Teal `#94e2d5`. The worker raises a paper, or a paper sits in the out-tray. It stays until the pane is seen. A bell rings ("finished", 5 s) unless the desk is already in view. The first `idle` of a new agent is never `done`. |
| `unknown`, agent pane | Grey, semi-transparent worker | Overlay0 `#6c7086`. This covers the startup grace window and an agent that herdr cannot yet classify. |
| Plain shell pane (not in `agents[]`) | Empty desk with a grey monitor | `agent_status` is `unknown`. There is no avatar. |
| Global focus (`focused_*_id`) | Spotlight on `focused_pane_id`, camera home on `focused_workspace_id` | Shows where the human looks in herdr. |
| Per-tab focused pane | Small marker on one desk in each pod | Each pod has exactly 1 marker. |
| `seen` | The paper or the out-tray item goes away | The server `seen` flag changes on a tab switch or a focus in herdr, for all desks in that tab. The office can also keep its own acknowledged map for each viewer (section 6). |
| Roll-up | Door light, pod lamp and lobby board | Rank: blocked > done > working > idle > unknown. |
| Notifications | Desk phone for "needs attention", bell for "finished" | The office derives them from status transitions. Mute the bell when the desk is in view. Do not mute the phone, because herdr does not mute `Request` for the active tab. |
| Agents panel | Lobby status board | Sort by rank, then by the newest `state_change_seq`. Show counts at the top in the order blocked, done, working, idle. |
| `agent_session` | Briefcase icon | The conversation can resume after a server restart. |
| `screen_detection_skipped` | Headset badge | A full-lifecycle hook reports the state. |

## 6. Bridge architecture

```text
herdr server (unix socket)
   |  L  events.subscribe, lifecycle types (open all the time)
   |  Q  session.snapshot (a new connection for each request)
   |  S  events.subscribe, pane.agent_status_changed for each agent pane (step 2 only)
   v
bridge.mjs   node:net + node:http, listens on 127.0.0.1 only
   |  GET  /events  Server-Sent Events: the full snapshot JSON on each change
   |  POST /action  execFile("herdr", [...]) after a token check
   v
browser      three.js scene, diff by ID, acknowledged map for each viewer
```

### Step 1: the smallest bridge

This design copies collie: events only make the poll run sooner, and the snapshot is the state model.

1. Find the socket path with the order from section 3.
2. Open connection L with the lifecycle line from section 3. Leave out `pane.updated` unless the office shows titles, because it fires about every 175 ms.
3. On `subscription_started`, read `session.snapshot` on a new connection. Store it as the model. The snapshot has the server roll-ups, focus, layouts and `agent_status`.
4. On each lifecycle event, schedule one snapshot. Use a debounce of about 100 ms. This is a design value, so adjust it.
5. Also read a snapshot every 500 ms (a design value). Status changes and `seen` changes emit no lifecycle event, so this poll catches them.
6. Send the snapshot to all SSE clients when its JSON string differs from the last one. SSE needs only `node:http`, so the bridge has no dependencies.
7. When L closes, mark the office as offline, wait, and start again from step 2.

Step 1 does not use per-pane status subscriptions. Its latency is the poll interval. It works with the 0.8.2 replay behavior and with the 0.9.0 live-only behavior. It also works when `events_lost` occurs or does not exist.

### Step 2: lower latency (add it only when 500 ms is too slow)

- Open connection S with one `pane.agent_status_changed` entry for each pane in `snapshot.agents`. Do not use a filter.
- When an event arrives, compare `agent_status` with the cache, patch the record, and schedule a snapshot to get the roll-ups.
- After each snapshot, compare the set of agent pane IDs with the set that S watches. If the set changed, close S and open a new S. This also stops the cost of entries for closed panes.
- On `pane_not_found` (a race with a pane close), read a snapshot and open S again.

### Browser

- Keep scene objects keyed by ID (`workspace_id`, `tab_id`, `pane_id`, `terminal_id`). Compare each new snapshot with the previous one. This gives create, remove, move and status-change animations.
- Derive the "needs attention" and "finished" effects from status transitions, because the API has no notification events.
- Keep an acknowledged map for each viewer, like the TUI client. Acknowledge a desk when it is in the camera view and the browser tab has focus. Record a completion when the browser sees `working` or `blocked` change to `idle` or `done`:

```js
const officeDone = (a) =>
  (a.agent_status === 'done' || sawCompletion.get(a.pane_id) === a.state_change_seq) &&
  ack.get(a.pane_id) !== a.state_change_seq;
```

This rule never clears the server `done`. It hides `done` only for that viewer. `state_change_seq` identifies the completion, because a change of `seen` does not change the sequence number.

### User actions

Let the bridge run the `herdr` CLI with `execFile` and an array of arguments, not a shell. The CLI already has the readiness wait and the prompt phases, and the array prevents shell injection.

These actions are safe to offer first:

- All the reads above: the snapshot, the subscriptions and `herdr agent list`.
- Focus a desk with `herdr agent focus <target>`. Agent targets are a pane ID or a name. The socket also has `pane.focus`, but its params are not in the dossier. Focus sends no input to an agent, but it has two side effects. It switches the herdr TUI to that pane. It also marks the whole tab as seen, so the `done` state of the other desks in that tab goes away too.

These actions need care:

- `herdr agent read`: the screen text can contain secrets. Show it only to the local user, and do not log or cache it.
- `herdr agent prompt <target> <text> --wait`: show both phases. On `agent_prompt_stalled` or `timeout`, show "check before you resend", and do not retry automatically. Herdr refuses a blocked agent with `agent_blocked`.
- Answer a blocked question: show the `agent read` output first. Then send one `herdr agent send-keys` for each explicit click. Never send keys automatically. This is the only way to answer, because `agent prompt` refuses blocked agents.
- `herdr agent start`: check the name pattern in the UI first. The command types into a shell.
- `worktree create`, `agent rename`, `notification show` and agent release are writes. Ask for explicit consent.
- The bridge gives control of every terminal. Listen only on 127.0.0.1, as herdr-web-ui does. Require a random token for each run on `POST /action`, and send no CORS headers.

## 7. Prior art

herdr clients (all 2D):

- [herdview](https://github.com/Orchard-Robotics/herdview): a Go web mirror. It polls `herdr agent list`, `workspace list` and `pane read`, and it puts blocked agents at the top ("N need you"). It starts a detached server from an `[[events]]` hook on `pane.focused`. MIT license.
- [collie](https://github.com/AltanS/collie): a PWA. The bridge reads one snapshot per tick, and the event stream only makes the poll run sooner.
- [herdr-web-ui](https://github.com/devswha/herdr-web-ui): needs herdr 0.9.0 or later. It uses React and xterm.js, sends push alerts, and listens on 127.0.0.1.
- [herdr-remote](https://github.com/dcolinmorgan/herdr-remote): needs herdr 0.7 or later. It polls the CLI and shows agent state in a MacBook notch panel.
- [agent-telegram-notify](https://raw.githubusercontent.com/ogulcancelik/herdr-plugin-examples/main/agent-telegram-notify/herdr-plugin.toml): an example plugin, not an official one. It hooks `pane.agent_status_changed` (min_herdr_version 0.7.0) and sends a message on `done` and `blocked`.
- [topic:herdr-plugin](https://github.com/topics/herdr-plugin) lists more clients that were not read: [herdr-mirror](https://github.com/nikok6/herdr-mirror), [herdr-mobile-relay](https://github.com/0cv/herdr-mobile-relay), [herdr-radar](https://github.com/hhdebb/herdr-radar), [herdr-board](https://github.com/nelsonPires5/herdr-board), [herdr-sidebar](https://github.com/alexarthurs/herdr-sidebar) and [Heeler](https://github.com/ZingerLittleBee/Heeler).

Office visualizers for coding agents. None of them reads herdr.

- [Pixel Agents](https://github.com/pablodelucca/pixel-agents): React and Canvas 2D. There is one character for each Claude terminal. A character types when it edits and reads when it searches. A speech bubble shows a wait or a permission request, and a chime plays at turn end. MIT license.
- [Claude Office](https://github.com/paulrobello/claude-office): FastAPI, WebSocket, Next.js and PixiJS. It has a boss with employee subagents. The Command Center puts "Needs-you" and "Working" at desks, "Done" in a couch lounge, and "Ended" at an exit elevator. It uses A* pathfinding to free seats. The printer animates only when the work produces a report or a document.
- [pixelagents](https://github.com/YehudaLevi/pixelagents): one desk for each session. "Sleeping" shows after 5 minutes without events, and "Done" shows confetti. Hooks write a JSONL file, a server streams it over SSE, and a canvas draws it. MIT license.
- [Star Office UI](https://github.com/ringhyacinth/star-office-ui): idle maps to a sofa, work maps to a desk and errors map to a "bug corner". The art has a non-commercial license.
- [The Delegation](https://github.com/arturitu/the-delegation): Three.js WebGPU/TSL, with NavMesh pathfinding and points of interest that only one character can occupy at a time. Real Gemini LLM calls (bring your own key) drive a simulated agency. The code is MIT, and the 3D assets are CC BY-NC 4.0.
- [ai-office](https://github.com/Gaurav2693/ai-office): React 19 and a Three.js isometric voxel office. It has 9 scripted agents that walk at random, with no backend and no API calls. MIT license.

## 8. Open questions

1. The probe received per-pane status events as `pane.agent_status_changed`. The schema EventKind also has `pane_agent_status_changed`. Should the bridge match both names? Also, do the lifecycle kinds that the probe did not see (`pane_closed`, `pane_moved` and the others) arrive in snake_case?
2. Does the per-pane subscription emit an event when `done` changes to `idle` after a tab switch in herdr? The source says that the `pane.get` poll catches it. Nobody tested this live.
3. On 0.8.2, does a new lifecycle subscription replay retained events, and how many? The probes saw `workspace_created`, `tab_created` and `pane_created` within 1 s, while the pane count stayed at 48.
4. What does 0.8.2 do with a slow subscriber? The binary has no `events_lost` string.
5. What does `session.snapshot` cost the server when the bridge reads it every 500 ms? Compare this with one `pane.get` every 100 to 175 ms for each status entry. Measure both before you choose step 2.
6. Which `seen` should the office use: the server flag, the acknowledged map for each viewer, or both (as in section 6)? A browser view never marks a pane as seen in herdr. Only a focus action or a tab switch does that.
7. Is the layout offset (x=36, y=1) always the sidebar width plus the tab-bar row? Does it change when clients of different sizes attach?
8. Does `pane move` keep the pane ID or give a new one? The terminal ID stays the same, but the dossier does not say what happens to the pane ID.
9. Which version should the office target, 0.8.2 or 0.9.x? 0.9.x adds `completion_seq`, machines, `events_lost`, badges for each client and `resume_argv`.
10. Master's `--machine` does not forward `events.subscribe`. Must the office poll remote machines?
11. The raw clients were not tested on the Windows named-pipe transport.
12. Privacy: may the office show titles, `agent read` output or `terminal session observe` frames on monitors? All of them can contain secrets.
13. Which write actions may the office run, and what consent step does each one need?
14. The live Claude agents have no `agent_session`. Is the Claude integration missing or out of date? Installing it is a write and is the user's decision.
15. Do the user's Codex panes run with `--no-daemon`? Codex hook state is reliable only in that mode.
16. Is "blocked" without a reason acceptable? Only `state_labels` from an integration can give a reason.
17. When the office shows which agent caused a room status, the choice among panes of equal rank depends on HashMap order. Does the office need a stable rule for ties?