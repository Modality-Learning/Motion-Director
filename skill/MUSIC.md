# Music for a film

A film's soundtrack is made outside Motion Director, by the user in a music generator such as Suno, from a prompt
you write with them. What you add is what a generator can't know: where the film's sections change, so the
music's breaks and its lift land on them. The music then sits on its own lane in the studio, under the sound
effects, and you line it up with the film.

Music is a matter of taste, so this is a conversation, not a deliverable: offer, listen, adjust.

## 1. The direction, with the user

Before writing anything, ask, briefly and in one message:

- **The mood**, in their words, and any music they like for it. Describe what they name in your own words
  (tempo, instruments, energy); never put an artist's or a song's name in a prompt. Generators refuse them, and
  it isn't yours to copy.
- **Vocals or not.** Default to instrumental for product films: words fight the film's own.
- **Energy across the film**: where it should lift, where it should breathe.
- **The ending**: a clean stop on the last beat (button), a fade, or a held final chord (ring).

Then offer two or three directions of one line each ("warm lo-fi house, unhurried", "bright electronic pop, a
proper lift at the build", "light acoustic, plucked guitar and claps"), and let them pick or mix.

## 2. The tempo and sections, from the film

`motion-director music <film>` lists the film's sections (its scenes) and the tempos that put their starts on bar
lines, best first, with how far each section is from its nearest bar line at the best tempo.

- Pick a tempo that suits the direction from the top few. A tempo the music would never have is no use however
  well it fits.
- A section a little off its bar line (under 0.15 s or so) is fine: nobody hears it. Further off, offer the user a
  choice: move that moment of the film onto the bar line (a change to the film, so ask), or let the music's break
  fall slightly apart from it.
- `--keys` uses every key moment instead (rarely all on bars), `--at 0,8.5,16` times you choose.
- It ends with the brief's skeleton at the best tempo: the length to ask for, the offset, and a structure line
  per section with its bars counted so they add up to the film. Start from that rather than counting bars.

Write `films/<film>/music.json` (kit/music.mjs checks it; the studio shows it):

```json
{
  "bpm": 124, "beatsPerBar": 4, "offset": 0.47, "length": 97, "ending": "button",
  "sections": [
    { "name": "Intro", "at": 0.47, "note": "sparse: a pad and a soft pluck" },
    { "name": "Agent makes it", "at": 31.44, "drop": true, "note": "the lift: full energy" }
  ],
  "prompt": { "style": "…", "structure": "…", "notes": "…" }
}
```

- `length` is the film's length in seconds. Always set it: it goes into the prompt, and without it a generator
  makes a whole song (two to four minutes).
- `offset` is the film time of the first downbeat; section times sit on bar lines (offset plus whole bars).
- Mark the one section where the music lifts hardest with `"drop": true`: lining up puts a lift the track has near
  that point onto it.
- The notes say what the music does in each section, for the user and for the next pass.

## 3. The prompt

Write it for the generator the user names; for Suno:

- **style**: one line of comma-separated descriptions, under 200 characters ideally: genre, tempo
  (`124 BPM`), metre, the main instruments, the mood, the mix, and `no vocals` for an instrumental. The
  studio's Copy adds the length (`0:35 long, ending at 0:35`) from `length` when the style doesn't name one.
- **structure**: Suno's section tags, one per line, in order, each with its length in bars and what happens:
  `[Intro: 3 bars, pad and soft pluck]`, then `[Verse]`, `[Pre-Chorus]`, `[Chorus]`, `[Break]`, `[Build]`,
  `[Outro]`, and `[Instrumental]` first and `[End]` last for an instrumental. Bars come from the brief: a
  section's bars are the time to the next section divided by the bar length.
- **notes**: anything the prompt can't hold, and that its timings won't be exact. Generators don't keep to a
  length reliably, so say a longer track is still usable: lining up ends it with the film. Where the generator
  can crop a song before download, cropping near the film's length keeps the file small.

The studio's music lane has a + button beside its name that opens the brief, with the prompt to copy. Say where it is; don't paste the whole prompt
into the chat unless asked.

Before the user puts a generated track in a film for a client or product, mention that the right to use it
commercially depends on their plan with the generator.

## Comments on the brief

The user comments on the brief in the studio: a section (its marker on the music lane, or the comment button
beside it in the brief), the prompt, or the whole brief. The note's `Music:` line names `music.json` and the part,
and `About:` quotes what it says now. Amend the brief, then:

- **A change of direction** ("more of a Vulfpeck feel", "darker", "no drums"): rewrite the style in your own
  words: what makes that sound (the instruments, the drums, the bass, the mix, the feel), never the names. Keep
  the tempo if it suits the new direction; if it doesn't, choose again from `motion-director music <film>`, and
  move the sections onto the new bar lines.
- **A section** ("lift later", "quieter here"): change that section's note, its drop, or its time (onto another
  bar line), then rewrite the structure so the bars still add up to the length.
- Keep `length` the film's. Say in a line what changed and whether the user needs to generate the music again
  (a new direction or structure does; a note about the mix may not), and that the Brief has the new prompt to
  copy. Mark the comment resolved.

## 4. Lining it up

The user adds the generated track to the sound library and drops it on the music lane (or a sound the library
files as Music goes there by itself). Then line it up: select the clip and press **Line up with the brief** in the
inspector, or

```bash
motion-director music fit <film> [clip id] [--dry]
```

It measures the track's tempo, beats and lifts, lines its beats up with the film's, and puts a strong lift near
where the drop falls on the drop section (a lift far from it isn't used: music lifts more than once, and lining up
the wrong one cuts the track; only a track much longer than the film is searched end to end), trims its start rather than starting before the film, speeds it up
or slows it a little, pitch kept, so its tempo is the brief's, and, when the track runs past the film, ends it
with the film and fades it out (a bar for a ring, two for a fade, half a bar for a button). Read what it says back:

- **"seems to run at 95 BPM, not near the brief's 124"**: the generator ignored the tempo. The speed is left
  alone. Offer to generate it again with the tempo higher in the style line, or to change the brief (and the
  film's sections) to suit the track if the user loves it.
- **A large rate change** (beyond about 4%): it will sound slightly different; say so.
- **"ends at 30.0 s, before the film does"**: the track is too short. Offer another generation, or a held
  final section, or let the film close on its effects.

Then play it with the user in the Edit tab. Set the music's volume so the sound effects still read (around −12 to
−18 dB under them is a common start), and give it a fade-out if its ending doesn't land on the film's. The music
lane is collapsed to one thin row by default; it opens with its twirl to show each track.
