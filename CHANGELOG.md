# Changelog

Each release of Motion Director. The studio's update notice and `motion-director update` show the entries a
project hasn't got yet, so write them for the person using it: what they can now do, and anything they need to
do. Add to Unreleased as you go; `node scripts/release.mjs <version>` turns it into the release.

## Unreleased

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
