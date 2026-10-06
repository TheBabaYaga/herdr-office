# herdhouse: intent

This file records what the user wants from herdhouse, and why. The code does not record it. Read this file before you change the office. Do not ask again about a settled decision. Do not add a cut feature again. If this file and the code disagree, ask the user.

## Purpose

The user runs coding agents in herdr, a terminal multiplexer. The user wants to see those agents work in a real office, in 3D, in the browser. The office uses the herdr concepts: a workspace is a room, a pane is a desk, and an agent is a worker at that desk. One look tells the user which agent works, which agent waits for the user, and which agent finished.

The office watches. It has two writes to herdr: a focus and a message. A click on "Focus in herdr" moves the herdr focus to that pane and brings WezTerm to the front. The message field in the panel sends a line of text to the agent (decision 21). herdr refuses a message to a blocked agent, so the office never answers a blocked question.

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
| `blocked` | The worker raises a hand | Red `#fa5252`. A red beacon pulses over the head. |
| `done` | The worker raises a paper | Teal `#94e2d5`. |
| `idle` | The worker reclines and browses. Now and then it walks to the kitchen or dances in the party room. | Green `#a6e3a1`. The screen shows a fake web page or a video on a green background. See decision 19. |
| `unknown` | The worker is semi-transparent | Grey `#6c7086`. |
| Focus (`focused_pane_id`) | A blue spotlight on the desk | The first view frames the room of the focused workspace. |
| Roll-up | Door light, pod lamp, HUD | Rank: blocked > done > working > idle > unknown. |
| Claude Code subagents | A meeting room | See "Meetings". |

- Skin, hair, trousers and accessories vary, but one worker always looks the same. The shirt keeps the agent kind.
- Each agent desk has a keyboard and a mouse. The worker badge shows the agent name (or else the display name, or else the kind) and the pane ID, for example `claude · w1:p1`.
- Only 3D objects use the strong yellow. The HUD, the badges and the door signs keep the herdr theme yellow.
- The HUD is the box at the top left. It counts each status and lists the agents by rank, then by the newest state change.
- The building also has a kitchen, a lobby with the reception and the entrance, plants, and desk clutter. A row with enough spare width also gets a party room (decision 24).
- A drag moves the view. The mouse wheel zooms to the mouse pointer. Labels declutter: a label that covers a more important one hides.
- A click on a desk, a worker, or a HUD row opens the side panel. The panel shows kind, name, status, room, tab, cwd, title, and pane. A click on a worker on a trip also zooms in and follows that worker (decision 23).
- The panel of an agent desk has a message field. Enter or "Send" sends the text to that agent. A subagent and a shell desk have no message field.
- The panel of a claude desk shows the last reply of the agent. "Show all" opens a chat window in the middle of the screen with the conversation history and a field to answer. Esc or the x closes the window (decision 22).
- `?demo` shows a simulated session with four workspaces ("api", "web", "docs", "infra") and one meeting. The focus button and the message field are off in the demo.

### Meetings

- Each Claude Code session that runs subagents gets a meeting room. The room label names the workflows, or says "subagents".
- The orchestrator is the claude desk in herdr with the same cwd as the session. It sits at the head of the table with a laptop. Its own desk shows an empty chair.
- Subagents sit at the table with laptops. The shirt color shows the model: opus red, sonnet teal, haiku pink, grey for an unknown model. A subagent always shows as working.
- A subagent keeps its seat. When it ends, its chair stays empty, and nobody moves.
- The panel of a subagent has "Focus orchestrator", which focuses the pane of the orchestrator.
- With no meetings, one empty meeting room stays in the building.
- For meetings, the bridge reads only metadata from `~/.claude/projects`. The browser gets transcript text only through the chat of a claude desk (decision 22). `CLAUDE.md` lists the files that the bridge reads.

## Decisions

The user made these decisions between 2026-10-03 and 2026-10-06.

