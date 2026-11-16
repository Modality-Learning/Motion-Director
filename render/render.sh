#!/bin/bash
# Renders a film to video: an H.264 MP4 to share, or a ProRes MOV master for editing.
# Default: 2560×1440, 25 fps, white background -> out/<film>.mp4 in the project (keep out/ out of git)
#
# usage: motion-director render <film> [out]      e.g. CODEC=prores422hq motion-director render study-time-count
#        (the CLI sets MD_ROOT, the project, and MD_DRIFT, the project's own drift check if it has one)
# env:   BG=white|textured (overrides the film's parameter)  DSF=1.3333333333 (1440p) | 1 (1080p) | 2 (4K)  FPS=25  JOBS=4
#        CODEC=h264 (default, .mp4, BITRATE=35000000) | prores422hq | prores4444 (.mov masters for editing)
#        SOUND=0 renders silent. Otherwise the film's sound cues (sound.json) are mixed (render/audio.swift,
#        AVFoundation) into the video itself. WAV=1 also keeps the mix as <out>.wav beside the video (a stem for
#        an editor); without it the mix is only an intermediate and is cleaned up with the frames.
set -euo pipefail
HERE=$(cd "$(dirname "$0")" && pwd)
PROMO=${MD_ROOT:?MD_ROOT must name the project folder (run this through motion-director render)}
export MD_ROOT
NAME=${1:?usage: render.sh <film> [out.mp4]}
FILM="$PROMO/films/$NAME/index.html"
[ -f "$FILM" ] || { echo "no film at $FILM" >&2; exit 2; }
mkdir -p "$PROMO/out"
export CODEC=${CODEC:-h264}
EXT=$([ "$CODEC" = h264 ] && echo mp4 || echo mov)
OUT=${2:-"$PROMO/out/$NAME.$EXT"}
FPS=${FPS:-25}
JOBS=${JOBS:-4}
# BG, if set, overrides the film's background parameter (film.json); otherwise the film decides
export DSF=${DSF:-1.3333333333} BITRATE=${BITRATE:-35000000}

# a final render is the moment for the project's own checks, such as whether the film's UI still matches the app (reports only)
if [ -n "${MD_DRIFT:-}" ]; then node "$MD_DRIFT" "$NAME" || true; fi

# the encoder and the audio tool use AVFoundation (macOS); each is built once with the Command Line Tools
for TOOL in encode audio; do
  if [ ! -x "$PROMO/out/.bin/$TOOL" ] || [ "$HERE/$TOOL.swift" -nt "$PROMO/out/.bin/$TOOL" ]; then
    mkdir -p "$PROMO/out/.bin"
    DEVELOPER_DIR=/Library/Developer/CommandLineTools swiftc -O "$HERE/$TOOL.swift" -o "$PROMO/out/.bin/$TOOL" 2>/dev/null
  fi
done

FRAMES=$(mktemp -d)
trap 'rm -rf "$FRAMES"' EXIT
# plain writes, not console.log: a coloured terminal (FORCE_COLOR) would wrap numbers in escape codes
DURATION=$(node -e "process.stdout.write(String(JSON.parse(require('fs').readFileSync('$PROMO/films/$NAME/film.json','utf8')).duration))")
TOTAL=$(node -e "process.stdout.write(String(Math.round($DURATION * $FPS)))")
STEP=$(( (TOTAL + JOBS - 1) / JOBS ))
echo "capturing $TOTAL frames (scale $DSF, $FPS fps, $CODEC) in $JOBS processes"
PIDS=()
for ((k = 0; k < JOBS; k++)); do
  A=$((k * STEP)); B=$(( (k + 1) * STEP < TOTAL ? (k + 1) * STEP : TOTAL ))
  node "$HERE/capture.mjs" "$NAME" "$FRAMES" "$FPS" "$A" "$B" &
  PIDS+=($!)
done
for p in "${PIDS[@]}"; do wait "$p"; done # stops here if any capture failed

# sound: mixed from the cues at the moments the film reported while capturing
# the mix: kept beside the video when asked for (WAV=1), else made with the frames and cleaned up with them
STEM=$([ "${WAV:-0}" = 1 ] && echo "${OUT%.*}.wav" || echo "$FRAMES/mix.wav")
HAVE_SOUND=0
if [ "${SOUND:-1}" != 0 ]; then
  set +e; node "$HERE/sound-mix.mjs" "$NAME" "$FRAMES/moments.json" "$STEM" "$DURATION"; MIXED=$?; set -e
  [ $MIXED -eq 0 ] && HAVE_SOUND=1
  [ $MIXED -ne 0 ] && [ $MIXED -ne 10 ] && exit $MIXED
fi

if [ $HAVE_SOUND = 1 ]; then
  "$PROMO/out/.bin/encode" "$FRAMES" "$FRAMES/picture.$EXT" "$FPS"
  # the picture is copied as encoded; the sound is AAC in a share MP4, uncompressed in a ProRes master
  "$PROMO/out/.bin/audio" mux "$FRAMES/picture.$EXT" "$STEM" "$OUT" "$([ "$CODEC" = h264 ] && echo aac || echo pcm)"
  if [ "${WAV:-0}" = 1 ]; then echo "stem: $STEM"; fi
else
  "$PROMO/out/.bin/encode" "$FRAMES" "$OUT" "$FPS"
fi
