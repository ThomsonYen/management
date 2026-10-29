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

# Online serving (Fly.io)

One Fly app per person, each with its own volume and database. Details and pitfalls: `readmes/deployments.md`.

1. Install the CLI and create an account (Fly asks for a card before it will run apps): `brew install flyctl && fly auth signup`. Already have one? `fly auth login`.
2. Make your own config (never edit someone else's): `cp fly.toml fly.<you>.toml`. The only change Fly needs is `app`: pick a name nobody else on Fly has taken. Also set `APP_ORIGIN` to `https://<app>.fly.dev`, because the Claude connector's sign-in uses it. `primary_region` is optional; set it to a region near you.
3. Create the app and add the OpenAI key (optional; needed for transcription and AI suggestions):
   ```bash
   fly apps create <app>
   fly secrets set OPENAI_API_KEY=sk-... -c fly.<you>.toml
   ```
4. Deploy (the `/data` volume is created on first deploy). Fly ships your working directory, so run the regression gate in `CLAUDE.md` first:
   ```bash
   fly deploy -c fly.<you>.toml
   ```
5. Create the owner login:
   ```bash
   fly ssh console -c fly.<you>.toml
   python3 scripts/create_user.py <username>     # inside the machine; prompts for a password
   ```
6. Open `https://<app>.fly.dev` and sign in. Keep the machine count at 1 (SQLite lives on one volume).

# Phone app

The app is a PWA, so there is nothing to build or install from a store.

- **iPhone:** open `https://<app>.fly.dev` in Safari → Share → **Add to Home Screen**.
- **Android:** open it in Chrome → ⋮ menu → **Install app** (or *Add to Home screen*).

Sign in once; it launches full-screen from the home screen and updates itself after each deploy. To use the app through Claude on your phone instead, add the MCP connector (`readmes/api_tokens.md`).
