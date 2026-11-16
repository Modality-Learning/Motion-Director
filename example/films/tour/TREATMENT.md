# A tour of Motion Director

What Motion Director does, in 87 seconds, made in Motion Director. The studio's own interface does
the talking: each tab builds itself up in front of the viewer, the cursor works it, and a step title lands
in the middle of the frame before the UI takes over. The film being edited inside it is "Hello, motion.", a
few shapes and a ball that bounces three times, so there is always something moving to point at and to
put sound on.

- **Purpose:** show the whole loop once: set the vibe, plan it as a treatment, edit it with sound, sync the
  sound to the motion, comment and paste the note into Claude, export. Make the comment loop the clearest
  part.
- **Length and format:** 87 s, landscape 16:9.
- **Sound:** only the example's own sounds (`example/sounds`, made by `make-sounds.mjs`): pops as things
  arrive, clicks and latches on presses, typing, a swell and a swish for each step title, and the ball's
  bounces locked to its landings. No music bed.
- **Not product-specific:** this is the package's example, so it shows Motion Director and nothing else.

## Visual direction

- A pale stage with the studio window floating on it, lifted by a wide, soft shadow. The studio is its real
  near-black self, rebuilt from the app's components at their real size.
- No title bar across the top. Each step title lands in the middle of the frame in Host Grotesk ("Step 1 ·
  Set the vibe"), holds a beat and swishes out sideways as the UI arrives. Step 2's title flies down into
  the treatment and becomes its heading.
- The UI builds itself: panels slide in from their own edges, rows stagger, pins drop, chips pop, buttons
  press. The camera pushes in on what matters and pulls back out, one move at a time.
- Colour only where it means something: amber for a hit point, the data colours for objects and the motion
  graph, green for copied.

## Beats

| Time | What happens | Title |
|---|---|---|
| 0–5.4 s | The opening line lands centred, and the studio window rises in under it, the tabs popping in along its top bar. | Films about your product, made with Claude. |
| 5.4–15.3 s | The Vibe tab: pins drop onto the board one by one (a video, a palette, a typeface, a note), and a screenshot is dragged in and becomes a pin with its take. | Step 1 · Set the vibe. |
| 15.3–24.5 s | The title flies into the Treatment tab as its heading. The beats fill in line by line, each storyboard frame sliding in beside the beat it shows; hovering a paragraph lights its frame. | Step 2 · Plan it out |
| 24.5–35.9 s | The Edit tab assembles: the sound library from the left, the preview with Hello, motion playing, the timeline's tracks, the inspector. A family opens and the ball-bounce row is dragged onto a track. | Step 3 · Edit, with sound. |
| 35.9–47.1 s | The ball is selected: its motion graph opens with a mark on each landing, and a bounce snaps onto every one. It plays, the bounces landing in time. | Step 4 · Sync sound to motion. |
| 47.1–66.9 s | Comment mode. The cursor clicks the ball's last landing and types a comment; Enter copies it (green badge, then the amber "paste it into Claude"). Claude's chat slides in, the note is pasted, Claude replies, and the film updates. Twice more, quicker each time. | Step 5 · Point at it. Claude edits. |
| 66.9–83.2 s | The Export tab: the drift check says the app's components changed; Claude brings the film back in step; the render runs and the finished film fills the frame. | Step 6 · Export. |
| 83.2–87 s | The closing line over the finished film at rest. | You direct. Claude edits. |

## Hits

- Each step title arriving (a swell) and leaving (a swish).
- Pins, frames and rows popping in; tab clicks; the screenshot landing on the board.
- The bounce row dropping onto a track; three latches as the bounces snap to the landings; the bounces in
  time with the ball.
- Typing the comment, Enter, the copied chime, the paste, Claude's reply popping in.
- The render's shutter.

## Product moments

All four tabs: the vibe board and its pins, the treatment with beats beside frames, the Edit tab (sound
library, preview, timeline, motion graph, inspector), comment mode with the copied badges, and the Export
tab's drift check and render.

## Ending

"You direct. Claude edits." centred over the finished Hello, motion. at rest. No end card.
