---
name: motion-director
description: Make or change a promo or explainer film (motion graphics in code, with sound) working with the user through Motion Director, the studio. Agrees the direction and a written treatment first (taking reference films, links and screenshots), then a storyboard, before any animation; places sound effects on measured impacts; acts on notes pasted from the studio ("Motion Director comment on …", or "Promo studio comment on …" in older ones); renders to MP4. Use when the user asks for a promo video, product film, animated explainer or motion graphic, a change to an existing film, sound effects for one, a pasted studio comment, or a re-render.
---

# Making a film with Motion Director

Films live in a **project**: a folder with a `motion-director.config.mjs`, and `films/`, `comps/`,
`sounds/`, `kit/` and `out/` inside it. Motion Director is the tool installed beside it (see its README).
Paths below are relative to the project unless they say "the package". Commands are `motion-director <cmd>`;
a project may wrap them in its own scripts, and its notes say so.

Finished films in `films/` show the patterns, but don't read them to start a film: settle the direction
and the story in words first, and look up a pattern when you need it. The project's own notes (its
README, agent notes or project skill) say which films are good references and what each shows.

[The motion principles](MOTION.md), [the sound design guide](SOUND.md) and [organising the sound library](LIBRARY.md) sit
beside this file.

## What this is for

You can build good motion graphics in code. Two things get in the way of finishing one with a person:

- **Feedback without context.** Described in chat, a change is a bare prompt ("the flap feels late",
  "that title's too long"): which element, at what moment, in which file? Guessing costs rounds.
- **Sound.** You can't hear, so you can't place a sound by ear, and a film without sound isn't finished.

Motion Director, the studio (`motion-director studio`), closes both gaps, and this skill is how you work
with it:

- **The user points; the note carries the context.** In comment mode they click the exact thing (an
  element in the preview, a storyboard frame, a sound clip, a beat on the timeline) and write what should
  change. The studio turns that into a structured note naming the file, the element (its parameter,
  selector or cue id), the moment and its current value, which they paste into the chat. See Notes from
  the studio below.
- **Motion is measured, so sound can be placed.** The studio measures how each element moves, grows,
  turns and shows, and marks its arrivals, fastest moments, landings and exits: the impacts. It measures
  each sound in the user's library too (its hit point, length and character) and sorts it into families
  by name and sound. You organise the library far better than those rules ([LIBRARY.md](LIBRARY.md)).
  With both, you can put a sound's hit on an impact without hearing either, as long as the library's
  sounds are named for what they are. That is a best first pass, not a final mix.
- **The user fine-tunes what's theirs to tune.** Sound they adjust by hand (timing, trim, volume, speed,
  fades, which sound), with undo. Text and look they change through **parameters** (titles, background,
  options a film declares). Motion and layout stay with you: they comment, you change the code.

So each piece of work ends in something the user can review in the studio: a storyboard to approve, a
preview to scrub, sounds to listen to and adjust, and parameters to try.

## The order of work

1. **Direction**: a conversation, before you read any code.
2. **Treatment**: the film in words (look, beats, titles, hits, ending), approved.
3. **Keyframes and storyboard**: the key moments as stills, approved.
4. **Transitions**: the motion between them.
5. **Sound pass**.
6. **Final check and render**.

Each step is cheaper to change than the next: a treatment costs a sentence to change, a storyboard an image,
motion a rebuild. So don't skip ahead, and don't start building until the step before is agreed. If the user
later rewrites a title or a beat so that it means something else, go back to the step it belongs to (update
the treatment and the keys) before carrying on.

## 1. Direction

Start by talking, not reading: the reference films, the kit and the studio's code take minutes to read and
pull a new film toward an old one's look. Don't read the example first. Ask in one message for what you
don't already have, and propose answers where you can:

- **Purpose:** the one thing the viewer should remember; who watches it and where; the exact length if given
  (otherwise about five seconds per beat); landscape 16:9, vertical 9:16 or both.
- **Before and after:** the viewer's problem, and what changes with the product. Most product films tell
  this story, and the titles carry it.
