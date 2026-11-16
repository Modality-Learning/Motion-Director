# Working on Motion Director

This repo is the tool, not a set of films. Films live in the projects that use it. Read
[the README](README.md) first.

- **Layout.** `bin/` is the CLI. `server/` is the studio's server and the project lookup
  (`project.mjs`). `render/` holds the frame capture, encoder, storyboard, purity and sound-check scripts.
  `kit/` is what films load. `app/` is the studio UI. `templates/film` is the starter film, `example/` a
  project to develop against, `skill/` the Claude guidance.
- **Everything works on a project.** Scripts take it from `MD_ROOT`, which the CLI sets. Never assume the
  working directory, and never hard-code a project's name, brand, paths or product into the package. What
  is one project's own goes in that project's `kit/` or config.
- **The kit is shared.** Films from every project load `kit/`. A new ease, spring setting or stage
  style goes there and in `skill/MOTION.md`, not into one film. Keep `brand.css` neutral, and keep the
  variable names films use.
- **`app/` is being ported** to React, Tailwind 4 and shadcn/ui. Use the shared components, and check the
  hierarchy, theming and accessibility of what you change. Look at the running app, not only the tests.
- **Serve over HTTP.** Films, the studio and the render scripts use the local server in `server/static.mjs`
  (`/films`, `/comps`, `/kit`, `/out`). Don't add a way to open films from `file://`.
- **Security stays local.** The studio listens on 127.0.0.1, accepts actions only from its own page, runs
  scripts with fixed options, and opens files only in the project's `out/`. Keep every path inside its
  folder, and keep user text out of shell strings.
- **Tests.** `npm test` runs everything: `npm run test:node` (kit, render, server, project) and
  `npm run test:app` (the studio, in Vitest). Add a test with a change. `npm run typecheck` before
  finishing. Tests must not need Chromium or a sound library on the machine unless they say so.
- **Develop with `npm run dev`** (the example project, hot reloading) or `npm run dev:project -- <path>`.
  Don't use `npm run build` to check work; it is for releases and `prepare`.
- **The skill is part of the product.** When behaviour a film-maker depends on changes (the note format,
  a command, a studio tab, a parameter rule), update `skill/` and the README in the same change. Keep the
  skill free of any one project's brand or paths.
- **Commits.** Don't commit or push unless asked. Never commit renders, stills or `out/`.
- Style for docs: short plain sentences, British spelling, no em dashes, say why.
