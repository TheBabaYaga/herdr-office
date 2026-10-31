# IDR 0009: the door aisle

Date: 2026-10-31

Status: accepted

## Context

Issue TheBabaYaga/herdr-office#12 (keep the door lane free of pods). In a workspace room with two or more pod rows, a worker walks its row lane to the door x, then straight to the door. A pod of a nearer row can cover the door x. The route then goes through a desk. `checkCat()` passes on the old layout for the 8-tab case of the issue, because the cat on the flap line clears the desk box of the test. It fails for the case `two full pod rows`: "w1:p1 at (14.40, 8.79): the cat touches the desk of w1:p21".

The user decided the design on 31 October 2026 (`INTENT.md` decision 42). This record holds the technical choices. `route()`, `catRoute()`, and `walkRects()` do not change. The door lane already runs from the door to each row lane. The layout now keeps that lane free of pods.

```text
8 tabs of 2 panes, door south, door x 16.5:
  row 1: t1 1.5..6.3 | t2 7.8..12.6 | t3 14.1..18.9 | t4 20.4..25.2 | t5 26.7..31.5
  row 2: t6 1.5..6.3 | t7 7.8..12.6 | t8 14.1..18.9   <- t8 covers the door x
Before: w1:p1 walks south at x 16.12 and ends inside the desk of w1:p15.
After:  t8 moves to x 17.8..22.6. The room stays 33.0 wide.
```

A room with a north door fails earlier, because row 1 lies next to the door.

## Decision

- `AISLE = 1.3`: no pod of a row but the first reaches within 1.3 of the door center x. The lamp post sets the value. It stands 0.5 west of a pod. A worker walks 0.38 off the door center and needs 0.4 from the post: 0.38 + 0.4 + 0.5 = 1.28, rounded up to 1.3.
- The aisle runs at the end of the tab loop in `buildOffice()`, before the band plan. The door side is not known there, so the aisle is symmetric round the door center x.
- The door stands in the middle of the room, and the pod block stays centered. So the door x is the middle of the pod block, `c = innerW / 2`, in pod coords.
- A pod moves to the nearer side. In each row but the first, a pod with its center west of `c` is in the west group, else in the east group. The west group moves west until its east edge is at `c - 1.3` or less. The east group moves east until its west edge is at `c + 1.3` or more. A group that is clear does not move.
- After the moves, `half = max(c - lo, hi - c)`, with `lo` and `hi` the block edges. All pods move by `half - c`, and `innerW = 2 * half`. One side of the block can hold empty floor.
- The band plan centered the block with `max(p.x + p.w)`, which drops that empty floor. So `buildOffice()` keeps the width of each block in a local `Map` named `block`, and the band plan reads it.
- Row 1 lies farthest from the door. The swap runs in the row loop of the band plan, where `r.door.side` is known, before the pods move to world coords. A north-door room swaps its rows in z. Each row keeps its depth and its top alignment: a row at `z0` with depth `rd` moves to `ih - z0 - rd`. The rows are grouped before the first move, because a swapped row can land on the `z` of a row that did not move yet.
- The `ponytail:` comment above `route()` about a room with two pod rows is removed.

```text
Rule:    the pods of a row west of the door x move west as one group, the others east.
Example: ROWS (8 mixed tabs), door south: a pod of row 2 crosses the door x. The room grows from 29.1 to 32.6.
         The door stays at the middle of the room, over the aisle.
```

## Options that lost

```text
Option                                      Result                                    Verdict
1. An aisle in row 2 and later, the         Fixes a south door only. A north-door     rejected
   issue proposal                           room fails at 6 tabs, a south door at 8.
2. An aisle in every row                    8 tabs of 2 panes: 33.0 -> 40.4           rejected: too wide
3. A route round the end of each row        New cases in route(), catRoute(), and     rejected: more code
                                            walkRects(), and longer walks
4. Every pod in the aisle moves east,       8 mixed tabs: 40.4 instead of 32.6.       rejected: twice the shift
   with a pad on the west                   20 one-pane tabs: 41.6 instead of 33.8
5. Nearer side, rows swapped for a north    8 mixed tabs: 32.6                        chosen
   door
```

## Consequences

- Some rooms get wider. The cost is the shift of the nearer side.

```text
Room                    Before  After
8 tabs of 2 panes       33.0    33.0
10 tabs of 2 panes      33.0    40.4
14 tabs of 2 panes      -       40.4
8 mixed tabs (ROWS)     29.1    32.6
12 one-pane tabs        32.7    33.8
20 one-pane tabs        32.7    33.8
9 tabs of 3 panes       27.6    37.4
```

- A wider room can change the band plan: the party row, a terrace, and the stretch of the other rooms. `assertRows()` uses `span()`, which measures the block round the door, so it follows the new width.
- A new pod row rule must keep the aisle at the door x free. Else `checkRoute()` fails with `inside the desk of`.
