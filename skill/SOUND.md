# Sound design for a film

Use this when asked to add sound effects to a film, or to change them. The sounds are the user's own
files in the sound library; the cues live in `films/<film>/sound.json` (model: the package's
`kit/sound.mjs`; the studio's side is described in the package's README, Sound). You can't listen, so you measure: where
things land, how often each sound is heard, how loud the mix is, where it falls silent. The user judges
by ear; say what they should listen for.

## Tools

- **The studio** (`motion-director studio`, http://127.0.0.1:4321/studio/): open the film's Edit tab in the
  browser and work from that page.
  - `window.__promoSound` is the studio's own measuring, so your marks agree with the graph the user
    sees (it is there once the Edit tab has been opened): `await measure(address)` gives an element's samples (`[t, x, y, w, h, shown, spin, tilt]` every
    0.04 s) and its marks (`{ kind: 'in' | 'peak' | 'stop' | 'out', t, line }`); `eventsOf(curve)` lists
    them in order, as a clip's anchor counts them; `sheet()`, `moments()`, `beats()` and `analysis()`
    (each library sound's length, hit point and character) read the rest.
  - The preview is `document.querySelector('#editFrame').contentWindow`: its `Motion.moments` are the
    film's declared moments, and `__film.seek(t)` with plain DOM reads (opacity, transform, text) times
    anything to 5 ms. `__film.motionCurve(step, address)` samples one element finer than `measure`.
  - An element's address is its id (`#ring`), or a path from the nearest id
    (`#fold > div:nth-of-type(1) > div:nth-of-type(2)`).
- **Saving**: `GET /api/sound?film=<film>` returns `{ sheet, version }`; `POST /api/sound` with
  `{ film, base: version, sheet }` and the header `x-promo-studio: 1`. It is refused if the sheet changed
  since you read it (the user may have the studio open), so nothing is ever written over their work.
- **The check**: `motion-director sound-check <film>` counts how often each sound is heard and at how
  many pitches, finds overlapping clips, mixes the film as the render does and reports its peak, its
  loudest moments (with the clips there) and any quiet stretch. Read every flag before reporting.
  `motion-director sound-check <film> --hits flap-3,bell` mixes just those clips and says where each one's sound peaks against
  where it should land.

## 1. Read the film before choosing sounds

- Read the titles and `BEAT` constants: each section has an intent, and the intent sets the density. A
  section about overwhelm (a busy week, piles of material) can be dense and layered; a brand or reading
  hold stays sparse.
- List the declared moments, then look for actions that have none: text that changes (search the
  render code for `textContent` swaps: a backspace and a full stop are two keystrokes), an element
  fading in, a camera push.
- Read `sound.json` and `sounds/library.json` first. Never change or move the user's clips; add alongside
  them. If one of theirs is far louder than the rest, say so instead of fixing it. A sound the user has
  tuned in the library (a hit point, a trim) is one they mean to use.
- Choose sounds by what the user says they are first: a sound's `uses` in `library.json` (what it is
  good for: `ui-click`, `typing`, `notification`, `success`, `appear`, `transition`, `impact`, `paper`,
  `slide`, `reveal`, `music`, `ambience`, or the user's own words such as `logo sting`) and its `description`, then its family and name, then its
  measured character. Where sounds have neither and their names say little, ask the user to describe and
  mark the ones they want used: the sound's editor (✎) suggests uses from its name.
- If the library is empty or lacks a kind of sound the film needs, say which (a short whoosh, a click,
  paper, a chime) rather than forcing a poor match.

## 2. Choose what gets a sound

- Every story beat and focus point: the key action, the click, the landing, the reveal. Not titles,
  not every element on screen.
- Then the silences: no stretch over about a second without sound, except a hold that music should
  carry (say which). Fill a gap with a real event in it, never an invented one.
- A big group of similar elements (a grid of cards filling, a pile of documents, chat messages): sound
  about 80%, skipping evenly, so it reads as a flurry and not a machine gun.

## 3. Repeat as little as you can

The same sample heard again and again is what makes a sound track feel cheap. Before reusing a sound,
look for another in the library that fits; when there is none, change the pitch.

- A recognisable sound belongs to one kind of action. One whoosh heard for the slot, the camera, the
  messages and the titles reads as the only sound you had.
- Prefer the sound the action makes: a message sent is the Enter key that sends it, not another whoosh.
- Where one action really repeats (every chat reply, every flap of a ratchet), vary the pitch,
  tape-style (`rate` 0.9–1.3, `keepPitch: false`), so no two neighbours are identical; rise through a
  build (each kind of card a step higher as the grid fills, each flap higher than the last,
  the second "done" ding above the first).
- A run of one gesture (a week filling with pops, 40 ms apart) counts once; the check treats hits under
  0.6 s apart as one moment.
- The check flags a sound heard at six or more separate moments, and three or more clips at one pitch
  across separate moments. Resolve each flag or say why it stays.

## 4. Put each hit where the motion lands

A moment's time is when its animation starts, not its impact. Measure the impact:

| Action | The hit goes on |
|---|---|
| Something pops or fades in | its arrival: when it is half visible (the ▲ mark) |
| A slam, a flap shutting, a slide stopping | its landing (the ▼ mark, or where a tilt reaches flat) |
| A whoosh across the screen | its fastest point (●); a whoosh peaks slightly before, which leads the motion well |
| Typing | the first character; one keystroke per later key change |

For a group, seek the preview in 5 ms steps and read each element's opacity or tilt. In practice items
arrive tens of milliseconds after their moment and slides stop half a second after theirs: guessing
from moments puts every hit early.

Place a clip so the sound's hit point lands on the impact: `at = impact − (hit − from) / rate`, where
the hit is the clip's own, else the library's, else the measured one (`analysis()[sound].hit`). For a
slice of a longer file (one keystroke out of a typing recording), set the clip's own `hit`. Find a clean
slice by its envelope: a transient well above what is around it. Take its time from the sample's position
(`index / sampleRate`), never from a count of windows times a rounded window length: a "2 ms" window of
88 samples drifts 29 ms by 12 s, enough to start a slice after the click and keep only its tail. Start the
slice about 20 ms before the attack, then confirm it in the mix.

## 5. Groups on tracks, single elements on objects

- **One element's own impact, with a stable id** (a ring, a bell, a panel sliding, a fold): link the
  clip to that element as an object, so it follows the element when the film is retimed. Add an entry
  to `objects` (`{ label, selector }`, a readable label; the id is `o` and letters or digits), and give
  the clip `object`, `track` (its row in the object's lane) and `anchor`: the object's event nearest the
  clip's hit, `{ kind, n, t }` from `eventsOf(await measure(selector))`, n counting only events of that
  kind. A clip follows the event of the same kind nearest its anchor's `t` (within 1.5 s), so `kind` and
  `t` must be right; `n` is for reading. Measure with the Edit tab on screen: a hidden preview has no sizes,
  and `measure` returns nothing rather than a curve of fades alone.
- **Many similar elements doing one thing** (a week filling, materials piling up, a row of flaps
  ratcheting shut, chat messages): clips on tracks at measured times. One object each would bury the
  lanes.
- If an element has no stable id and matters, suggest giving it one. If its impact isn't a measured
  event (a resize too small to mark), the clip follows its nearest event: say so.
- Check in the studio: whenever it opens or a film's code changes, it re-measures every object and moves
  clips whose event has moved. Nothing should move (no "Sounds followed" message, `sound.json` unchanged).

## 6. Layers and tracks

- A chaotic section is layered: a sound per item by type (paper for documents and notes; a pop and
  a ding for notifications), a quiet bed under the whole section, and a flurry at its peak.
- Trim short sounds tight (a pop to 70 ms in a dense run) so clips on a track don't overlap. Clips that
  still overlap go on the next track. Keep tracks to roles (pops, paper, alerts, dings, beds,
  whooshes, keys) and list the layout to the user.
- Give each clip an id that says what it is (`flap-3`, `chat-07-reply`): comments the user pastes from
  the timeline name the clip by it.

## 7. Levels

- Each effect peaks between −6 and −14 dBFS, nothing near 0: music or a voice goes on top. Dense runs
  sit lower (−14), the first of a group a little higher (−11). Check the file's measured peak before
  setting gain.
- A clip's volume replaces the library's default for that sound; it doesn't add to it.

## 8. Write, then check

- Back up `sound.json`, then save through the studio (see Tools). Build the clips in a script so a
  second pass can change them in one place.
- Run `motion-director sound-check <film>` and resolve its flags. Then confirm the key hits with
  `--hits <ids>`: each within about 15 ms of the impact.
- Look at the Edit tab's lanes: the studio takes in a saved sheet without a reload, and when a film's
  code changes it reloads the preview and measures its objects again; nothing should have moved. A window
  with unsaved changes of its own keeps them and refuses the newer sheet, so say what you changed.
- Report the beats and their sounds, the track layout, what the check still flags and why, the
  remaining silences, and what to listen for.
