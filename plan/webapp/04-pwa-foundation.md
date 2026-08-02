# 04 — PWA Foundation

Make the deployed web app installable on the iPhone home screen with an app-like standalone experience. Prereq: Phase A auth wiring ([02-authentication.md](02-authentication.md)) so PWA testing exercises the real login flow.

## Approach: `vite-plugin-pwa` (Workbox generateSW)

The app shell is a classic Vite SPA with hashed assets — the plugin's build-time precache manifest handles cache-busting for free. The one nuance is a single config line: **precache the app shell aggressively, never SW-cache `/api`**. All live data flows through TanStack Query (the in-memory data cache); a service-worker cache of authed JSON would only create staleness and auth-leak footguns.

### Files

**`frontend/package.json`** — add `vite-plugin-pwa` (dev dep).

**`frontend/vite.config.ts`**:

```ts
VitePWA({
  registerType: 'autoUpdate',
  manifest: {
    name: 'Management', short_name: 'Management',
    display: 'standalone', start_url: '/', scope: '/',
    background_color: '<default theme app bg hex>',   // from src/theme/themes/
    theme_color: '<same>',
    icons: [
      { src: '/pwa-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/pwa-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/pwa-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  },
  workbox: {
    navigateFallback: '/index.html',
    navigateFallbackDenylist: [/^\/api\//],
    runtimeCaching: [{ urlPattern: /^\/api\//, handler: 'NetworkOnly' }],
  },
})
```

**`frontend/public/`** — icon set generated from `favicon.svg` (use `@vite-pwa/assets-generator` or a one-off script): `pwa-192.png`, `pwa-512.png`, `pwa-512-maskable.png`, and **`apple-touch-icon.png` at 180×180 with an opaque background** (iOS composites black behind transparency).

**`frontend/index.html`** — add:

```html
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<meta name="theme-color" content="...">                     <!-- default theme app bg -->
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="default">
<meta name="apple-mobile-web-app-title" content="Management">
```

and change the viewport to `width=device-width, initial-scale=1.0, viewport-fit=cover` (do **not** add `maximum-scale`).

**`frontend/src/theme/index.ts`** — in `applyTheme()` (which already writes a `<style>` element + `data-theme` attr), also update `document.querySelector('meta[name=theme-color]')` to the active theme's app background, so the standalone status-bar area matches all themes in light and dark.

**`frontend/src/index.css`** — `html { -webkit-text-size-adjust: 100%; }` and `-webkit-tap-highlight-color: transparent`.

**`frontend/src/main.tsx`** — on `visibilitychange` (visible), call `registration.update()`: iOS aggressively restores PWA state, and this makes a resumed PWA pick up new deploys.

## iOS quirks (document + code around)

- **No `beforeinstallprompt` on iOS.** Install is manual: Safari Share sheet → "Add to Home Screen". Add a small dismissible `frontend/src/components/mobile/InstallHint.tsx`, shown when `isIOS && !matchMedia('(display-mode: standalone)').matches`, with those instructions; persist dismissal in localStorage.
- **Viewport in standalone:** the shell uses `h-screen` (`100vh`), which misbehaves with iOS dynamic toolbars. Change the root in `src/App.tsx` to `h-dvh` (Tailwind 3.4 supports it). With `viewport-fit=cover`, add safe-area padding: `pt-[env(safe-area-inset-top)]` on the mobile header, `pb-[env(safe-area-inset-bottom)]` on the mobile tab bar (see [05-mobile-layout.md](05-mobile-layout.md)).
- **7-day storage eviction** (Safari ITP) hits SW caches/localStorage for the *Safari tab* context after 7 days of non-use; the installed home-screen app has its own partition and is exempt while used. Worst case: a cold shell reload and re-login — all real data is server-side; localStorage holds only prefs (and the settings cache is backed by `GET /config/settings`).
- **Cookie partitioning:** the installed PWA does **not** share cookies with Safari — expect one login inside the installed app even if already logged in via Safari. The 90-day rolling session makes this a one-time event.

## Verification checklist (on a real iPhone, against the Fly URL)

- [ ] Add to Home Screen shows the right name and icon (no black icon corners).
- [ ] Launch from home screen is standalone (no Safari chrome).
- [ ] Status-bar area color matches each theme, light and dark.
- [ ] No layout jump at top/bottom edges on a notch/home-indicator device.
- [ ] Airplane-mode launch shows the app shell (not a Safari error page); going online recovers.
- [ ] Logged-out launch lands cleanly on `/login` (no flash of empty shell); iOS password manager autofills.
- [ ] After a deploy, backgrounding + reopening the PWA picks up the new version.
