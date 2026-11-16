# A tour of Motion Director

What Motion Director does, in about 90 seconds, made in Motion Director. The comment loop is the spine of
the film. In every step, the person points at something in the studio and comments on it. The note is
copied and pasted into Claude, and Claude makes the change. Nothing in the studio just appears: what
arrives is Claude's edit, answering a comment. The film being edited is "Hello, motion.", a few shapes and a
ball that bounces, so there is always something moving to point at and to put sound on.

- **Purpose:** show that every step works the same way. Point at it, paste it into Claude, and Claude edits
  it. The steps are setting the vibe, planning the treatment, editing the motion, syncing sound to it, and
  exporting.
- **Length and format:** about 90 s, landscape 16:9.
- **Sound:** only the example's own sounds (`example/sounds`, made by `make-sounds.mjs`). Each loop has the
  same small signature: a click on the thing, typing, Enter, the copied chime, the paste, Claude's reply,
  then the sound of the edit itself (pins dropping, a frame updating, a bounce landing). There is also a
  swell and a swish for each step title. No music bed.
- **Not product-specific:** this is the package's example, so it shows Motion Director and nothing else.

## Visual direction

- A pale stage with two windows on it, each lifted by a wide, soft shadow. The studio is on the left, at its
  real near-black self, rebuilt from the app's components. Claude's chat is docked on the right for the
  whole film, so the loop is always on screen: point, paste, edit.
- No title bar across the top. Each step title lands in the middle of the frame in Host Grotesk ("Step 1 ·
  Set the vibe"), holds a beat and swishes out sideways as the UI arrives. Step 2's title flies down into
  the treatment and becomes its heading.
- Each loop has a rhythm:
  - **Point:** the camera pushes in on the thing being pointed at. The comment box opens, the comment is
    typed, then the green "Copied to clipboard" badge and the amber "paste it into Claude".
  - **Paste:** the camera pulls back, the pointer crosses to the chat, ⌘V, and the note lands in the chat.
  - **Edit:** Claude works for a beat, replies, and the studio changes.
- The first loop runs at full length so it reads. Each later loop is a little quicker, but never skips a
  part.
- Colour only where it means something: amber for a hit point and "paste it into Claude", the data colours
  for objects and the motion graph, green for copied.

## Beats

| Time | What happens | Title |
|---|---|---|
| 0–5 s | The opening line lands centred, then leaves; the studio rises in with Claude's chat docked beside it. | Films about your product, made with Claude. |
| 5–19.9 s | The vibe board is empty. A screenshot is dragged onto it and becomes a pin. The pin gets a comment: "This soft shadow. Find a few snappy launch films like it." Copied, pasted, and Claude adds them: three films, a palette, a typeface and a note drop onto the board. | Step 1 · Set the vibe. |
| 19.9–32.9 s | The title becomes the treatment's heading. Its beats sit beside their frames; the second says the ball bounces once. The beat gets a comment: "Make it three bounces, each lower than the last." Pasted; Claude rewrites the beat, and its frame now shows three bounces. | Step 2 · Plan it out |
| 32.9–51.8 s | The Edit tab assembles and the film plays, silent. The ball gets a comment at its last landing: "Land the last bounce softer." Pasted; the ball replays, softer. Then a bounce sound is dragged from the sound library onto a track, by hand. | Step 3 · Edit the motion. |
| 51.8–68.4 s | The bounce clip gets a comment: "Put this on every landing." Pasted; the ball's motion graph opens with a mark on each landing, and a bounce snaps to every one. It plays, in time. | Step 4 · Sync sound to motion. |
| 68.4–84.5 s | The Export tab: the app UI check says the app has changed. The check gets a comment: "Bring the screens in step with the app." Pasted; Claude updates them and the check turns green. Then Render, and the finished film fills the frame. | Step 5 · Export. |
| 84.5–90 s | The closing line over the finished film at rest. | You direct. Claude edits. |

## Hits

- Each step title arriving (a swell) and leaving (a swish).
- Each loop: the click on the target, typing, Enter, the copied chime, ⌘V, the note landing in the chat,
  and Claude's reply.
- Each edit: the pins dropping in turn (rising), the beat's frame updating, the softer last bounce, three
  latches as the bounces snap to the landings and then the bounces in time, and the check turning green.
- The screenshot landing on the board and the clip dropping onto a track (the two things done by hand).
- The render's shutter.

## Product moments

All four tabs, and comment mode on each:
- the vibe board's pins;
- the treatment's beats beside their frames;
- the preview and the timeline's clips;
- the Export tab's app UI check.

Also: the copied badges, the sound library and dragging a sound onto a track, an object's motion graph with
its landings, and the render.

## Ending

"You direct. Claude edits." centred over the finished Hello, motion. at rest. No end card.
