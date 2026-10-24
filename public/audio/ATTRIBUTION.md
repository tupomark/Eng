# LEXIS original listening sample

`lexis-coast.wav` contains this original text written for LEXIS:

> We linger by the sea. A quiet path leads beneath the trees.

It is **synthetic speech**, generated locally on 23 October 2026 with the installed FFmpeg `flite` filter, voice `slt`, mono PCM WAV at 22,050 Hz. It is not a human dictionary recording, licensed commercial dictionary audio, live TTS integration, pronunciation assessment or proof of accent coverage. No external AI or speech API was used. The original text and rendered audio may be used with this repository's LEXIS sample materials.

Generation command (the text file contains only the original text above):

```sh
ffmpeg -f lavfi -i 'flite=textfile=/tmp/lexis-original-listening.txt:voice=slt' \
  -ar 22050 -ac 1 -c:a pcm_s16le public/audio/lexis-coast.wav
```

Flite attribution, retained from the installed Debian `libflite1` copyright documentation:

Copyright (c) 1999–2001 Language Technologies Institute, Carnegie Mellon University. Authors include Alan W Black, David Huggins-Daines and contributors. All rights reserved.

Permission is hereby granted, free of charge, to use and distribute this software and its documentation without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of this work, and to permit persons to whom this work is furnished to do so, subject to the following conditions:

1. The code must retain the above copyright notice, this list of conditions and the following disclaimer.
2. Any modifications must be clearly marked as such.
3. Original authors' names are not deleted.
4. The authors' names are not used to endorse or promote products derived from this software without specific prior written permission.

CARNEGIE MELLON UNIVERSITY AND THE CONTRIBUTORS TO THIS WORK DISCLAIM ALL WARRANTIES WITH REGARD TO THIS SOFTWARE, INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL CARNEGIE MELLON UNIVERSITY NOR THE CONTRIBUTORS BE LIABLE FOR ANY SPECIAL, INDIRECT OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.

Flite synthesis code also credits Centre for Speech Technology Research, University of Edinburgh, under the same permission conditions. Neither institution endorses LEXIS. Flite/FFmpeg binaries are not distributed here; this repository contains the generated original WAV and provenance only.
