# Changelog

Each release of Motion Director. The studio's update notice and `motion-director update` show the entries a
project hasn't got yet, so write them for the person using it: what they can now do, and anything they need to
do. Add to Unreleased as you go; `node scripts/release.mjs <version>` turns it into the release.

## Unreleased

## 0.3.0 (2026-11-17)

- **A music lane.** The soundtrack has its own lane above the effects: one thin row by default, with the music
  brief's sections marked, opening to a row per music track with the bar lines. Sounds the library files as
  Music go there.
- **Music briefs, written with Claude.** Claude agrees a direction with you, finds a tempo that puts the film's
  section changes on bar lines (`motion-director music <film>`), and writes the brief: the sections and a prompt
  for Suno or another music generator, ready to copy from the lane's Brief button.
- **Line up the music.** Drop the generated track on the lane and press Line up (or `motion-director music fit
  <film>`): its biggest lift lands on the brief's drop, and its speed is corrected so it keeps the brief's time.
  A track that ignored the tempo is left as it is, and you're told.
- **Music the right length.** The brief's length (the film's) now goes into the prompt you copy ("0:35 long,
  ending at 0:35", and an [End] tag), and `motion-director music` prints a structure whose bars add up to the
  film. Generators still overshoot, so lining up now ends a longer track with the film, faded out to suit the
  ending, and says when a track is too short.

## 0.2.0 (2026-11-17)

- **Codex and other agents.** `npx motion-director codex` links the skill into the repository's `.agents/skills/`
  and prints the command that adds Motion Director's MCP server, which lets the agent read the studio's comments
  and mark them done. The studio names the agent reading them.
- **See what the agent is doing.** A status with a spinner beside the link icon: the agent says what it's working
  on in a few words (`motion-director status "…"`) while it changes the film.
- **Clearer errors in sandboxes.** When an agent's sandbox stops the browser or a local port, the storyboard,
  render and studio commands say so, and what to allow, instead of a bare "browser closed".
- **Staying up to date.** `motion-director --version` says what you have and whether a newer release is out;
  `motion-director update` installs it. The studio shows when an update is out and can send the update request
  to your agent.

## 0.1.0 (2026-11-17)

The first release to share.

- The skill installs as a Claude Code plugin: `/plugin install motion-director --marketplace Modality-Learning/Motion-Director`.
- `motion-director init` adds 14 starter sounds and `NOTES.md` for the project's brand and references.
- Renders are about twice as fast, and say up front when this machine can't make video (it needs macOS).
- The web export (a prototype): a film as files a site owns, with a React component.
- Sound search (experimental), once `@huggingface/transformers` is installed.
