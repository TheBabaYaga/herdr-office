# herdr office: intent

This file records what the user wants from the herdr office, and why. The code does not record it. Read this file before you change the office. Do not ask again about a settled decision. Do not add a cut feature again. If this file and the code disagree, ask the user.

## Purpose

The user runs coding agents in herdr, a terminal multiplexer. The user wants to see those agents work in a real office, in 3D, in the browser. The office uses the herdr concepts: a workspace is a room, a pane is a desk, and an agent is a worker at that desk. One look tells the user which agent works, which agent waits for the user, and which agent finished.

The office watches. It never prompts an agent, and it never answers a blocked question. Its only write to herdr is a focus. A click on "Focus in herdr" moves the herdr focus to that pane.

`docs/herdr-agent-model.md` has the analysis of herdr. Its section 5 is the first design of the mapping. The table below shows the mapping in the code. Where the two differ, this file wins.

## What the office shows

| herdr | Office | 3D look |
|---|---|---|
| Session (one socket) | The building | When the herdr socket or the bridge is not reachable, the scene turns dark and grey, and the HUD shows "offline". |
| Workspace | A walled room on a corridor | Rooms follow the workspace `number`. The door light shows the workspace roll-up. The door sign shows the workspace label. |
| Tab | A desk pod in the room | Pods follow the tab-bar order. The pod lamp shows the tab roll-up. |
| Pane | A desk with a monitor | The pane rect in the tab layout sets the desk position. A shell pane (no agent) is an empty desk with a dark screen. |
| Agent | A worker in the desk chair | The shirt color shows the agent kind: claude orange, codex white, gemini blue, opencode purple. Other kinds get a color from the kind name. |
| `working` | The worker types | Strong yellow `#ffd43b`. The screen glows and shows text that types and scrolls. |
| `blocked` | The worker raises a hand | Red `#f38ba8`. A red beacon pulses over the head. |
| `done` | The worker raises a paper | Teal `#94e2d5`. |
| `idle` | The worker reclines | Green `#a6e3a1`. |
| `unknown` | The worker is semi-transparent | Grey `#6c7086`. |
| Focus (`focused_pane_id`) | A blue spotlight on the desk | The first view frames the room of the focused workspace. |
| Roll-up | Door light, pod lamp, HUD | Rank: blocked > done > working > idle > unknown. |
| Claude Code subagents | A meeting room | See "Meetings". |

- Skin, hair, trousers and accessories vary, but one worker always looks the same. The shirt keeps the agent kind.
- Each agent desk has a keyboard. The worker badge shows the agent name (or else the display name, or else the kind) and the pane ID, for example `claude · w1:p1`.
- Only 3D objects use the strong yellow. The HUD, the badges and the door signs keep the herdr theme yellow.
- The HUD is the box at the top left. It counts each status and lists the agents by rank, then by the newest state change.
- The building also has a kitchen, a lobby with the reception and the entrance, plants, and desk clutter.
- A drag moves the view. The mouse wheel zooms to the mouse pointer. Labels declutter: a label that covers a more important one hides.
- A click on a desk, a worker, or a HUD row opens the side panel. The panel shows kind, name, status, room, tab, cwd, title, and pane.
- `?demo` shows a simulated session with four workspaces ("api", "web", "docs", "infra") and one meeting. The focus button is off in the demo.

### Meetings

- Each Claude Code session that runs subagents gets a meeting room. The room label names the workflows, or says "subagents".
- The orchestrator is the claude desk in herdr with the same cwd as the session. It sits at the head of the table with a laptop. Its own desk shows an empty chair.
- Subagents sit at the table with laptops. The shirt color shows the model: opus red, sonnet teal, haiku pink, grey for an unknown model. A subagent always shows as working.
- A subagent keeps its seat. When it ends, its chair stays empty, and nobody moves.
- The panel of a subagent has "Focus orchestrator", which focuses the pane of the orchestrator.
- With no meetings, one empty meeting room stays in the building.
- The bridge reads only metadata from `~/.claude/projects`. The browser never gets transcript text. `CLAUDE.md` lists the files that the bridge reads.

## Decisions

The user made these decisions between 2026-10-03 and 2026-10-05.

