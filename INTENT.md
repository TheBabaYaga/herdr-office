# herdr-office: intent

This file records what the user wants from herdr-office, and why. The code does not record it. Read this file before you change the office. Do not ask again about a settled decision. Do not add a cut feature again. If this file and the code disagree, ask the user.

## Purpose

The user runs coding agents in herdr, a terminal multiplexer. The user wants to see those agents work in a real office, in 3D, in the browser. The office uses the herdr concepts: a workspace is a room, a pane is a desk, and an agent is a worker at that desk. One look tells the user which agent works, which agent waits for the user, and which agent finished.

The office watches. It has two writes to herdr: a focus and a message. A click on "Focus in herdr" moves the herdr focus to that pane and brings the terminal app to the front (decision 29). The message field in the panel sends a line of text to the agent (decision 21). herdr refuses a message to a blocked agent, so the office never answers a blocked question.

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
| `idle` | The worker reclines and browses. Now and then it walks to the kitchen for a coffee or a lunch, dances in the party room, or plays chess or ping-pong. | Green `#a6e3a1`. The screen shows a fake web page or a video on a green background. See decision 19. |
| `unknown` | The worker is semi-transparent | Grey `#6c7086`. |
| Focus (`focused_pane_id`) | A blue spotlight on the desk | The first view frames the room of the focused workspace. |
| Roll-up | Door light, pod lamp, HUD | Rank: blocked > done > working > idle > unknown. |
| Claude Code subagents | A meeting room | See "Meetings". |

- Skin, hair, trousers and accessories vary, but one worker always looks the same. The shirt keeps the agent kind.
- Each agent desk has a keyboard and a mouse. The worker badge shows the agent name (or else the display name, or else the kind) and the pane ID, for example `claude · w1:p1`.
- Only 3D objects use the strong yellow. The HUD, the badges and the door signs keep the herdr theme yellow.
- The HUD is the box at the top left. It counts each status and lists the agents by rank, then by the newest state change.
- The building also has a kitchen, a lobby with the reception and the entrance, plants, and desk clutter. A row with enough spare width also gets a party room (decision 24). A big room gets more props from a pool for its kind (decision 25). Each other row with 4 or more spare width gets a garden terrace at its east end, and its rooms keep their own width (decision 26).
- A drag moves the view. The mouse wheel zooms to the mouse pointer. Labels declutter: a label that covers a more important one hides.
- A click on a desk, a worker, or a HUD row opens the side panel. The panel shows kind, name, status, room, tab, cwd, title, and pane. A click on a worker on a trip also zooms in and follows that worker (decision 23).
- The panel of an agent desk has a message field. Enter or "Send" sends the text to that agent. A subagent and a shell desk have no message field.
- The panel of a claude or codex desk shows the last reply of the agent. "Show all" opens a chat window in the middle of the screen with the conversation history and a field to answer. Esc or the x closes the window (decision 22).
- `?demo` shows a simulated session with four workspaces ("api", "web", "docs", "infra") and one meeting. The focus button and the message field are off in the demo.

### Meetings

- Each Claude Code session that runs subagents gets a meeting room. The room label names the workflows, or says "subagents".
- The orchestrator is the claude desk in herdr with the same cwd as the session. It sits at the head of the table with a laptop. Its own desk shows an empty chair.
- Subagents sit at the table with laptops. The shirt color shows the model: opus red, sonnet teal, haiku pink, grey for an unknown model. A subagent always shows as working.
- A subagent keeps its seat. When it ends, its chair stays empty, and nobody moves.
- The panel of a subagent has "Focus orchestrator", which focuses the pane of the orchestrator.
- With no meetings, one empty meeting room stays in the building.
- For meetings, the bridge reads only metadata from `~/.claude/projects`. The browser gets transcript text only through the chat of a claude or codex desk (decision 22). `CLAUDE.md` lists the files that the bridge reads.

## Decisions

The user made these decisions between 2026-10-03 and 2026-10-20.

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
18. A focus click also brings WezTerm to the front, in the user's words: "When clicking the focus in herdr button I want you to open up wezterm (which is probably open) so I can see the pane". The bridge first ran `open -a WezTerm`, the same as the SketchyBar row click. Decision 29 replaced the fixed app.
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
    - A message does not bring the terminal to the front.
