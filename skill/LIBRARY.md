# Organising the sound library

The studio files each sound by plain rules (`kit/sound-library.mjs`): words in its name, then how it measures
(length, attack, brightness, busyness). Those rules are a rough first pass. A pack named "Foley Bag Load
Grain Sack On Wagon 06" lands in Ambience because it is long, and words like "air", "rise" or "transition"
send hundreds of sounds to Whooshes. You do this far better: you read the name and the folder as a person
would, weigh them against the measurements, and say what the sound is and what it is good for. A local
sound-and-text model (CLAP) was tried for this and did worse than you; don't reach for one.

What you decide is stored per sound in the project's `sounds/library.json`, and the studio prefers it to
its own rules: a `family`, `tags`, a one-line `description` and the `uses` it suits. Each sound you have
organised also carries `organised`, the date you did it, so a later pass picks up only what is new. The
library column shows how many are organised.

## When

- When the user asks you to organise, sort, tidy or label their sounds.
- Before a sound pass, when the library has sounds not organised yet: `motion-director organise` says how
  many. Offer to organise them first (a big library takes several batches); don't start unasked.
- After the user adds sounds: the new ones are the ones not organised.

## How

1. List a batch: `motion-director organise` (in a project with its own scripts, the project's equivalent).
   Each line is a sound: its path, length, measured traits, where the studio files it now and why, and any
   tags, uses or description it already has. `--n` sets the batch size (150 by default), `--folder <dir>`
   keeps to one folder, `--json` gives the same as data. The first run on a big new library measures every
   sound once, which takes a while; it is cached after that.
2. Decide each sound from its name, its folder and its measurements together. A pack's folder often says
   more than the file name ("Impacts/Metal 04"). The measurements settle what the name leaves open: a
   "whoosh" under 0.3 s with a sharp attack is more of a swipe or click; a "hit" of six seconds is an impact
   with a long tail.
   - **family**: `whooshes`, `impacts`, `clicks`, `typing`, `paper`, `doors`, `alerts`, `music`,
     `ambience`, or `other` when none fits. Choose by what the sound is, not by a word it contains.
   - **tags**: up to 12 short lower-case words a person would search for: the material and the action
     (metal, glass, wood, cloth; scrape, rattle, tap, swell), the feel (soft, airy, punchy, warm, tense), and
     any obvious use. Not the family again, and not the pack's name.
   - **description**: one plain sentence (up to 280 characters) of what you would hear, such as "A short
     bright jingle of small bells, a quick shake then a fade." Say what it is, then anything that matters
     when placing it (a long tail, a pre-roll before the hit, a loopable bed).
   - **uses**: what it suits in a film, from `ui-click`, `typing`, `notification`, `success`, `appear`,
     `transition`, `impact`, `paper`, `slide`, `reveal`, `music`, `ambience`. Give only the ones you would
     actually reach for. A short own word is allowed when none fits.
3. Write the batch as JSON, `{ "<path>": { "family": …, "tags": […], "description": "…", "uses": […] } }`,
   and apply it: `motion-director organise apply batch.json` (or `-` to read it from standard input). It
   merges your fields into each sound's entry and keeps the sound's own settings (volume, trim, hit point):
   a field you leave out stays as it was, an empty value clears it. Each sound is marked organised today.
   Bad entries (an unknown family, a path not in the library, a setting that isn't one of the four) are
   listed and skipped; fix and reapply them. The studio shows the change at once.
4. Repeat until `motion-director organise` reports nothing to go. Report what you did in a few lines: how
   many, how the families came out, and the sounds you could not judge.

## Judgement

- **Names decide most of it.** When a name says nothing ("SFX_0412", "Untitled 3", a pack name and a
  number), don't guess a description from the measurements alone. Give it the family the measurements
  suggest and no description, leave it out of the batch so it stays unorganised, and list those for the
  user: renaming them, or describing a few in the studio's sound editor, is what helps. Never rename or
  move files yourself: films refer to sounds by their paths.
- **Keep the user's own words.** A description, tags or uses the user wrote (on a sound not yet organised,
  or one they changed since) stay unless they are plainly wrong. Add to them rather than replace them.
- **Don't touch a sound's settings.** Volume, trim, speed, fades and the hit point are the user's tuning;
  `apply` refuses them.
- **Re-organising** is for when the user asks (`--all` lists everything, organised or not), or when the
  families or uses change.
