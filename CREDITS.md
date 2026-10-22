# Credits

Everything not listed here (plate art, icons, wordmark, favicon, tray illustration) is original to Vivi Fashion Dresses.

## Fonts

| Asset | Source | Licence |
| --- | --- | --- |
| Quicksand (variable, Latin subset), `public/fonts/quicksand-latin-var.woff2` | The Quicksand Project Authors, via Google Fonts | SIL Open Font License 1.1 (`public/fonts/OFL.txt`) |

## Sounds

Every sound in the game is synthesized at run time in Web Audio (`src/audio/synth.ts`), written for this project. No audio files ship, so there is nothing to license.

| Sound | How it is made |
| --- | --- |
| Crayon scratch | Pink noise through a 1.8–3 kHz band-pass, with its volume following the stroke |
| Plate flip | A short triangle tick and a high noise snap |
| Slide | Noise through a sweeping band-pass |
| Clack | A low sine thump, a short triangle tone and a noise click |
| Bead pop | A sine blip dropping onto E5, G5 or B5 |
| Giggles (4 voices) | A sawtooth through formant filters near 1 kHz and 2.5 kHz, with a breathy onset |
| Ta-da | Two chords, glockenspiel pings, a giggle and a sung "yay" |

Recorded clips added to `public/sounds/` must be listed here with their source and licence (see the README).