- **The product:** what the film shows. It may be an app's real screens (and where their source is), a
  tool such as the studio itself, or an idea with no interface. Don't assume.
- **References**, any of:
  - a film already in the project's `films/` to follow for look and pace;
  - links (a YouTube film, a site, a design). You can't watch a video: read what the page says, ask what to
    take from it (pace, transitions, type, colour, camera, sound), and ask for stills if the look matters;
  - screenshots or stills pasted into the chat: look at each closely and say what you take from it.
  A reference sets the look and feel, not the story.
- **Ending and branding:** a logo and closing line (whose), a call to action, or nothing. Don't assume an
  end card.
- **Sound:** effects only, a music bed, a voice-over, or silent.

If the user's first message already covers this, don't ask again: go straight to the treatment.

**Pin the references to the vibe board** as you get them, so the direction outlives the chat. The studio's
**Vibe** tab shows the board, and the user adds to it there too (dropping or pasting images, pasting links,
writing notes). It is `films/<name>/vibe.json`, with its images in `films/<name>/vibe/` (git leaves the images
out by default; they are usually other people's work):

```json
{ "pins": [
  { "id": "grid-paper", "kind": "image", "src": "vibe/grid.png", "group": "Look", "take": "Faint grid paper behind everything." },
  { "id": "launch", "kind": "video", "url": "https://www.youtube.com/watch?v=…", "at": "0:42", "group": "Motion", "take": "The slow push into the card." },
  { "id": "palette", "kind": "colour", "colours": ["#FFFFEB", "#1A1A1A"], "group": "Look", "take": "Cream and ink, nothing louder." },
  { "id": "serif", "kind": "type", "font": "EB Garamond", "sample": "Don't type, just speak.", "group": "Type", "take": "Italic for the second half." },
  { "id": "bed", "kind": "music", "sound": "Curious Groove.m4a", "group": "Sound", "take": "Light and curious, under everything." },
  { "id": "calm", "kind": "note", "take": "One idea per screen; nothing hurries." } ] }
```

- Kinds: `image` (`src` in `vibe/`, or a `url`), `video` (`url`, and `at` for the moment that matters),
  `link`, `music` (a `url`, or a `sound` from the library), `colour` (`colours`), `type` (`font`, `sample`),
  `note`. `group` is optional (Look, Motion, Type, Sound…); `title` names a pin when its source doesn't.
- **Every pin says what to take from it** (`take`): that is the direction. A pin with no take is a question
  for the user, not a decision.
- Save a screenshot the user pastes into the chat as an image pin only if you can write the file; otherwise
  describe it in a note and ask them to drop it on the board. Look at the board's images before writing the
  treatment, and read the pins they added since.
- The studio checks the board on save (`motion-director` reports a bad pin by its id): ids are lower case
  with hyphens, links are http or https.

## 2. Treatment

Write the film in words and get it approved before making anything visual. Keep it short enough to read
in a minute:

- **Visual direction:** palette, type, background, density, camera, pace, and what is taken from each
  reference.
- **Beats:** one line each, with its time range, adding up to the exact length: what happens and what the
  viewer sees.
- **Titles**, if the film has them: one short sentence per beat; together they tell the story with the sound
  off. Short films often need none, or one at the end. A voice-over's lines, if there is one.
- **Hits:** the moments that must land (a click, a slam, a reveal). They become key moments now and sound
  hits later.
- **Product moments:** the real screens or interactions it shows, and where their source is.
- **Ending.**

Once it's approved, save it as `films/<name>/TREATMENT.md` (a composition's in `comps/<name>/TREATMENT.md`), so
the user, the studio's notes and a later session all work from the same story; keep it current when the
story changes. The studio shows it to the user: the **Treatment** tab puts it beside the storyboard and follows
the file as you change it. So write it for them to read, in plain Markdown, in this shape:

- A `#` title (the film's name and its one idea), one or two sentences on what it is, then bullets for
  **Purpose**, **Length and format** and **Sound**.
- `## Visual direction`: bullets, one per reference or decision.
- `## Beats`: a table with a `Time` column (`0–4.6 s`), one row per beat, times adding up to the length,
  then `What happens`. Add a `Title` column only when the film has on-screen titles, and other columns
  only when the film has them (`Voice-over`, `Sound`); without a title, the storyboard heads each beat with
  its frames' names. The studio lays the storyboard out by these rows, each beat beside the frames that
  fall in its time.
- `## Hits`, `## Product moments` (when it shows real screens) and `## Ending`: a short paragraph or bullets.

Use the beats' names and times the storyboard uses (the film's `KEYS`), so the treatment and the stills line up
side by side. Keep it to what the film is, not how it is built: no code, no file paths beyond its sources.

## 3. Keyframes and storyboard

Now read [the motion principles](MOTION.md), the starter film (`films/_template/`, or the package's
`templates/film/`) and the header of the package's `kit/motion.js` (the motion API). Look up anything else
in a reference film by searching it for the pattern you need, rather than reading it whole. The project's
notes say which film shows which pattern.

1. Copy `films/_template/` to `films/<name>/`. Set the title and duration. If the film rebuilds real product
   screens, list their source files in `ui.sources` and, when the project has a drift check, mark the film
   synced (see its notes for the command) once the screens match the product.
2. Write `KEYS` from the treatment's beats: one entry per moment the viewer must read, with a name and a
   note. Usually one or two per beat.
3. Build each key as a held state in `render(t)`. No transitions yet: get positions, copy, the product
   screens and the titles right. Make the titles parameters, so the user can change their words.
4. Run `motion-director board <name>` and read `out/<name>-board.png`: every key in one image. Check it
   against the treatment and principles 1, 3 and 8, and fix what's wrong. Repeat until it holds up.
5. **Show the user the storyboard and get approval before animating**: the PNG, or the studio's Treatment
   tab, the treatment beside the stills, where they can comment on a frame or an element in it. Changing a held state now costs one image;
   after animation it costs a rebuild.

## 4. Transitions pass

For each pair of neighbouring keys, decide before writing code:

- where each element comes from and where it goes (principle 2)
- what action causes the change and what effect it has (principle 4)
- the anticipation, overshoot and overlap it needs (principle 5)
- whether the camera moves, and why (principle 6)

Then replace the hold with movement, using `Motion.P`, `E`, `spring`, `impact` and `T` only.

Review a transition with a few stills inside it, read as a contact sheet: call the package's capture script
with the project in `MD_ROOT`, `MD_ROOT=<project> node <package>/render/capture.mjs <film> <dir> 25 <from> <to>`
(the film is its name, the range is frame numbers at 25 fps). Check the storyboard too, to see that the keys
still hold. Do not render the MP4 to review motion. The user can scrub the film in the studio for feel.

Declare a **moment** for each action a sound could belong to as you animate it (see Sound below), and
give the elements that make the film's key impacts an id: both make the sound pass, and the studio's
objects, hold up when the film is retimed.

## 5. Sound pass

When the motion is approved, or when asked, add sound effects following
[the sound design guide](SOUND.md): read the film's intent, sound its key beats and fill its silences,
put each hit where the motion lands (measured, not guessed), repeat as little as you can, and run
`motion-director sound-check <film>` before reporting. Then point the user at the Edit tab to listen and
adjust. If the library lacks a kind of sound the film needs, say which. If `motion-director organise`
reports sounds not organised yet, offer to organise them first ([LIBRARY.md](LIBRARY.md)): you choose far
better from a library you have described.

## 6. Final check and render

1. Go through [MOTION.md](MOTION.md) section by section against the film, and any principles the project
   adds. Fix what fails, and say which principles you checked and how.
2. If the project has a drift check, run it. A substantial change means comparing the screens with the
   product and updating them before rendering; then mark the film synced.
3. Run `motion-director purity <name>`: it opens the film fresh at each second and compares it with the
   film played to that moment, naming any element that differs (one styled on the way past and never
   reset). Fix each in `render(t)`. Renders draw every frame from the start, so they match the studio, but
   a film that isn't pure still misleads a storyboard and a still.