22. The last reply and a chat window, in the user's words: "Can we display the last message of an agent when I focus on him? When the message is too big we should be able to click a button or so to view the entire message." The button opens "a new window in the middle of the screen where we can see the message and message history where we can scroll and also be able to answer directly. Pressing esc or the x should close that window again."
    - The user chose the Claude Code transcripts as the source, not the herdr screen read. So the chat works for claude agents only. Decision 30 adds codex agents. The history holds the user prompts and the agent replies, without thinking, tool calls, or tool results.
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
    - An idle worker picks the kitchen or the party room at random for each trip. If the pick has no free spot, the worker goes to the other room. If both rooms are full, it keeps browsing. Decision 27 adds a lunch as a third pick.
    - A dance lasts as long as a kitchen stay (6 to 15 s, decision 19). If the status changes, the dancer runs back to the desk.
    - A walker opens the door of its own room and the door of its target room, and no other door. This changes decision 20 for the kitchen door: a party walker does not open it.
    - The dance floor tiles, the disco ball, the light beams, and the speakers move only while at least one worker dances. The speakers pulse on a beat. The speaker boxes also pulse a little (3%), because in a party room with a north door the speaker fronts face away from the camera.
    - The disco colors are magenta, violet, and white only, so no light reads as a status. The room has no three.js light source, because such a light shines through walls.
    - A dancer keeps its arms below the shoulders, because a raised hand means `blocked` and a raised paper means `done`. A dancer gets no mug.
    - The user chose to wait with more decor for big rooms (a grid of props, wall props, and rugs on the walk lanes). Decision 25 added the props and the wall props. The user then rejected flat runners on the walk lanes (decision 25).
25. More decor in big rooms, in the user's words: "The bigger rooms feel empty due to empty space, fill them up with decor but don't make it feel repetetive". This is the decor that decision 24 kept for later.
    - A fill pass (`furnish()` in `decor.js`) runs after the fixed props of each workspace room, the kitchen, the party room, and the lobby. The meeting room gets no fill.
    - The fill gives one floor prop for each 7 m² of free floor over 30 m². So a small room stays as it was. In the demo, only the party room, the kitchen, and the lobby get more props.
    - Each room kind has a pool. The office pool has 27 kinds. Wall props: a piano, an aquarium, filing cabinets, a credenza, lockers, a snack machine, an arcade cabinet, a bike, and the old lounge, cooler, printer, and whiteboard. Floor groups: a reading nook, a sofa corner, a long shared table, a chess table, a high table with stools, a ping-pong table, a foosball table, two room dividers, a tree, a coat rack, a flip chart, bean bags, a plant, and the old cafe table. The party room also gets a bar and a drum kit, and the lobby gets a magazine table.
    - Against repetition: a room gets each kind at most once, and a plant or a bean bag at most twice. A room takes at most 80% of the floor kinds of its pool, so two big rooms get different mixes. The old fill (a cafe table and a lounge in turns) is gone.
    - The room id seeds the pick, the spots, and the turns. So each build gives the same props, and no prop jumps.
    - An earlier version also put flat runners on the walk lanes and sent each prop to the spot farthest from the other props. The user rejected both, in the user's words: "Hmm it's only filled at the side and now there is a weird brown border on the ground. I was thinking more of random fill up in the room itself rather then just at the border". Both are gone.
    - The fill now stands in the open floor between and around the pods, in a seeded random order. Floor props come first. A floor spot is at least 1.2 from each room edge, and a floor prop keeps 0.6 from each edge. Each spot has a random jitter, so the props do not stand in lines. A prop with a front turns it to the room middle.
    - Then a strip round puts thin props (a planter, a low shelf, a bench, a coat rack, a tree, a bean bag, a plant) on a finer grid, at least 0.6 from each room edge, so they spread over the whole room. Each of these kinds can come twice in a room.
    - Last, at most 3 wall props from the pool stand on the north or the west wall, because the camera sees these walls. They do not use the budget. The corner plants and the fixed props stay where they were.
    - A gap of 0.3 stays around each prop. No prop stands on a walk lane, the door area, a pod, the dance floor, or the speaker floor.
    - The walk lanes under a short pod next to a tall pod got narrower, so props fit there too (the main session chose this). Before, one walk rect as wide as the pod ran from the pod down to the row lane. Now each desk of the last row gets a lane 0.6 wide below it. The routes did not change.
    - The props use the colors of the palette. No prop glows.
