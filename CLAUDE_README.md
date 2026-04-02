# Transcription Feature Plan

## Current State

Audio recording and transcript storage are implemented but transcription is **manual only**.

### What exists

- **Audio recording** (`frontend/src/hooks/useAudioRecorder.ts`): Captures mic audio via `getUserMedia` and optionally system audio (Zoom, Meet, Discord) via `getDisplayMedia`, mixed with Web Audio API. Records as WebM/Opus.
- **Audio storage** (`backend/meeting_audio/{note_id}/{uuid}.webm`): Uploaded via `POST /meeting-notes/{id}/audio`. Temporary files the user can delete after transcription.
- **Audio playback**: Inline `<audio>` controls in the sidebar (`frontend/src/components/AudioFileList.tsx`), served via `GET /meeting-notes/{id}/audio/{filename}/download`.
- **Transcript storage** (`backend/meeting_transcripts/{note_id}.txt`): Saved via the `transcript` field on `PUT /meeting-notes/{id}`. Persistent.
- **Transcript UI** (`frontend/src/components/TranscriptEditor.tsx`): Collapsible textarea below the markdown editor with 1s debounced auto-save. Currently paste/type only.

### What needs to be built

Automated audio-to-text transcription from the stored audio files into the transcript field.

## Implementation Plan

### Backend

1. **Add a transcription endpoint**:
   ```
   POST /meeting-notes/{note_id}/transcribe
   ```
   - Reads all audio files from `meeting_audio/{note_id}/` (or accepts a specific `filename` query param)
   - Runs them through a speech-to-text engine
   - Writes the result to `meeting_transcripts/{note_id}.txt`
   - Returns the transcript text in the response

2. **Speech-to-text options** (pick one):
   - **OpenAI Whisper API** (`openai` package) — simplest, no GPU needed, pay-per-use. Send audio file to `client.audio.transcriptions.create()`. Supports webm directly. 25MB file size limit per request.
   - **Local Whisper** (`openai-whisper` or `faster-whisper` package) — free, runs locally, needs ~1-4GB RAM depending on model size. Good for privacy. Requires ffmpeg.
   - **Google Cloud Speech-to-Text** or **AWS Transcribe** — alternatives if already using those clouds.

3. **Handling large files**: If recordings exceed the API's file size limit, split into chunks using `pydub` or `ffmpeg` subprocess, transcribe each, concatenate results.

4. **Configuration**: Store the API key (if using a cloud service) in a `.env` file. Add `python-dotenv` loading in `main.py` (already a dependency). Add a config variable like `TRANSCRIPTION_PROVIDER` to switch between backends.

### Frontend

1. **Add a "Transcribe" button** in `TranscriptEditor.tsx`:
   - Show the button when audio files exist and transcript is empty (or always show it with a "Re-transcribe" label if transcript exists)
   - On click, call the new API endpoint
   - Show a loading/spinner state (transcription can take 10-60s depending on audio length)
   - On success, populate the textarea with the returned transcript

2. **Add API function** in `api.ts`:
   ```typescript
   export const transcribeMeetingNote = (noteId: number): Promise<{ transcript: string }> =>
     api.post(`/meeting-notes/${noteId}/transcribe`).then((r) => r.data)
   ```

3. **Invalidate the meeting note query** after transcription completes so the transcript field refreshes.

### Key files to modify

| File | Change |
|------|--------|
| `backend/main.py` | Add `POST /meeting-notes/{id}/transcribe` endpoint |
| `backend/requirements.txt` | Add transcription dependency (e.g. `openai` or `faster-whisper`) |
| `backend/.env` | Add API key if using cloud transcription |
| `frontend/src/api.ts` | Add `transcribeMeetingNote` function |
| `frontend/src/components/TranscriptEditor.tsx` | Add "Transcribe" button with loading state |

### Testing

- Record a short meeting note audio via the UI
- Call the transcribe endpoint via curl: `curl -X POST http://localhost:8000/meeting-notes/1/transcribe`
- Verify the transcript appears in `backend/meeting_transcripts/1.txt`
- Open the meeting note in the UI and confirm the transcript editor shows the text
- Test with a longer recording to verify chunking works if applicable