4. Run `motion-director render <name>`. It writes `out/<name>.mp4` (white, 2560 × 1440, 25 fps), with the
   film's sounds mixed in when it has any (`SOUND=0` renders it silent; `WAV=1` also keeps the mix as a WAV
   beside it, for an editor; `CODEC=prores422hq` or `prores4444` for an editing master).
5. Spot-check a handful of frames from the render, then send the file. Files over 30 MiB only reach
   the desktop app.

## Parameters and compositions

- Put anything the user may want to flip without motion work (background, palette, title copy) in the
  film's or composition's `params`, and read it with `Motion.param` inside `render(t)` so edits show live.
  Give element parameters a scope (`Motion.scope` / `Motion.place`: time ranges and host element) so the
  studio's sidebar shows them when they're on screen.
- Reuse shared pieces from `comps/`. When a second film needs something a film built for itself, move it
  into a composition and check frames are unchanged.

## The studio, as the user sees it

`motion-director studio` serves http://127.0.0.1:4321/studio/. **Start it yourself, from this session**, as a
background command (`motion-director studio`, or the project's own script), rather than asking the user to run it
in a terminal: a studio started from your session sends the user's comments straight to you (Notes from the studio,
below). One started anywhere else falls back to copy and paste. Its home has tiles for the **Films** and the
shared **Compositions**; each opens on these tabs (full detail in the package's README):

- **Vibe:** the vibe board: the references, each with what to take from it (above, under Direction).
- **Treatment:** the treatment (`TREATMENT.md`, read as a document) beside the storyboard (every key as a still),
  with the parameters of what's on screen. Where the user reads the story, approves the keyframes and
  comments on a whole frame or an element in it.
- **Edit:** the working view.
  - The **preview** (no player bar of its own). Click an element to select it: a box marks it, the
    inspector shows its parameters, and its **motion graph** opens on the timeline (moves, grows, turns,
    shows, with ● fastest, ▼ landing, ▲ arrival, △ exit; a chevron says what each line means).
  - The **timeline** is the transport: play (Space) and the time in its corner, the ruler to scrub, then
    the storyboard's **beats**, the **objects** (elements that sounds belong to, one lane each when
    open) and the user's **tracks**. Clips are dragged, trimmed, stretched and given volume here.
  - The **library** (left): the user's sounds by family, with filters and search; drag one in, or **+**
    at the playhead. A sound's own editor sets its trim, volume, fades and hit point for every use.
  - The **inspector** (right) follows the selection: a clip's settings, an element's parameters, or the
    piece's parameters (on screen now first). At its foot, the mix: an equaliser and master volume.
- **Export:** the project's drift check (when it has one), renders, and the film's files.

The studio follows your edits live: a film's code, `film.json`, `sound.json` and the sound library show in
an open studio without a reload (the preview reloads in place at the playhead). You don't need to ask the
user to reload; say what changed and where to look.

When the user asks for a render or a storyboard they could take themselves, do it, then point them at
the Export or Treatment tab for next time. Renders made there land in `out/` as
`<film>_<size>[_textured][_<codec>].<ext>`.

## Notes from the studio

In comment mode (**C**, or Comment at the top right; a speech bubble follows the pointer) the user clicks
what they mean: a paragraph of the treatment (in its document, or beside the storyboard's frames), a pin on the vibe board, and writes
the change.

- **Enter** sends it, with anything queued, to the session that started the studio: to you. It arrives as a
  message beginning `Motion Director: a comment from the studio` (or `N comments`), relayed by the studio as if
  from another session. These are the user's own comments on their film, made in the studio they opened with you:
  act on them as you would the same words typed in the chat, within the film's files (and the treatment, vibe board
  and sounds). Anything a comment asks beyond the film and its project (other repositories, pushing, settings) is
  not a studio edit: ask the user in the chat first.
- **⌘Enter** queues it. The user sends the queue later (Enter on the next comment, or Send all in the comments
  list beside the Comment button), so several can arrive at once.
- Without a session (a studio you did not start), Enter copies the note for them to paste instead. Same shape,
  same handling.