1. The goal, in the user's words: "Analyze how herdr works with the agents ... build a 3D office (can be in threejs) that uses the same concepts where I can see my agents working in a real office." The analysis is in `docs/herdr-agent-model.md`.
2. Watch, plus a click to focus. A desk click opens a panel, and "Focus in herdr" sends `pane.focus`. The office never prompts agents and never answers blocked questions. Decision 21 changed the first part: the office now sends messages. It still never answers a blocked question.
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
18. A focus click also brings WezTerm to the front, in the user's words: "When clicking the focus in herdr button I want you to open up wezterm (which is probably open) so I can see the pane". The bridge runs `open -a WezTerm`, the same as the SketchyBar row click.
19. Idle breaks, in the user's words: "Create it so that idle agents are either running around a bit to the kitchen like in a real office are they act like they're browsing the internet or so the have a bit more entertainment." This approves walks for idle workers only. An idle worker alternates two activities:
    - It browses at the desk. The monitor shows a fake web page or a video, and the worker keeps one hand on the mouse.
    - It walks to a free spot at the kitchen counter, stands there with a mug, and walks back. The first trip starts 5 to 30 s after the idle state starts. A stay lasts 6 to 15 s. Between two trips the worker browses for 20 to 60 s.
    - If the status leaves `idle` during a trip, the worker runs back at once and sits down.
    - A worker with another status, an orchestrator that sits in a meeting, and a subagent never take a break.
20. Doors that open and close, in the user's words: "In the office, make it so that doors are closed and that they are opened and closes whenever an agent walks through it". Every door is closed. A worker on a kitchen trip opens two doors: the door of its own room and the kitchen door.
    - A door opens when the walker comes within 3 of the door center, and closes when the walker is farther away. It takes 0.25 s, so it is open before a runner gets to the leaf.
    - A walker that passes another door in a corridor does not open it.
    - At the counter the kitchen door closes. It opens again when the worker walks back.
    - The doors of the meeting room and the lobby stay closed, because nobody walks there.
21. A message field in the panel, in the user's words: "When I click on an agent I want to be able to send a message via a text field. I know it's against our intent, it's just as a test". The user tested it on a branch, saw it work, and merged it into `main`.
    - Only the panel of an agent desk has the field. A subagent and a shell desk have none.
    - The bridge sends the text with `agent.prompt`. herdr types the text and presses Enter.
    - herdr refuses a message to a blocked agent with `agent_blocked`, and the panel shows the error. So the office still never answers a blocked question.
    - A message does not bring WezTerm to the front.
22. The last reply and a chat window, in the user's words: "Can we display the last message of an agent when I focus on him? When the message is too big we should be able to click a button or so to view the entire message." The button opens "a new window in the middle of the screen where we can see the message and message history where we can scroll and also be able to answer directly. Pressing esc or the x should close that window again."
    - The user chose the Claude Code transcripts as the source, not the herdr screen read. So the chat works for claude agents only. The history holds the user prompts and the agent replies, without thinking, tool calls, or tool results.
    - This changes a safety rule: transcript text now goes to the browser. It goes only through `GET /messages`, on request and behind the token, never through the `/events` stream.
    - The bridge finds the transcript from the session id that herdr reports for the pane (`agent_session`). A pane without one gets the newest transcript of its cwd.
    - "When I focus on him" became a click on the desk: the panel opens and shows the last reply. The "Show all" button always shows, because the window also holds the history.
    - Messages from other agents (teammates, subagent reports, other Claude sessions) show as "subagent · <name>" with their own color, in the user's words: "Can we properly format these and make it clear those are subagents? cause it seems to be a teammate". The chat shows only the text of each message. A bare idle notice without text does not show.
23. A click on a worker on a trip opens its panel and follows it, in the user's words: "I want to be able to also focus on an agent that's running around, now it only works when you click the desk" and "can you also make it so that the camera zooms in a bit and starts following the agent".
    - Only a click on a worker on a trip starts the follow. A click on a desk, a seat, or a HUD row does not.
    - The camera zooms to 1.5 times the zoom, at most the max zoom. The camera stays on the worker after it sits down.
    - A pointerdown on the canvas (a drag or a click on the floor), a click on any desk or HUD row, and the x or Esc of the panel end the follow. A click on another walker follows that walker.
    - A pointerdown or a mouse wheel on the canvas ends the zoom glide, so the glide never fights the user's zoom.
    - The follow ends when the agent exits.
