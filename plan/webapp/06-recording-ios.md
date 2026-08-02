# 06 — Recording on iPhone

Reality check and required fixes for audio recording in iOS Safari / installed PWAs (iOS 17/18). Independent of the layout work; can land any time after auth (Phase A). All changes are in `frontend/src/RecordingContext.tsx` unless noted.

## The blocker: iOS records mp4/AAC, not webm

`MediaRecorder` exists and works for mic audio on iOS, but only produces **`audio/mp4` (AAC)** — `audio/webm`/opus is unsupported. The current code (`RecordingContext.tsx:235-237`) tries `audio/webm;codecs=opus` then falls back to plain `audio/webm`, which **throws `NotSupportedError` on iOS**. The backend transcodes everything to mp3 via pydub/ffmpeg, so container flexibility is free. Fix with a capability chain:

```ts
const CANDIDATES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4;codecs=mp4a.40.2', 'audio/mp4']
const mimeType = CANDIDATES.find((t) => MediaRecorder.isTypeSupported(t))
// undefined → construct MediaRecorder without options (browser default)
```

Related: derive the upload filename extension from the chosen mime (`.webm` vs `.m4a`) — the `sendBeacon` flush path (`:324`) hardcodes `recording.webm`, and check `uploadNoteAudio` in `src/api.ts` for the same.

## Screen lock / backgrounding

iOS suspends the page on screen lock or app switch and kills the recorder — recording through screen-lock is **not achievable in a web app**; don't promise it (a Capacitor wrapper would be the escape hatch if this ever becomes a hard requirement).

- The existing `visibilitychange` salvage handler (`:279-304`) already recovers and uploads chunks captured before suspension — the right safety net; keep it.
- Add **Screen Wake Lock**: `navigator.wakeLock.request('screen')` (iOS 16.4+) acquired while recording, re-acquired on `visibilitychange`, released on stop.
- Add a one-line UX note in the recording UI: "keep the screen on while recording".

## Unload flushing

Add a **`pagehide` listener** alongside the existing `beforeunload` (`:307-335`) — iOS Safari fires `pagehide` reliably but often skips `beforeunload`. `navigator.sendBeacon` itself works fine on iOS (and carries the session cookie, same-origin).

## Mode gating

- `getDisplayMedia` doesn't exist on iOS — the existing `supportsSystemAudio` check (`:7-8`, used in `AudioRecorder.tsx:51`) already hides `mic+system`. 
- Also gate **`mic+device`** (BlackHole loopback — a Mac-only concept) behind the same check or an `isIOS` test, so the iPhone mode picker shows mic-only.

## Secure-context guard

If `navigator.mediaDevices` is undefined (non-secure context), surface a clear error instead of a TypeError. Prod is HTTPS so this is belt-and-suspenders for LAN testing.

## Verification checklist (on a real iPhone, installed PWA)

- [ ] Record a meeting note: expect an `.m4a` upload and a successful backend transcode to mp3 + transcription.
- [ ] Wake lock holds the screen on during recording.
- [ ] Lock the screen mid-recording anyway → on return, the salvage handler uploads what was captured.
- [ ] App-switch during recording → same salvage behavior.
- [ ] Stop-and-upload works from the mobile header REC pill.
- [ ] Mode picker on iPhone shows mic-only.
- [ ] Debug via Safari Web Inspector (Mac Safari Develop menu → the installed PWA) if anything misbehaves.
