# Motion Director

Make motion-graphics films in code, together with Claude. A film is a web page that draws one frame
for any moment in time. Motion Director gives it three things around that:

- **The studio**, a local app where you review a film, comment on exactly the thing you mean, see how
  every element moves (measured, so it can be timed to sound), place sound effects by hand and tune the
  film's parameters. A comment you write there goes straight to the Claude Code session that started the
  studio as a structured note, so the agent knows the file, the element and the moment without guessing, and the
  change shows in the studio when it is made.
- **The renderer**, which captures frames in headless Chromium and encodes them to MP4 or ProRes, with
  the film's sound mixed in.
- **The kit**, a small set of files every film shares: the player, the motion helpers (eases, a spring,
  impact bumps), the stage and a brand file.

Why it exists: an agent can build good motion graphics in code, but it cannot hear, and feedback in
chat ("the flap feels late") carries no context. The studio closes both gaps. The agent places sound on
measured impacts, and you point at things instead of describing them.

It's early: version 0.1, used for real films, and changing quickly. Issues and ideas are welcome on GitHub.

## Trying it out

You need Claude Code, Node 22 or newer, and a Mac to render video (see [Requirements](#requirements)).

**1. Give Claude the skill**, once, in Claude Code:

```
/plugin install motion-director --marketplace Modality-Learning/Motion-Director
```

On a Claude Code older than 2.1.275, add the marketplace first:
`/plugin marketplace add Modality-Learning/Motion-Director`, then
`/plugin install motion-director@motion-director`. Updates come through `/plugin` (Installed, then Update).

**2. Ask for a film**, in the repository it's about:

> Make a 20-second film that shows off our new onboarding flow.

With no project there yet, Claude offers to set one up (step 3) and asks where the films should live. Then
it agrees the direction with you and writes a treatment before any animation, shows you a storyboard, and
builds the film. Review it in the studio: click anything in the film and comment, and the note goes to Claude
with the element and the moment attached.

**3. Or set up a project yourself**, in the folder that will hold the films (a folder of its own, such as
`promo/`, keeps the tool's packages out of your app's):

```bash
npm install -D github:Modality-Learning/Motion-Director
npx motion-director init                   # the folders, a starter film, 14 starter sounds and NOTES.md
npx playwright install chromium            # once, for stills and renders
npx motion-director studio                 # http://127.0.0.1:4321/studio/
```

`NOTES.md` is for what's particular to your project: the brand, reference films, where the product's UI lives,
house rules. Claude reads it before starting. The starter sounds are Motion Director's own (generated, no
licences), so they're tracked in git; your own sounds stay out of it.

### With Codex, or another agent

The tool works the same under any coding agent; the skill and the comments need a little setup outside Claude
Code. In the project folder, after `init`:

```bash
npx motion-director codex
```

It links the skill into the repository's `.agents/skills/` (where Codex and other agents look for skills; commit
the link) and prints the one command that adds Motion Director's MCP server to Codex, with this machine's paths.
The MCP server gives the agent the studio's comments (`read_comments`, `resolve_comments`): comment in the
studio, then tell the agent "check the studio comments". Only Claude Code gets comments pushed into the session as
you make them; elsewhere the agent reads them when asked, and the studio names the agent that does.

Two things differ in Codex, both from its sandbox, which stops commands opening a local port or starting a
browser:

- Start the studio in your own terminal (`npx motion-director studio`), not through Codex.
- Storyboards, stills and renders need the same: approve them when Codex asks to run them outside the sandbox.
  If one is blocked, the command says so, and the skill tells the agent to pass that on rather than draw a
  stand-in.

To let Codex use the comment tools without asking each time, add `default_tools_approval_mode = "approve"`
under `[mcp_servers.motion-director]` in `~/.codex/config.toml`. A trial run in Codex (the starter film, three
comments, a storyboard request) made every change correctly and resolved every comment; it read them through
the MCP tools once those were allowed, and, once the sandbox message existed, reported the blocked storyboard
instead of improvising one.

## Requirements

- Node 22 or newer.
- Playwright's Chromium: `npx playwright install chromium`, once.
- **To render video: macOS** with Apple's Command Line Tools (`xcode-select --install`). The encoder and the
  sound mixer are small Swift programs, built on first use, that use AVFoundation. Without them, the studio
  disables its Render button and says what's missing, and `motion-director render` stops with the same
  message. Everything else works on any system: previewing, the storyboard, comments, sound placement and
  the web export.

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

`motion-director sound-search "soft paper rustle"` finds library sounds by what they sound like, for
sounds nobody has described yet. It is an experiment. It runs CLAP, a model that places a sound and a
sentence about it close together, on your machine. The first run downloads the model (about 160 MB) into
`~/.cache/motion-director`, or the folder named by `MD_MODELS`. Your sounds are never sent anywhere. It
needs `@huggingface/transformers`, which isn't installed with Motion Director (it's large, and only this
experiment uses it): `npm install @huggingface/transformers` in the project turns it on. It also needs macOS's
`afconvert`. Nothing else in the package loads it. Treat the result as a shortlist: the model hears what a sound is, not its length or hit
point, and a description you wrote yourself is still the better guide.

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
- **Export** (films). **Video**: the drift check, renders (a share MP4, or ProRes 422 HQ or 4444 masters;
  1080p, 1440p or 4K) with progress and cancel, and the film's files with Show in Finder and Open.
  **Scroll** (a prototype): the film as a web page plays it, live and without an iframe, moved by scrolling
  or by buttons, with the snippets to put it on a site and an export (see the command `web`).