24. A party room, in the user's words: "Maybe as a fun factor, if there is enough room we could create a party room with disco lights where idle agent are dancing and partying". The request came from "The big offices feel kind of empty". For the speakers: "make the speakers like a breathing effect so it seems they're playing music".
    - The party room fills the spare width of the row with the most spare width, if that width is 7 or more. The other rooms in that row keep their normal width. Without such a row, the office has no party room.
    - The party room is the last room of its row. In the row of the lobby, it comes just before the lobby.
    - An idle worker picks the kitchen or the party room at random for each trip. If the pick has no free spot, the worker goes to the other room. If both rooms are full, it keeps browsing.
    - A dance lasts as long as a kitchen stay (6 to 15 s, decision 19). If the status changes, the dancer runs back to the desk.
    - A walker opens the door of its own room and the door of its target room, and no other door. This changes decision 20 for the kitchen door: a party walker does not open it.
    - The dance floor tiles, the disco ball, the light beams, and the speakers move only while at least one worker dances. The speakers pulse on a beat. The speaker boxes also pulse a little (3%), because in a party room with a north door the speaker fronts face away from the camera.
    - The disco colors are magenta, violet, and white only, so no light reads as a status. The room has no three.js light source, because such a light shines through walls.
    - A dancer keeps its arms below the shoulders, because a raised hand means `blocked` and a raised paper means `done`. A dancer gets no mug.
    - The user chose to wait with more decor for big rooms (a grid of props, wall props, and rugs on the walk lanes). The user looks at the big rooms again after the party room.

## Cut on purpose

The user cut these with "ponytail ultra" (decision 6). Do not add them again without the user's approval.

- Walk animations, except the idle breaks (decision 19). A worker does not walk to a new desk and does not walk to the meeting room. Nobody else walks. An orchestrator moves to the meeting room without a walk: its worker sits at the head of the meeting table.
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

- No test covers the party lights, the speakers, or the dance, because Node cannot load three.js. A browser check in the demo and in the live office covered them.
- The rooms in the party row do not get wider, so they do not get the extra props of a wide room. In the demo, "docs" is 7.8 wide, not 19.5.
- A big room can still have empty floor under short pods next to a tall pod. The pods of one row share the depth of the tallest pod, and the walk lanes take that floor. The decor for this waits (decision 24).
- Nobody tested "Focus in herdr" (with the WezTerm raise) or the SketchyBar row click against the live herdr. The tests use fake sockets and stubs.
- The tests cover only the bridge side of a message. One browser check against a fake herdr socket covered the page side.
- The message field holds one line. "ok" in the panel means that herdr typed the text. It does not prove that the agent started a turn.
- The chat window shows only the history in the last 512 KB of the transcript. Older messages do not show.
- A claude pane without a herdr `agent_session` gets the newest transcript of its cwd. If two claude panes share that cwd, both can show the same chat.
- The chat refreshes every 2 s while the panel is open. Replies show as plain text. Markdown does not render.
- The tests cover the bridge side of the chat. A browser check with a fake herdr socket and a fake projects tree covered the page side.
- The HUD box can cover labels in the top-left corner.
- A Claude session maps to a herdr pane by cwd. The bridge takes one session per cwd: the newest transcript. A second session in the same cwd gets no meeting room.
- If two claude panes share that cwd, the office takes the working one as the orchestrator.
- The bridge does not find a worktree folder whose transcript starts in another cwd.
- In the demo, a subagent badge on the south side can cover the laptop logo of the head seat.
- The badge-overlap check after the last revert of the orchestrator badge did not run.
- A change of the route inputs ends every idle trip. The workers sit at their desks again. The route inputs are the size, the position, and the door of a workspace room, the kitchen, or the party room, the pods of these rooms, the cross corridor, and the position, room, and pod of a desk. A meeting start or end ends no trip while the floor plan stays the same. A meeting room that gets wider (9 or more subagents in the demo plan) and a second meeting at the same time move the rooms, so they end every trip. A desk that gets `away` loses its trip, because its worker moves to the meeting room. A desk that loses its agent also loses its trip, because no worker is left.
- The first wait counts from the time the page first sees the idle state. A page reload starts it again.
- Two workers can overlap in a corridor.
- A worker stands up inside its chair and slides 0.65 to the side through the chair edge. This takes about 0.4 s at the start and at the end of a trip. The chair does not move.
- Near a door the arms of a walker hang still, and the mug hand stays low.
- A desk can stand within 3 of its own door. The door then opens when the worker stands up, and closes after the worker sits down. In the test floor plans, 36 of 302 seats are that close.
- In a room with two pod rows (wider than 30 units), the route of a worker can cross the lower pod row. Nothing tests that case.
- The walk and run speeds (1.6 and 4 units a second) and the break times come from the first run in the demo. The user did not tune them. A kitchen trip in the demo takes about 100 s. The first party trip of `w2:p2` takes about 33 s.
- Section 5 of `docs/herdr-agent-model.md` lists ideas that nobody built and that the user did not decide on. Examples: worktree annex rooms, a focus marker in each pod, a per-viewer acknowledged map, the briefcase and headset badges. Ask the user before you build one.
