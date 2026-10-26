# IDR 0001: the chat of a codex desk comes from the rollout files

Date: 2026-10-20

Status: accepted

## Context

The user chose to show the last reply and the chat window for Codex agents (`INTENT.md` decision 30). herdr already gives a codex desk its status. Only the transcript reader was missing. Codex keeps each session in a rollout file in `$CODEX_HOME/sessions`. The research is `docs/agent-independence.md`.

## Decision

- The bridge reads the rollout files. It does not use the Codex app-server daemon. The daemon API is experimental, it needs a WebSocket client over a Unix socket, and it does not see a `--no-daemon` session (`docs/agent-independence.md` section 3.3).
- Only `response_item` entries of the type `message` count. The `event_msg` entries `user_message`, `agent_message`, and `item_completed` repeat them.
- A `developer` text never shows. The injected user texts of `CODEX_WRAPPER` never show.
- The lookup uses the thread id from `agent_session`. Without it, the lookup takes the newest top-level rollout of the cwd. A subagent thread never takes the chat of a pane.
- The page shows the chat for each agent kind in `CHAT` in `public/office.js`: `claude` and `codex`.

## Consequences

- `rollouts()` makes a `stat` call for every rollout file on each call. A large `sessions` folder makes each call slower.
- The rollout format is internal to Codex. A Codex update can break the chat of a codex desk.
- Two codex panes in the same cwd, without an `agent_session`, show the same chat.
- A new agent kind with a reader needs one new entry in `CHAT`.
