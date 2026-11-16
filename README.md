# Motion Director

Make motion-graphics films in code, together with Claude. A film is a web page that draws one frame
for any moment in time. Motion Director gives it three things around that:

- **The studio**, a local app where you review a film, comment on exactly the thing you mean, see how
  every element moves (measured, so it can be timed to sound), place sound effects by hand and tune the
  film's parameters. A comment you write there becomes a structured note you paste into the chat, so the
  agent knows the file, the element and the moment without guessing.
- **The renderer**, which captures frames in headless Chromium and encodes them to MP4 or ProRes, with
  the film's sound mixed in.
- **The kit**, a small set of files every film shares: the player, the motion helpers (eases, a spring,
  impact bumps), the stage and a brand file.

Why it exists: an agent can build good motion graphics in code, but it cannot hear, and feedback in
chat ("the flap feels late") carries no context. The studio closes both gaps. The agent places sound on
measured impacts, and you point at things instead of describing them.

It is not published yet. It is made for use inside a project that holds your films, and it is meant to
be open sourced later.

## Requirements

- Node 22 or newer.
- macOS, for the video encoder and the audio tool. Both are Swift programs built on first use with the
  Xcode Command Line Tools (`xcode-select --install`) and use AVFoundation. Previewing in the studio
  and capturing frames work anywhere Chromium does.
- Playwright's Chromium: `npx playwright install chromium`, once.

## Quick start

From the folder where you want the project:

```bash
npm install /path/to/motion-director       # or the git tag, once there is one
npx motion-director init                   # a new project here
npx motion-director studio                 # http://127.0.0.1:4321/studio/
```