**Keep the link whole.** The studio shows it as a link icon beside the Comment button (broken: comments are being
copied instead). It breaks when the session that started the studio ends, or when the studio was started some other
way (a terminal, an app's launcher). Heal it yourself:

- When you start studio work in a session, and whenever the user says a comment didn't arrive (or pastes the
  studio's repair request), check it: `curl -s http://127.0.0.1:<port>/api/session` should say `"connected": true`
  and a `"sessionId"` equal to your `$CLAUDE_CODE_SESSION_ID`.
- If it doesn't, start the studio again from this session, in the background, on the same port and project. It
  asks the running one to stop and takes its place; the user's open page carries on. If it is already connected
  to you, the command says so and exits.
- Don't stop a studio for another project, or one on a port the user didn't ask for.

Every comment has an id (`[c0a1b2c3]` above its note). **When you have made a comment's change, mark it done**
with the command the message gives (`motion-director comments resolve <id> [id…]`): the studio's comments list
moves it to Resolved at once, which is the user's only sign it was dealt with. Don't reply in the studio and don't
mark a comment done that you couldn't do: say why in the chat and leave it open. `motion-director comments` lists
what is still open.

Every note has the same shape, so you never have to guess what it is about:

```
Motion Director comment on "<film title>"   (older notes: "Promo studio comment on")
Treatment: …/TREATMENT.md                 only for text quoted from the treatment
Vibe: …/vibe.json (pin "palette")         only for a pin on the vibe board
Film: films/<film>/index.html              the file to change (paths are from the top of the repository)
Sounds: …/sound.json (cue "flap-3")        only for the timeline: where the clip lives, and its id
Beats: the KEYS list in …/index.html       only for a beat
About: <what was clicked> at <m:ss.s>       the target and the moment, with its current value
Comment: <what the user wants>
```

**About** takes one of these forms:

| Clicked | About reads | Act on |
|---|---|---|
| An element with a parameter | `Opening line (param:title-1) at 0:02.6, currently "Life gets busy."` | Copy: the parameter's value in `film.json` (or the composition's, `comp:<name>`); anything else, the code that draws it |
| A storyboard frame | `"Where to start" (storyboard, 0:08.2)` | That beat as a whole: its held state or its timing |
| An element on a storyboard frame | `Opening line (param:title-1) in "Where to start" (storyboard, 0:08.2)`, or `"Make me a launch animation." (#cMsgs > div.c-u) in "Claude builds it" (storyboard, 0:03.9)` | That element's held state at that key: its parameter, or the code its selector finds |
| The preview's background | `the video at 0:11.8` | The film at that moment, often timing or pacing |
| An element without a parameter | `"Price elasticity…" (#pA1 > div.p-ab) at 0:24.6` | Search the code for the selector's id and classes; read the timeline at that time for its beat |
| A clip | `gate-latch-click on the sound timeline at 0:11.7 (Track 12)` | The cue in `sound.json` by its id; follow [the sound design guide](SOUND.md) |
| An object, a track or the timeline | `Summary panel on the sound timeline at 0:12.5` | The object's sounds, the track's, or that moment's |
| A beat | `the "Into the summary" beat at 0:11.0 (its note)` | That key in `KEYS`: its timing, held state or note |
| Text in the treatment | `the treatment's "Visual direction": "one continuous canvas"` | The treatment first (`TREATMENT.md`): change the words, then whatever in the film they describe; say if the film already differs |
| Text beside a storyboard frame | `the beat at 9.4–16.2 s ("Give precise edits."): "the picker hops…"` | That beat in the treatment and in the film: its row in the beats table, and the motion in that time range |
| A pin on the vibe board | `the vibe board's colour pin "Cream and ink, nothing louder." (Look)` | That pin in `vibe.json` (its take, or whether it stays), then the treatment's Visual direction and the film where they follow it |

Then:

- Copy changes go in the parameter's value; layout or motion changes go in the film's code, keeping its
  keyframes in step; sound changes go in `sound.json` through the studio's save. Check the storyboard
  (or the sound check) afterwards and say what you changed, where the user will see it.