26. A garden terrace against big rooms, in the user's words: "Maybe it's also an option to make like en L shaped office or so? To counter the big rooms. There isn't a hard requirement to keep the rectangle shaped office". Before, each row stretched its rooms to the width of the widest row, so a room with one pod could get about 30 wide. The user chose two answers: "Garden terrace" and "Width only".
    - "Garden terrace": a short row stops stretching its rooms. Its spare width becomes a garden terrace, behind glass walls, so the camera sees in. A terrace in a middle row is a closed courtyard.
    - "Width only": the rooms keep their own width, but they still share the row depth.
    - The rule: each row except the party row with a spare width of 4 or more gets a terrace. The main session chose the 4. A row with less spare width stretches its rooms as before. The party room keeps its rule (decision 24).
    - The terrace is at the east end of its row, from the last room to the cross corridor, with the row depth. The doors, the corridors, the routes, the kitchen, the party room, and the lobby keep their rules.
    - A terrace is a garden, not a room. It has no door, no sign, no desks, and nobody walks there. It has grass, a wood deck, garden trees, bushes, benches, loungers, tables with a parasol, planters, and a pond in a big terrace. The fill pass of decision 25 adds more props to a big terrace. The props use plain colors, and nothing glows.
    - A glass wall stands on each edge between a terrace and a room or a corridor. Two terraces back to back share their edge with no wall, so they make one courtyard. A terrace in the first row has a low hedge instead of the north wall. A terrace in the last row keeps the low south wall.
27. A lunch break, in the user's words: "Make sure that agents also can sit on the table in the kitchen to eat something like a lunch break". The user chose two answers: "Straight to the table" and "Longer: 20 to 40 s".
    - An idle worker picks one of three trips at random: a coffee at the counter, a lunch at a kitchen table, or a dance in the party room. Each has a chance of about one in three. Without a party room, the pick is a coffee or a lunch. This changes the coin of decision 24.
    - If the pick has no free place, the worker tries the next kind. If no place is free, it keeps browsing.
    - The worker walks straight to a free chair at a kitchen table. It does not stop at the counter first.
    - It sits, faces the table, and eats from a plate. Now and then it lifts a hand to its mouth. The hand stays below the shoulder, because a raised hand means `blocked`.
    - A lunch lasts 20 to 40 s. A coffee and a dance keep 6 to 15 s. If the status leaves `idle`, the worker runs back to the desk.
    - The model places the kitchen tables and their chairs, not the decor. A chair stands only on the west or the east side of a table, so no route crosses a table.
    - A lunch walker opens its own door and the kitchen door, like a coffee walker.
28. Game tables, in the user's words: "If there is like a chess board setup an da ping pong table, I want the agents to be able to use it when they're free". The spec is `docs/superpowers/specs/2026-10-06-game-tables-design.md`.
    - The user chose: two free workers pair up, the next free worker joins a waiting one (approach A), and the lobby chess table stays decor only. Decision 20 does not change.
    - Only big rooms get game tables, in the user's words: "Only do it in big rooms, e.g. the current version has a very big room (not the demo variant)". A workspace room or the party room is big when its floor minus its pods is 80 m² or more. The main session chose the 80 after a measurement: the very big rooms of the user's office have 209 and 452 m², and the other rooms 37 to 64 m².
    - A big room gets a ping-pong table and a chess table if both fit, else the one that fits. The model places them, on either side of the main walk line of the room. The fill pass no longer puts chess or ping-pong in a workspace room or the party room.
    - A game is a fourth trip kind, next to a coffee, a lunch, and a dance. A worker that picks a game goes to a free table and waits up to 20 s after it arrives. While it waits, the next idle worker that starts a trip joins it, whatever its own pick. If nobody comes, the waiter walks back.
    - Chess lasts 30 to 60 s, and ping-pong 20 to 40 s. Both players walk back at the end. If the status of one player leaves `idle`, it runs back, and the game of the other ends.
    - Chess players sit and take turns to move a piece. Ping-pong players stand at the table ends with a paddle, and a white ball flies between them.
    - In a room with its door in the south wall, that wall can hide a table near it from the camera.

29. Any macOS terminal for the raise, in the user's words: "go with auto-detect ... if it can't be figured out we can show a selector on start up with a choice".
    - At start, the bridge finds the `__CFBundleIdentifier` of each `herdr` process. herdr does not pass it to its panes, so the bridge cannot read its own environment. One id wins.
    - With none or many ids, the bridge shows a numbered selector in the terminal: the detected ids, then WezTerm, Ghostty, iTerm, Terminal, kitty, Alacritty, Warp, and "none". Enter picks choice 1. Without a TTY it takes the first id, else WezTerm.
    - At each click, the bridge detects again. One id wins. With none or many, it uses the start pick. So a move of herdr to another terminal needs no restart.
    - The bridge reads only that one variable. It never logs or stores the rest of the environment.
    - The raise brings the app to the front. It does not select the herdr window or the tab. It works on macOS only.
