# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

A single musician (the owner) who mainly plays piano, sometimes guitar, jamming without preparation: alone at the piano, with friends, or along to a song playing in the room. Sometimes singing while playing. Uses a laptop (Chrome) or an iPad (Safari) on the music stand, at arm's length to a metre away, often with one hand on the keys.

## Product Purpose

Tell the player what key they are in and which chords they are playing, live, so they can keep jamming, and capture the idea so it is not lost. Success: start playing within one tap, read the chord and key at a glance from the bench, find the idea again later.

## Positioning

Listens through the microphone or a USB MIDI piano and shows chord, key, and progression in real time, with help that fits unprepared jamming (what to play next, which scale fits, how to voice it, how to modulate). Everything runs locally in the browser.

## Operating Context

Dark rooms and lit rooms. Noisy input (room, speaker, vocals). Laptop or iPad propped on the piano. Hands busy: controls must be one-tap and large; keyboard shortcuts for the laptop. A session is minutes to an hour. After playing, the user reviews, fixes a wrong chord, names and tags the idea, exports a chart, or shares a link.

## Capabilities and Constraints

Live chord and key detection (mic and Web MIDI), chord vocabulary levels (triads, sevenths, jazz), Solo/Room listening modes, timeline with repeat compression, bookmarks and section markers, audio and MIDI recording, review with synced playback and piano roll, library, analyze an audio file, ear training, practice stats, optional Supabase sync and public share links. Web MIDI is Chrome/Edge only. Detection is probabilistic: confidence must be visible, and uncertainty shown as "no chord" rather than a wrong guess. Everything local by default.

## Brand Commitments

Name: Keel. User-pinned direction (2026-10-23): follow Apple's app UX conventions (Human Interface Guidelines) as the reference for navigation, controls, hierarchy and restraint; "modern, calm, not complicated". [inferred from the user's request]

## Evidence on Hand

No real-user recordings or testimonials. Accuracy evidence comes only from synthesised sessions (see `docs/ACCURACY.md` once written). Do not fabricate accuracy claims in the UI.

## Product Principles

- Glanceable from the bench: one thing is huge (the chord), everything else is secondary.
- One tap to start; nothing to configure before playing.
- Honest uncertainty: show confidence, never flicker between guesses.
- Help on demand: suggestions, scales, voicings and modulations are available, not in the way.
- Local-first and private by default.

## Accessibility & Inclusion

Large touch targets (≥44 px) for iPad use; keyboard operable on laptop; chord symbol readable at 1 m; respects reduced motion and system light/dark.
