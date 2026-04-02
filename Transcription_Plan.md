# Persistent Speaker Identification System

## Overview

Build a system that not only diarizes audio (labeling "Speaker A" vs "Speaker B" within a session) but **recognizes known speakers across sessions** using speaker embeddings matched against an enrollment database.

## Architecture

```
Audio → Whisper (transcription)
      → pyannote (diarization + segments)
      → Embedding extraction per segment
      → Cosine similarity lookup against enrollment DB
      → Labeled transcript with speaker names
```

## Core Concept: Speaker Embeddings

Speaker embedding models (ECAPA-TDNN, etc.) produce a fixed-length vector (192–512 dims) from an audio segment — essentially a voice fingerprint. Two clips from the same person will have high cosine similarity; different people will have low similarity.

## Components

### 1. Transcription — Whisper (local)

- Use `faster-whisper` with `large-v3` for best accuracy and speed.
- Produces timestamped transcription segments.

### 2. Diarization — pyannote-audio

- `pyannote/speaker-diarization-3.1` segments audio by speaker.
- Outputs time-stamped speaker turns (e.g., Speaker A: 0.0s–3.2s, Speaker B: 3.2s–7.1s).

### 3. Embedding Extraction

- Use `pyannote/embedding` or `speechbrain/spkrec-ecapa-voxceleb` to extract a vector per diarized segment.
- Aggregate multiple segment embeddings per speaker within a session (e.g., mean pooling) for a more robust representation.

### 4. Enrollment Database

- Store one or more reference embeddings per known person.
- Schema (SQLite or similar):

| Column       | Type       | Description                      |
| ------------ | ---------- | -------------------------------- |
| speaker_id   | TEXT (PK)  | Unique identifier                |
| speaker_name | TEXT       | Human-readable name              |
| embedding    | BLOB/ARRAY | Reference embedding vector       |
| enrolled_at  | TIMESTAMP  | When the embedding was captured  |
| audio_source | TEXT       | Source file or session reference |

- For larger scale (thousands of speakers), use FAISS or another ANN index for fast lookup.

### 5. Matching Logic

```
For each diarized speaker segment:
    1. Extract embedding
    2. Compute cosine similarity against all enrollment embeddings
    3. If max similarity > threshold → assign known speaker name
    4. If max similarity < threshold → label as "Unknown"
```

- **Threshold**: typically 0.5–0.8 depending on model and audio quality. Must be tuned on your data.

## Practical Considerations

### Enrollment Quality

- Use 5–10 seconds of clean speech per person.
- Capture multiple samples across different conditions (microphones, background noise levels, speaking styles).
- More reference embeddings per person → more robust matching.

### Incremental Enrollment Workflow

1. Run the pipeline on new audio.
2. Flag segments labeled "Unknown."
3. A human reviews and labels the unknown speaker.
4. Automatically add the new speaker's embedding to the enrollment DB.

### Embedding Drift

- Voices change over time (illness, aging, different microphones).
- Periodically refresh reference embeddings with recent samples.
- Consider storing multiple embeddings per speaker across time and matching against the best one.

### Bootstrapping from an Archive

If you have a large existing audio archive and want to retroactively identify speakers:

1. Run diarization + embedding extraction on all files.
2. Cluster all embeddings (HDBSCAN works well for unknown number of clusters).
3. Manually label each cluster once.
4. Populate the enrollment DB from labeled clusters.

## Tooling Summary

| Component              | Recommended Tool                          | Notes                               |
| ---------------------- | ----------------------------------------- | ----------------------------------- |
| Transcription          | `faster-whisper` (large-v3)               | CTranslate2 backend, fast on GPU    |
| Diarization            | `pyannote/speaker-diarization-3.1`        | Requires HuggingFace token          |
| Speaker embeddings     | `pyannote/embedding` or SpeechBrain ECAPA | 192–512 dim vectors                 |
| Embedding storage      | SQLite (small) / FAISS (large)            | Cosine similarity search            |
| Clustering (bootstrap) | HDBSCAN                                   | Good for unknown number of speakers |

## Example Code Sketch

```python
from faster_whisper import WhisperModel
from pyannote.audio import Pipeline, Inference
from pyannote.core import Segment
import numpy as np

# --- Setup ---
whisper_model = WhisperModel("large-v3", device="cuda")
diarization_pipeline = Pipeline.from_pretrained(
    "pyannote/speaker-diarization-3.1",
    use_auth_token="HF_TOKEN",
)
embedding_model = Inference("pyannote/embedding", window="whole", device="cuda")

# --- Transcription ---
segments, info = whisper_model.transcribe("audio.wav", beam_size=5)
transcript = [(s.start, s.end, s.text) for s in segments]

# --- Diarization ---
diarization = diarization_pipeline("audio.wav")

# --- Embedding extraction + matching ---
THRESHOLD = 0.65

for turn, _, speaker_label in diarization.itertracks(yield_label=True):
    segment = Segment(turn.start, turn.end)
    emb = embedding_model.crop("audio.wav", segment)

    # Compare against enrollment DB
    best_match, best_score = lookup_enrollment_db(emb)

    if best_score > THRESHOLD:
        identified_name = best_match
    else:
        identified_name = f"Unknown ({speaker_label})"

    print(f"[{turn.start:.1f}s - {turn.end:.1f}s] {identified_name}")
```

## Hardware Requirements

The full pipeline runs comfortably on a single GPU. The diarization and embedding models are much smaller than Whisper — the bottleneck is transcription, not speaker identification.

| Model                   | VRAM (approx) |
| ----------------------- | ------------- |
| faster-whisper large-v3 | ~3–4 GB       |
| pyannote diarization    | ~1 GB         |
| pyannote embedding      | < 1 GB        |
| **Total**               | **~5–6 GB**   |