30. The chat for Codex agents, in the user's words: "Codex agents with herdr, go with option A". The research is `docs/agent-independence.md`.
    - herdr stays the only source of desks and statuses. herdr already detects Codex panes, so a codex desk already had its status, the focus button, and the message field.
    - The panel of a codex desk now shows the last reply and the chat window, as for a claude desk. The bridge reads the Codex rollout files. `docs/idr/0001-codex-chat-from-rollout-files.md` records the technical choices.
    - The office without herdr (options C and D of the research) is not built.

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
- A row click runs `herdr agent focus` for that pane and brings WezTerm to the front. This is the SketchyBar item, not the bridge.
- The user chose bright, high-contrast colors: blocked red, done ("ready") green, working orange, idle blue, unknown grey.
- The popup has a solid black background. The office does not use these colors.

## Open items and known limits

- No test covers the party lights, the speakers, or the dance, because Node cannot load three.js. A browser check in the demo and in the live office covered them.
- The rooms in the party row and in a terrace row do not get wider, so they do not get the extra props of a wide room. In the demo, "docs" is 7.8 wide, not 19.5. The demo has no terrace: each of its other rows has less than 4 spare width.
- Under a short pod next to a tall pod, only a lane 0.6 wide below each last-row desk is walk floor (decision 25). The props fit between these lanes. In a room with a north door, the row lane runs above the pods, and the floor under a short pod was never walk floor.
- The fill numbers (one floor prop for each 7 m² over 30 m², at most 80% of the floor kinds, a gap of 0.3, 1.2 and 0.6 from the walls for the floor round, 0.6 for the strip round, 3 wall props) come from a placement check in Node. The user did not tune them.
- The floor round gives a big room at most 12 props (80% of the 15 floor kinds of the office pool), the strip round at most 2 of each of 7 thin kinds, and the wall round at most 3. The spots are random, so a big room can get a dense patch next to a bare one. In a 32.4 x 7.4 test room with one pod, most floor groups stood in the west half. Since decision 26, that room keeps its width of 7.8, and a terrace of 24.6 x 7.4 fills the rest of its row.
- In a room full of pods (two pod rows, about 30 x 13), most fill props are thin props. In the test room with 9 tabs (30.6 x 13.3), the free floor went from 31% to 37%, and the props from 6 to 24. A test room with two rows of 4 pods (29.1 x 13.3) went from 29% to 34%, and also from 6 to 24 props. The band along the corridor side is about 0.5 deep after the gap, so it stays empty. Few groups of the floor round fit between the lanes there.
- A party room in a long, shallow row is mostly the dance floor and the strip. Only a few small props fit beside it.
- No test covers the fill pass, because Node cannot load three.js. A scratch check in Node (`docs/decor.md` "Check placement in Node") covered 288 rooms in 33 offices. A test in `test/walk.test.mjs` covers the narrow lanes under a short pod.
- No test covers the terrace walls, the hedge, the grass, or the garden props, because Node cannot load three.js. A scratch check in Node copied the wall rules of `build()`. In 29 offices it found one wall on each edge, and no wall between two terraces. A placement check covered the props of 31 terraces. The browser check of the terraces is still open.
- A row with a spare width just under 4 still stretches its rooms, by less than 4 in total. The user did not tune the 4.
- Nobody tested "Focus in herdr" (with the terminal raise) or the SketchyBar row click against the live herdr. The tests use fake sockets and stubs.
- The tests cover only the bridge side of a message. One browser check against a fake herdr socket covered the page side.
- The message field holds one line. "ok" in the panel means that herdr typed the text. It does not prove that the agent started a turn.
- The chat window shows only the history in the last 512 KB of the transcript. Older messages do not show.
- A claude pane without a herdr `agent_session` gets the newest transcript of its cwd. If two claude panes share that cwd, both can show the same chat.
- A codex pane without a herdr `agent_session` gets the newest top-level rollout of its cwd. If two codex panes share that cwd, both show the same chat. A `codex exec` run or an IDE session in the same cwd can also take the chat, because the fallback takes the newest top-level rollout of the cwd. The herdr codex integration is not installed, so this is the normal case.
- The Codex rollout format is internal to Codex. A Codex update can break the chat of a codex desk.
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
