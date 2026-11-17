# A tour of Motion Director

What Motion Director does, in 97 seconds, made in Motion Director. The comment loop is the spine of
the film. Claude opens the studio, and from then on the studio and Claude's chat are linked. In every step the
person points at something in the studio, comments on it and presses Enter. The comment arrives in Claude's chat
by itself, Claude makes the change, and it appears in the studio. Nobody copies, pastes or switches windows.
Nothing in the studio just appears: what arrives is Claude's edit, answering a comment. The film being edited is "Hello, motion.", a few shapes and a
ball that bounces, so there is always something moving to point at and to put sound on.

- **Purpose:** show that every step works the same way. Point at it, press Enter, and Claude edits it. And show
  the part no step names: Claude making the animation itself, in one big fast-forward between planning and editing. The steps are setting the vibe, planning the treatment, editing the motion, syncing sound to it, and
  exporting.
- **Length and format:** 97 s, landscape 16:9.
- **Sound:** the example's own starter sounds (`example/sounds`, made by `make-sounds.mjs`): a swell drawing
  each title in and a swish taking it away, clicks and key taps for the pointer and the comments, a paper slide
  as each comment is sent, pops as it lands and as Claude replies, paper for the vibe board and the treatment,
  a rising swell under the fast-forward that lands when the film is made, a latch for each bounce snapping on,
  then the ball's bounces themselves, and a shutter when the render is done. No music bed. Bring your own
  sounds through the library and re-cue the film on them: the cue times stay where the motion is.
- **Not product-specific:** this is the package's example, so it shows Motion Director and nothing else.

## Visual direction

- A pale stage with two windows on it, each lifted by a wide, soft shadow. The studio is on the left, at its
  real near-black self, rebuilt from the app's components. Claude's chat is docked on the right for the
  whole film, so the loop is always on screen: point, send, edit. When Claude opens the studio, the link icon
  in the studio's top bar lights up and Claude says your comments now come straight to it. That is the only
  mention of the link.
- No title bar across the top. Each step title lands in the middle of the frame in Host Grotesk ("Step 1 ·
  Set the vibe"), holds a beat and swishes out sideways as the UI arrives. Step 2's title flies down into
  the treatment and becomes its heading.
- Each loop has a rhythm:
  - **Point:** the camera pushes in on the thing being pointed at. The comment box opens, the comment is
    typed, Enter, and a green "Sent to Claude" badge.
  - **Picked up:** the camera pulls back while the pointer stays put. The note lands in Claude's chat on its
    own, marked as from the studio, and a count appears on the comments chevron.
  - **Edit:** Claude replies, the change lands in the studio, and the count clears as Claude marks it done.
- **Claude does its thing** is its own step, between the treatment and the edit: the whole making of the
  animation in fast-forward. The studio dims and streaks race across it. The treatment's frames run by on a
  filmstrip, each key developing in turn, under a Claude-orange badge ("Claude is making it") with its spark spinning and a time-lapse
  clock racing through the twenty minutes the work takes. In the chat, Claude's work ticks off a line at a time
  (reading the treatment, planning the keys, writing the film, building each key, animating between them,
  measuring the motion, checking every frame). Then the strip drops away, Claude opens Edit, and the film is
  there, built and playing.
- The first loop runs at full length so it reads. Each later loop is a little quicker, but never skips a
  part.
- Colour only where it means something: amber for a hit point and the open-comments count, the data colours
  for objects and the motion graph, green for sent.

## Beats

| Time | What happens | Title |
|---|---|---|
| 0–6.4 s | The opening line lands centred, then leaves; the studio rises in with Claude's chat docked beside it. Claude says it has opened the studio and comments come straight to it; the studio's link icon lights. | Films about your product, made with Claude. |
| 6.4–19.9 s | The vibe board is empty. A screenshot is dragged onto it and becomes a pin. The pin gets a comment: "This soft shadow. Find a few snappy launch films like it." Enter, it reaches Claude, and Claude adds them: three films, a palette, a typeface and a note drop onto the board. | Step 1 · Set the vibe. |
| 19.9–31.5 s | The title becomes the treatment's heading. Its beats sit beside their frames; the second says the ball bounces once. The beat gets a comment: "Make it three bounces, each lower than the last." Sent; Claude rewrites the beat, and its frame now shows three bounces. | Step 2 · Plan it out |
| 31.5–43.3 s | Fast-forward: the studio dims, the treatment's frames run by on a filmstrip, the clock races, and Claude's work ticks off in the chat. Then Claude opens Edit, the film already built and playing, and says it's made. | Step 3 · Claude does its thing. |
| 43.3–60.3 s | The film plays in Edit, silent. The ball gets a comment at its last landing: "Land the last bounce softer." Sent; the ball replays, softer. Then a bounce sound is dragged from the sound library onto a track, by hand. | Step 4 · Edit the motion. |
| 60.3–75.5 s | The bounce clip gets a comment: "Put this on every landing." Sent; the ball's motion graph opens with a mark on each landing, and a bounce snaps to every one. It plays, in time. | Step 5 · Sync sound to motion. |
| 75.5–91.7 s | The Export tab: the app UI check says the app has changed. The request goes to Claude in the chat ("The app has changed. Bring the screens in step."); Claude updates them and the check turns green. Then Render, and the finished film fills the frame. | Step 6 · Export. |
| 91.7–97 s | The closing line over the finished film at rest. | You direct. Claude edits. |

## Hits

- Each step title arriving (a swell) and leaving (a swish).
- Each loop: the click on the target, typing, Enter and the sent chime, the note landing in the chat, and
  Claude's reply.
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

Also: the link icon, the sent badge and the comments count, the sound library and dragging a sound onto a track, an object's motion graph with
its landings, and the render.

## Ending

"You direct. Claude edits." centred over the finished Hello, motion. at rest. No end card.
