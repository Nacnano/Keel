# Benchmark audio attribution

These recordings are evaluation fixtures, excluded from Vercel deployment. Dataset audio is
**not covered by the repository's code license**. Preserve the individual licenses and
credits below when reusing it. `manifest.json` records original filenames, source checksums,
compressed fixture checksums, conversion steps, excerpt duration and reference annotations.
All fixtures use mono 16-bit PCM at 44.1 kHz, compressed losslessly with gzip.

## Rendered piano (six files beginning pop- or jazz-)

Original deterministic performances rendered by Keel's `eval/render.ts` from the
[Splendid Grand Piano samples](https://github.com/sfzinstruments/SplendidGrandPiano).
The instrument's maintainers identify the AKAI samples as public domain, released in 2000.
Samples were obtained through [danigb/samples](https://github.com/danigb/samples), as in the
existing evaluator. Each manifest entry retains the complete session recipe, with one repeat.
Reference chords come from the written progression before rendering. The renderer refused
synthetic fallback while preparing these fixtures. These are not recordings of live musicians.

## GuitarSet (five guitarset- files)

Qingyang Xi, Rachel M. Bittner, Johan Pauwels, Xuzhou Ye and Juan P. Bello.
“GuitarSet: A Dataset for Guitar Transcription,” ISMIR 2018.
[GuitarSet v1.1.0](https://zenodo.org/records/3371780),
[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).

Microphone recordings from `audio_mono-mic.zip`; references from `annotation.zip`'s
performed-chord track (semi-automatic transcription with manual verification).
Excerpts begin at zero and end at 24 seconds or the source end, whichever is earlier.
Slash bass/additions are reduced to the benchmark's base-quality vocabulary; ambiguous
alterations are explicitly unscored. Original annotation strings and JAMS hashes are retained.
The dataset source—not a Keel run—supplies the musical reference.

## Recorded room sounds (room-typing, room-clapping, room-cough, room-vacuum)

Karol J. Piczak. “ESC: Dataset for Environmental Sound Classification,” ACM Multimedia 2015.
[ESC-50](https://github.com/karolpiczak/ESC-50), collection licensed
[CC BY-NC 3.0](https://creativecommons.org/licenses/by-nc/3.0/).
These are the original five-second ESC excerpts, converted to canonical PCM/gzip.
The collection's attribution identifies the underlying Freesound creators as follows:

- `1-137-A-32.wav`: Anton, [keyboard-typing.wav](https://freesound.org/people/Anton/sounds/137/), CC BY.
- `1-104089-A-22.wav`: sorohanro, [Clapping Small Room.wav](https://freesound.org/people/sorohanro/sounds/104089/), CC BY.
- `1-19111-A-24.wav`: Fratz, [cough1.aiff](https://freesound.org/people/Fratz/sounds/19111/), CC BY.
- `2-141682-A-36.wav`: DJ Burnham, [Vacuum Cleaner switch on, run, switch off 2.aif](https://freesound.org/people/DJ%20Burnham/sounds/141682/), CC0.

The ESC-50 collection license is retained for these derived dataset excerpts. The complete
upstream attribution is available in [ESC-50/LICENSE](https://github.com/karolpiczak/ESC-50/blob/master/LICENSE).

## Recorded speech (room-speech)

[LibriSpeech / OpenSLR 12](https://www.openslr.org/12/),
[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
Vassil Panayotov, Guoguo Chen, Daniel Povey and Sanjeev Khudanpur.
“LibriSpeech: An ASR Corpus Based on Public Domain Audio Books,” ICASSP 2015.
LibriVox recording from `test-clean/6930/75918/6930-75918-0000.flac`.
The complete utterance is resampled from 16 to 44.1 kHz. This is read speech, not conversational
room audio; repeated/mixed variants do not represent independent speakers.

## Recorded piano (ishizaka-bach-c-major)

Johann Sebastian Bach, _Prelude No. 1 in C major, BWV 846_, performed by Kimiko Ishizaka,
Open Well-Tempered Clavier, 2015.
[Original recording and license](https://commons.wikimedia.org/wiki/File:Kimiko_Ishizaka_-_Bach_-_Well-Tempered_Clavier,_Book_1_-_01_Prelude_No._1_in_C_major,_BWV_846.ogg),
[CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/).
First 24 seconds, mixed to mono. No reference chord annotation is supplied: this excerpt
measures stability/activity only and is excluded from accuracy scoring.

## Recorded live jam (ninjam-live-band)

[NINJAM autosong recordings from 2005-07-05](https://archive.org/details/ninjam_autosongs_20050705).
Performers: **justin, kbh, brennan, Cube7**, credited in the source recording filename
`20050705_1609_1226_justin_kbh_brennan_Cube7.ogg`.
Licensed [CC BY-NC-SA 2.5](https://creativecommons.org/licenses/by-nc-sa/2.5/), as stated in the
[archive metadata](https://archive.org/metadata/ninjam_autosongs_20050705).
This derived excerpt remains under **CC BY-NC-SA 2.5**.

Seconds 20–44, mixed to mono and converted to PCM16. Only the beginning of the source Ogg
needed to decode this excerpt was downloaded; the manifest distinguishes the locally hashed
prefix from the publisher's full-file checksum. No independent chord annotation is available,
so this is a real ensemble stability/activity stress test, not an accuracy benchmark.