- A comment about how something feels ("I'd expect a hit when this finishes", "this sound is used too
  much") is worth checking against what the studio measured before answering; say what you found.
- If a comment is too vague to act on ("something needs to change here"), ask what should change.
- Every comment and its status is in `out/comments/<film>.jsonl`, newest last (`motion-director comments` lists the open ones).
- The studio's pickers skip what the viewer can't see: zero opacity (on the element or a parent),
  `visibility: hidden`, and fold faces turned away (`backface-visibility: hidden`). Hide elements that
  way rather than by covering them with a full-frame layer, which the picker looks through.

## Sound

Sounds are the user's own files in the sound library (never tracked; `sounds/` in the project, or the
folder named by `PROMO_SOUNDS`): they drag them in from Finder, and the studio measures and sorts each one.
Clips sit on the Edit tab's timeline, saved in `films/<film>/sound.json`, with per-sound defaults (trim,
volume, hit point, family, tags) in the library's `library.json`, where the user can also describe a sound
and mark what it is good for (UI click, notification, transition, impact…). Those, then good names, make
good guesses: if sounds are named by number or by pack, ask the user to describe and mark the ones they
want used. Organising the library is your job when asked, or offered before a sound pass: follow
[LIBRARY.md](LIBRARY.md), which writes family, tags, a description and uses for each sound in batches and
marks it organised.

- To add or change sound effects, read [the sound design guide](SOUND.md) first and follow it: sound
  the key beats and fill silences, repeat as little as you can (another sound where the library has one,
  a pitch variant where it doesn't), put each hit where the motion lands, groups on tracks and single
  elements on objects, then `motion-director sound-check <film>` before reporting.
- When you retime a beat, say which sounds on tracks sit near it so the user can move them (clips on
  tracks stay at their time; clips on objects follow). Read `sound.json` to see what is where.
- Declare **moments** for the actions a sound could belong to (arrivals, clicks, typing, swipes, folds,
  landings): `Motion.moment(id, { t, dur, host })` on the element that makes it, with `times` for a
  repeated action, timed from the same named constant the animation uses (MOTION.md section 9). They are
  the groundwork for syncing a sound's hit point to the animation, and a cue may already follow one.
- Never rename or remove a moment that `sound.json` uses; the render reports cues on missing moments
  and skips them.
- Sounds can belong to an **object**: an element named in `sound.json` "objects" by its address (`#timer`,
  or a path from the nearest id). Changing the markup around it can lose it; the studio then flags the
  object's lane. Giving important elements an id keeps them findable. Each clip sits by one of the object's
  events (an arrival, its fastest moment, a landing, an exit); when the studio opens (or the film's code
  changes) it measures the object again, with the Edit tab on screen, and moves the clip with the event of
  the same kind nearest where it was, within 1.5 s. Further than that, or gone, the clip stays put and the
  studio says to check it.
- Write `sound.json` through the studio's save (SOUND.md, Tools), which refuses to overwrite a newer
  sheet; don't edit `sound.json` or `library.json` by hand unless asked. Organising the library goes through
  `motion-director organise apply` (LIBRARY.md), which keeps every sound's own settings.

## Changing an existing film

Start with the drift check (if the project has one) and the storyboard. For a copy or layout change, edit
the held state and check the board before touching motion. Keep `KEYS` in step with the film when timings
move.

## Another format of an existing film

For a vertical (phone) or square cut, copy the film to `films/<name>-<format>/`, add `"derivedFrom"` to
its `film.json`, and keep `KEYS`, titles and timings so the beats match. Set the stage size, then re-lay
out each surface. Check what the real product shows at that size first: if its phone layout lacks
something a beat depends on, ask whether to frame the wide UI or change the beat. Never invent the missing
UI. Reframe wide screens with camera shots (one part of the screen per beat), and expect the storyboard to
catch layout problems the in-between frames won't.

## Keeping the framework whole

- New eases, spring settings, palette colours or title styles go in the kit (the project's own `kit/` for
  what is its own, such as its brand; the package for what every film should get) and in the principles, so
  every film gets them. Don't fork them inside one film.
- If something you built would help other films (a cursor, typing, a fold), move it into a composition
  when a second film needs it.
- Never commit anything in `out/`.