`init` makes the folders below and a `films/_template` starter. Copy it to `films/<name>`, then open the
studio and pick the film. To make one with Claude, link the skill into the project's skills (see
[The skill](#the-skill)) and describe the film you want. The skill starts with direction and a written
treatment before any animation.

## A project

A project is a folder with a `motion-director.config.mjs` at its top. Motion Director finds it from
`--root`, else `MD_ROOT`, else the nearest folder above the working directory that has one.

```
my-films/
  motion-director.config.mjs
  films/<name>/        index.html, film.json, sound.json (once it has sound), BRIEF.md (the treatment)
  comps/<name>/        a composition shared between films: <name>.js, a preview page, comp.json
  sounds/              your sound library (audio stays out of git); library.json holds settings
  kit/                 optional: your own files, which win over the package's (brand.css, below)
  out/                 renders, stills, storyboards, comment logs. Keep it out of git
```

The config:

```js
export default {
  name: 'My brand',                           // shown in the studio's top bar
  checks: { drift: 'scripts/ui-drift.mjs' },  // optional, see below
};
```

`checks.drift` is optional. It names your own script that answers "does the product UI this film copied
still match the product?". The studio's Export tab and every final render run it, and report only. It is
called as `node <script> <film>`, and the film's `film.json` says what it copied (`ui.sources`) and when
it was last synced (`ui.syncedAt`). Without it, the studio simply has no drift check.

### Films

`films/<name>/index.html` loads the kit by relative path (`../../kit/...`) and draws the whole frame in
`render(t)`. `film.json` holds the title, duration, `ui.sources`, the parameters and the compositions it
uses. `KEYS` in the page lists the key moments, which is what the storyboard shows. Open the film with
`?board` for the storyboard, or `?still` for a single frame. The motion API is at the top of
`kit/motion.js`. For how a film should look and move, read [skill/MOTION.md](skill/MOTION.md).

Films are served by the studio and by the render scripts at `/films`, `/comps`, `/kit` and `/out`, so
they open over HTTP, not from `file://`.

### Parameters

Settings someone might change without touching the motion (a title's words, a background, a pattern)
are parameters, declared in `film.json` or `comp.json`:

```json
{ "params": { "background": { "label": "Background", "type": "choice", "options": ["white", "textured"], "value": "white" } } }
```

The value is the single source. The studio edits it, and the renderer, the storyboard and the previews
pass every value to the page in its URL (a composition's as `<comp>.<name>`). Pages read it with
`Motion.param(name, fallback)` on every frame, so a studio edit shows live. Types are `choice`, `number`
and `text`. Text may contain line breaks: insert it with `textContent`, never as markup.

A film says when a parameter matters, so the studio can show it while its element is on screen:

```js
Motion.scope('param:title-1', { ranges: [[0.4, 3.6]], host: titleEl });        // a film's own parameter
Motion.place('logo-reveal', { start: 30.85, end: 35, host: logo.elements });   // a placed composition
```

A parameter with no scope applies to the whole piece.

### Compositions

A composition is a piece shared between films, like an After Effects precomp. It has its own local
timeline and parameters. A film calls it with its own time (`logo.render(t - 30.9)`) and lists it in
`film.json` under `"comps"`. Change the composition once and every film that uses it follows.

### Sound

Sound effects and music come from your own sound library: `sounds/` in the project by default (the
`.gitignore` that `init` writes keeps audio out of git and tracks `library.json`), or any folder named by
`PROMO_SOUNDS`. Any format AVFoundation decodes works (WAV, AIFF, MP3, M4A, CAF, FLAC, Opus in `.m4a`).
Films refer to sounds by their path inside the folder, so keep names stable once a film uses them.

A film's clips are saved in `films/<film>/sound.json`. `library.json` holds each sound's defaults (trim,
volume, speed, fades, hit point, family, tags, a description and what it is good for), which every clip
starts from. The sound design method is in [skill/SOUND.md](skill/SOUND.md).

### Brand and kit overrides

The kit is looked up in the project's own `kit/` first and the package's second, file by file. The
package ships a neutral `kit/brand.css`, which `kit/stage.css` imports. Replace it by putting your own
`kit/brand.css` in the project, with the same variable names (`--ink`, `--teal`, `--card`,
`--font-display`, and so on). Every film and composition then takes its palette and fonts from it. Any
other kit file can be overridden the same way, or added alongside. The project's own kit files are
served at `/kit/...` next to the package's.

Use this for what is yours alone (your palette, a logo loader, a font). A change to how every film
moves belongs in the package.

## The studio

`motion-director studio` serves http://127.0.0.1:4321/studio/ (`--port` or `MD_PORT` to change it). It
listens only on 127.0.0.1, accepts actions only from its own page, runs the render scripts with fixed
options and opens files only in `out/`. Its home has tiles for the films and the shared compositions.
Opening one gives these tabs:

- **Storyboard.** Every key moment, with comment mode (C, or the Comment button), and the parameters
  beside the frame you click.
- **Edit.** The preview over a timeline, the sound library on the left (films) and an inspector on the
  right. Click an element to select it: a box marks it, its motion graph opens on the timeline, and the
  inspector shows its parameters and sounds. The timeline is the transport (play with Space, ruler to
  scrub), with the storyboard's beats, the sound objects and your tracks. Sound is edited by hand here:
  drag clips, trim, stretch, volume, fades, pitch, with undo and redo. `?` lists the keys.
- **Export** (films). The drift check, renders (a share MP4, or ProRes 422 HQ or 4444 masters; 1080p,
  1440p or 4K) with progress and cancel, and the film's files with Show in Finder and Open.

**Comments.** A comment is a message to the agent. In comment mode, click the thing you mean (a frame,
an element, a clip, a beat, the timeline at a time), type, and press Enter. A short note is copied for you
to paste into the chat: the film, what it is about with its current value, a selector or cue id, and your
comment. Nothing stays on the film. A plain log of notes is kept in `out/comments/<film>.jsonl` in case
one never got pasted. The note format is in [skill/SKILL.md](skill/SKILL.md).

**Measured motion.** The studio measures how each element moves, grows, turns and shows, and marks its
arrivals, fastest moments, landings and exits. These are the impacts a sound is timed to. It measures
each sound in the library too (hit point, length, character) and sorts it into a family by name and by
how it sounds.

**Live updates.** The studio follows files changed outside it (by an agent, an editor or another
window) without a reload. Sounds and library settings update in place, new sound files appear, and a
change to a film's or composition's code reloads its preview at the playhead.

## The command line

Every command works on a project (see above for how it is found).

| Command | What it does |
|---|---|
| `motion-director studio [--port n]` | Opens the studio. `MD_DEV=1` serves the app with hot reloading, for working on Motion Director itself. |
| `motion-director render <film> [out]` | Renders to `out/<film>.mp4` (white, 2560 × 1440, 25 fps) with the film's sound. Env: `CODEC=h264\|prores422hq\|prores4444`, `DSF=1\|1.3333333333\|2`, `FPS`, `BITRATE`, `BG=white\|textured`, `SOUND=0` for silent, `WAV=1` to keep the mix as a WAV beside it. |
| `motion-director board <film>` | Saves the storyboard as one image, `out/<film>-board.png`. |
| `motion-director bundle <film>` | Saves the film as one self-contained HTML file in `out/`, to share. |
| `motion-director purity <film> [step]` | Checks `render(t)` is a pure function of time: opens the film fresh at each second and compares it with the film played to that moment. |
| `motion-director sound-check <film> [moments.json] [--hits id,id]` | Reports how often each sound is heard and at how many pitches, overlapping clips, and the mix's peak, loudest moments and quiet stretches. `--hits` says where each clip peaks against where it should land. |
| `motion-director init [folder]` | Makes a new project with a starter film. |
| `motion-director skill` | Prints where the Claude skill is. |

`--root <project>` goes before or after any command. For one frame, or a short run of frames, call the
capture script directly with the project in `MD_ROOT`:
`MD_ROOT=<project> node <package>/render/capture.mjs <film> <outDir> 25 300 301` (frames 300 to 301 at
25 fps, so the frame at 12 s).

## Developing Motion Director

The studio's UI is React, Tailwind 4 and shadcn/ui, built with Vite, in `app/`. The server, kit and
render scripts are plain Node and browser JavaScript, in `server/`, `kit/` and `render/`.

```bash
npm install
npm run dev                       # the studio on example/, with hot reloading
npm run dev:project -- <path>     # the same against any project
npm test                          # all tests
npm run test:node                 # kit, render, server and project tests (node --test)
npm run test:app                  # the studio app (Vitest, Testing Library)
npm run typecheck
npm run build                     # type check, then build the app into dist/app
```

`example/` is a small project for development. Built output goes to `dist/app`, which is not tracked.

## Installing it in a project

Today a consumer installs it from a path, for example `"motion-director": "file:../../motion-director"`
in the project's `package.json`. Later it will be a git tag. Either way `npm install` runs `prepare`,
which builds the studio app into `dist/app`, so the studio works straight after installing. A project
that wants the commands as scripts adds, for example:

```json
{ "scripts": { "studio": "motion-director studio", "render": "motion-director render" } }
```

The project does not need to be an npm workspace of anything. Keep it on its own install, so Playwright
and the studio's dependencies stay out of other apps.

## The skill

`skill/` is the guidance Claude follows to make films with a person, in this order of work: direction,
a written treatment, keyframes and a storyboard, transitions, sound, final render. It is generic.

- [SKILL.md](skill/SKILL.md): the method, how to read notes pasted from the studio, parameters and
  compositions.
- [SOUND.md](skill/SOUND.md): placing sound effects on measured impacts, and checking the mix without
  ears.
- [MOTION.md](skill/MOTION.md): the motion principles. Brand-neutral, and a project may add its own.

`motion-director skill` prints the folder. Link it into the project's skills (for Claude Code,
`.claude/skills/motion-director` or the project's shared skills folder), or write a thin skill of your
own that points here and adds what is yours: the reference films, brand and kit files, where the sound
library lives.