1. The goal, in the user's words: "Analyze how herdr works with the agents ... build a 3D office (can be in threejs) that uses the same concepts where I can see my agents working in a real office." The analysis is in `docs/herdr-agent-model.md`.
2. Watch, plus a click to focus. A desk click opens a panel, and "Focus in herdr" sends `pane.focus`. The office never prompts agents and never answers blocked questions.
3. Every pane gets a desk. A shell pane is an empty desk.
4. An isometric voxel or pixel style.
5. A `?demo` switch with simulated agents.
6. The user turned on "ponytail ultra" (YAGNI at the extreme). The cuts are in "Cut on purpose".
7. The user said: "You orchestrate subagents to build this. You do not build anything yourself, you just orchestrate." The main Claude session in this repo plans, briefs, and verifies. Subagents and workflows write the code. The user often names the model for an agent (sonnet or opus).
8. One building: "Currently the offices are separated ... make it 1 big office with different rooms."
9. A real office. The user's reason: "I don't like this, can you give it a more real office feeling? Now it's just an open space with some borders and every space also has a door." The user chose a corridor with walled rooms, like The Sims:
   - Full-height walls. The walls on the camera side stay low.
   - A real door in the corridor wall of each room, and windows in the outer walls.
   - All four detail groups: a kitchen or coffee corner, a meeting room and a lobby with reception, plants and desk clutter, windows and warm light.
10. A stronger yellow in 3D. The user's reason: the working yellow on the 3D monitors was too pale.
11. Labels declutter by priority. The user's reason: the door signs overlapped at full zoom-out.
12. The zoom goes to the mouse pointer.
13. A working screen glows and shows text that types and scrolls.
14. Each agent has a keyboard on its desk.
15. Workers vary in look (skin, hair, trousers, accessories). The shirt color still shows the agent kind.
16. Meetings: "Agents that are working together in a workflow should be together in a meeting room." The user chose Claude Code subagents and workflows, not herdr agents that share one repo.
17. A SketchyBar item for herdr, with colors that the user chose. See "Related".

## Cut on purpose

The user cut these with "ponytail ultra" (decision 6). Do not add them again without the user's approval.

- Walk animations. A worker does not walk to a desk, leave, or move.
- Toasts and sound. The office has no desk phone and no bell.
- Zoom dimming. A zoomed herdr tab does not dim the other desks.
- The herdr event subscription. The bridge polls `session.snapshot` every 500 ms instead. A status change can take up to 500 ms to show.
- npm dependencies. three.js comes from a CDN importmap. The bridge uses only Node built-ins.
- Spec and plan documents.

The user did not choose meetings for herdr agents that share one repo (decision 16).

The user wants the decor. Do not cut it as YAGNI. The walls, doors, windows, kitchen, lobby, plants, desk clutter, and warm light are the user's choice (decision 9).

## Related

The SketchyBar item lives outside this repo, in `~/dotfiles/sketchybar/.config/sketchybar`. The script is `plugins/herdr.sh`, and `sketchybarrc` adds the item.

- The bar shows an icon and the count of working herdr agents.
- A click opens a popup with one row per agent, blocked first.
- A row click runs `herdr agent focus` for that pane and brings WezTerm to the front.
- The user chose bright, high-contrast colors: blocked red, done ("ready") green, working orange, idle blue, unknown grey.
- The popup has a solid black background. The office does not use these colors.

## Open items and known limits

- Nobody tested "Focus in herdr" or the SketchyBar row click against the live herdr. The tests use fake sockets and stubs.
- The HUD box can cover labels in the top-left corner.
- A Claude session maps to a herdr pane by cwd. The bridge takes one session per cwd: the newest transcript. A second session in the same cwd gets no meeting room.
- If two claude panes share that cwd, the office takes the working one as the orchestrator.
- The bridge does not find a worktree folder whose transcript starts in another cwd.
- In the demo, a subagent badge on the south side can cover the laptop logo of the head seat.
- The badge-overlap check after the last revert of the orchestrator badge did not run.
- Section 5 of `docs/herdr-agent-model.md` lists ideas that nobody built and that the user did not decide on. Examples: worktree annex rooms, a focus marker in each pod, a per-viewer acknowledged map, the briefcase and headset badges. Ask the user before you build one.