**Comments.** A comment is a message to the agent. In comment mode, click the thing you mean (a frame,
an element, a clip, a beat, a pin, the timeline at a time), type, and press **Enter**: the note goes, with any
queued ones, to the Claude Code session that started the studio (its messaging socket, which the studio inherits;
nothing to set up). **⌘Enter** queues it instead. The note says the film, what it is about with its current value,
a selector or cue id, and your comment. A studio started any other way copies the note to paste into the chat.
The chevron beside the Comment button opens the comments list: queued (Send all, or take one out), with Claude,
and resolved. The agent marks each one done (`motion-director comments resolve <id>`), and the list follows live.
The link icon beside it shows whether comments reach Claude: click it to check again, or, once it has failed a
few times, to copy a repair request for Claude. Starting the studio from a Claude session takes over one already
running for the same project on that port, so a new session heals the link by starting it again.
Every comment and its status is kept in `out/comments/<film>.jsonl`. The note format is in
[skill/SKILL.md](skill/SKILL.md).

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
| `motion-director render <film> [out]` | Renders to `out/<film>.mp4` (white, 2560 × 1440, 25 fps) with the film's sound. Env: `CODEC=h264\|prores422hq\|prores4444`, `DSF=1\|1.3333333333\|2`, `FPS`, `BITRATE`, `BG=white\|textured`, `SOUND=0` for silent, `WAV=1` to keep the mix as a WAV beside it, `JOBS` (capture processes, default 4: on a 12-core M2 Max, 6 and 8 were slower). Frames are interleaved across the processes and encoded while they're captured; a 96-second film at 1440p takes about 80 s. |
| `motion-director board <film>` | Saves the storyboard as one image, `out/<film>-board.png`. |
| `motion-director bundle <film>` | Saves the film as one self-contained HTML file in `out/`, to share. |
| `motion-director web <film> [--out <folder>]` | A prototype. Writes the film into a site as files the site owns, with no package to install: the player `motion-film.js` (shared by every film in the folder, updated when a film needs a newer one), `<film>.film.js`, their types and, in a React project, `MotionFilm.tsx` (written once, then yours). The film plays live in a `<motion-film>` element (no iframe, no video), follows scrolling (`mode="scroll"`) or moves with `goTo('<key>')` from anything on the page. Silent for now. Without `--out` it writes to `out/` with an example page. See `example/site/` for a small React site that uses it. |
| `motion-director purity <film> [step]` | Checks `render(t)` is a pure function of time: opens the film fresh at each second and compares it with the film played to that moment. |
| `motion-director sound-check <film> [moments.json] [--hits id,id]` | Reports how often each sound is heard and at how many pitches, overlapping clips, and the mix's peak, loudest moments and quiet stretches. `--hits` says where each clip peaks against where it should land. |
| `motion-director sound-search "<words>" [--like <sound>] [--n 8] [--json]` | Experimental. Ranks the library's sounds by how well they match a description, or by how much they sound like one of them. Several descriptions can be given at once. |
| `motion-director init [folder]` | Makes a new project with a starter film. |
| `motion-director skill` | Prints where the skill is (Claude Code installs it as a plugin). |
| `motion-director codex` | Sets up Codex: links the skill into `.agents/skills/` and prints the command that adds the MCP server. |
| `motion-director mcp` | The MCP server agents use for studio comments (`project`, `read_comments`, `resolve_comments`). The agent starts it. |

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

A project installs it from GitHub (`npm install -D github:Modality-Learning/Motion-Director`, or
`#v0.1.0` on the end for a fixed version) or, while working on Motion Director itself, from a path
(`"motion-director": "file:../motion-director"`). Either way `npm install` runs `prepare`, which builds the
studio app into `dist/app`, so the studio works straight after installing. A project
that wants the commands as scripts adds, for example:

```json
{ "scripts": { "studio": "motion-director studio", "render": "motion-director render" } }
```

The project does not need to be an npm workspace of anything. Keep it on its own install, so Playwright
and the studio's dependencies stay out of other apps.

## The skill

`skill/` is the guidance Claude follows to make films with a person, in this order of work: direction,
a written treatment, keyframes and a storyboard, transitions, sound, final render. It is generic.

- [SKILL.md](skill/SKILL.md): the method, how to read and resolve comments from the studio, parameters and
  compositions.
- [SOUND.md](skill/SOUND.md): placing sound effects on measured impacts, and checking the mix without
  ears.
- [MOTION.md](skill/MOTION.md): the motion principles. Brand-neutral, and a project may add its own.

Claude Code installs it as a plugin: this repository is a plugin marketplace
([.claude-plugin/marketplace.json](.claude-plugin/marketplace.json)) whose plugin is the `skill/` folder
([skill/.claude-plugin/plugin.json](skill/.claude-plugin/plugin.json)); see [Trying it out](#trying-it-out).
`claude plugin validate .` checks both. To keep it in the repository instead, `motion-director skill` prints
the folder: link it into `.claude/skills/motion-director`, or write a thin skill of your own that points to it
and adds what's yours.
