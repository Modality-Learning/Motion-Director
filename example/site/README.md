# An example site

A small React landing page that plays the `tour` film from files exported into it, the way a real site would:
no iframe, no video, no package to install. The hero film is moved by buttons; the "How it works" section is
tied to scrolling.

From the repository root, export the film into the site, then start it:

```bash
node bin/motion-director.mjs web tour --root example --out example/site/src/films
```

```bash
node node_modules/vite/bin/vite.js --config example/site/vite.config.ts
```

It opens on http://localhost:4340. The site has no packages of its own; it runs on the repository's React and Vite.

The export writes into `src/films/`:

| File | What it is |
|---|---|
| `motion-film.js`, `motion-film.d.ts` | The player, shared by every film in the folder. Written again when a newer one is needed |
| `tour.film.js`, `tour.film.d.ts` | The film. Export again after changing it |
| `MotionFilm.tsx` | The React component. Written once, because the site has React; then it's yours to change |

A real site commits `src/films/`. This example leaves it out of git (see `.gitignore`) so it always shows the
current film.
