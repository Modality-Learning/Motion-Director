# Motion principles

How Motion Director films look and move. The numbers behind these principles live in the kit:
`kit/motion.js` (`Motion.T`, the eases and the spring) and `kit/stage.css` with the project's
`kit/brand.css`. Change them there, never per film. A project may add its own principles on top
(its house look, its ending, its product rules); where it does, its notes say which films show them
best. The principles below are the general ones.

## 1. Say one thing at a time

- A title is one idea in one short sentence, with a full stop: "Life is full.",
  "Meet the team." Aim for seven words or fewer, and use two lines only for a centred statement.
- Titles carry the story, so the film works muted. Each holds for 3.2–5.6 s, long enough
  to read twice.
- Use the `.title` styles in the kit: display weight, 58 px. A centred statement (`.title.mid`,
  76 px) owns the frame, and everything else arranges itself around it.
- No captions, labels or lower thirds unless the moment cannot be read without them. Cut a caption when
  the title already says it.

## 2. Nothing appears from nowhere

Every element has somewhere it comes from and somewhere it goes.

- **Entering:** from behind a surface (a title peeks up from behind a panel or app),
  out of the thing that caused it (cards spawn from the heading), or made by an action
  (a cursor types it, a click opens it).
- **Leaving:** into a container (cards fly into a basket, the basket folds
  into its slot), behind a surface (a title sinks behind the app), or covered by the camera
  (a panel zooms over its title).
- Fade only for depth: a background, a dimmed layer behind a dialog, or the brief settle of
  something already in place.
- Titles that belong to a surface sit behind it in z-order and move with it. When the camera
  pushes in, they follow, so the gap between title and surface stays constant. In a vertical
  film they rest centred in the space above the surface, not tucked against its edge.
- A logo arrives the way the product itself does. If the product has a loader or a mark that moves,
  use that (the project keeps a copy in its `kit/`, kept in step with the product), and let it land as
  the mark before it moves into the lockup and uncovers the wordmark.

## 3. Show the real product

- Rebuild screens from the real components, at their native size and with real copy from the
  product. List those source files in the film's `film.json` (`ui.sources`). Never show a feature the
  product does not have.
- The UI behaves as it does in the app. Buttons press, panels open and close, text is typed,
  lists scroll, a counter counts, and progress fills.
- When those components change substantially, the project's drift check (`checks.drift` in its
  config) says so. Update the screens, then mark the film as synced. A project with no real product
  UI to copy has no check, and this section applies to whatever it does show.

## 4. Every action has an effect

- A click shows a press and a ripple, and something answers it.
- Something that lands bumps (`Motion.impact`). A container that receives things responds:
  a fill, a count, a check.
- Effects follow their causes closely, usually within 0.1–0.3 s, so the viewer links them.

## 5. Use the principles of animation

- **Anticipation:** a small wind-up before a big move (a dip, a lean or a hinge back) lasting
  `T.anticipation` (0.12–0.2 s).
- **Overshoot and settle:** arrivals use the house spring (`Motion.spring`). It overshoots
  about 15% and settles in about 0.8 s. Don't invent new spring settings.
- **Overlap:** related things stagger by 0.03–0.06 s instead of moving as one block. Parts
  arrive after the whole (follow-through).
- **Easing:** `E.io` between two rests, `E.out` for arrivals, `E.in` for departures, and
  `E.back` for a small settle. Linear motion is only for things that never stop, like drift
  or a running clock.
- **Arcs:** things that fly travel on curves, not straight lines.
- **Timing:** titles arrive a little slower (`T.titleIn`, 0.45 s) than they leave
  (`T.titleOut`, 0.35 s).

## 6. The camera directs attention

- Move the camera only to guide the eye: push in to read, pull out to reveal context.
  Make one camera move at a time.
- Hold still after a big moment for 0.3–0.5 s before the next thing starts.

## 7. Pace

- About five seconds per beat, so a 35-second film has six or seven beats.
- Show the hook in the first two seconds and the product by a third of the way through.
- End on the agreed ending with nothing moving underneath: a logo with its closing line and address,
  a call to action, or nothing. Agree it in the treatment; don't assume one.

## 8. House look

- White background by default. A textured background is an option, not the norm.
- Use the palette and fonts from `kit/brand.css` (through `kit/stage.css`) throughout, and no colours of
  your own. A project's brand lives in its own `kit/brand.css`.
- The stage is 1920 × 1080 units. Renders default to 2560 × 1440 at 25 fps.
- A vertical film for phones uses a 1080 × 1920 stage (`--stage-w` / `--stage-h` on `#stage`),
  renders at 1440 × 2560 and sets titles larger (76 px) across several short lines. Keep the
  product's real layout and reframe it with camera shots, one part of the screen at a time,
  rather than rearranging the UI into a layout the app doesn't have.

## 9. Built to be re-rendered

- `render(t)` is a pure function of time. Every frame must be exactly reproducible, so
  scrubbing, stills and renders all agree. Set everything you ever change on every frame, not only while
  the film passes it: an element hidden only during one beat stays visible on a page opened after that
  beat. `motion-director purity <film>` finds these (renders draw through from the start, so they match
  the studio either way).
- No `Math.random()` at render time (generate once at load), no CSS transitions or
  animations on the stage, and no reading the clock.
- No `backdrop-filter` on anything the camera scales: Chromium tiles and mirrors it mid-move. Even
  when still, its blur isn't exactly repeatable between renders, so don't use it for frame comparisons.
- Name a beat's timing once (`const BEAT = { fold1: [27.4, 27.8] }`) and use the name in `render(t)`
  and in its sound moment (`Motion.moment('fold-1', { t: BEAT.fold1[0], ... })`), so sound and motion
  can't drift apart. Keep moment ids stable: cues refer to them.
- Settings a person might change without touching motion are parameters (`film.json` / `comp.json`),
  and pieces several films share are compositions (`comps/`). See the README.
- Rendered videos, stills and storyboards go to the project's `out/`, which is not tracked in git.
  Only the films' source and the kit are tracked.
