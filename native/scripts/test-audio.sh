#!/bin/sh
# Generate only synthetic tones; never open the user's media or sessions.
set -eu
cd "$(dirname "$0")/.."
command -v go >/dev/null
command -v lame >/dev/null
command -v afconvert >/dev/null
fixture_dir=$(mktemp -d "${TMPDIR:-/tmp}/hwmusic-audio.XXXXXX")
trap 'rm -rf "$fixture_dir"' EXIT HUP INT TERM
python3 - "$fixture_dir/tone.wav" <<'PY'
import math
import struct
import sys
import wave

with wave.open(sys.argv[1], 'wb') as output:
    output.setparams((2, 2, 44100, 0, 'NONE', 'not compressed'))
    output.writeframes(b''.join(
        struct.pack('<hh', sample, sample)
        for frame in range(4 * 44100)
        for sample in [int(3000 * math.sin(2 * math.pi * 440 * frame / 44100))]
    ))
PY
afconvert -f flac -d flac "$fixture_dir/tone.wav" "$fixture_dir/tone.flac"
lame --silent "$fixture_dir/tone.wav" "$fixture_dir/tone.mp3"
HWMUSIC_AUDIO_FIXTURES="$fixture_dir" go test ./internal/audio -count=1 -v -timeout 40s
HWMUSIC_AUDIO_FIXTURES="$fixture_dir" go test -tags portableaudio ./internal/audio -count=1 -v -timeout 60s
