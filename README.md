# Setup

Just `bash start.sh` in each folder to run the app. For backend, use `uv pip install -r requirements.txt` to setup env.

## HTTPS for audio recording (optional)

Some browsers (e.g. Arc) require HTTPS to grant microphone access. Without this, the app still works but audio recording may not prompt for permissions.

```bash
brew install mkcert
mkcert -install
cd frontend
mkcert dev.localhost
```

When the pem files are present, Vite automatically serves over `https://dev.localhost:5173`. Without them, it falls back to plain HTTP.
