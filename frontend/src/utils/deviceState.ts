import { persister, queryClient } from '../queryClient'

// Keys that describe the device rather than the person using it. Everything
// else in localStorage — the persisted query cache, the settings cache, page
// UI state — belongs to whoever was signed in and is purged when the identity
// changes, so a shared device never shows the previous user's data.
const DEVICE_KEYS = new Set([
  'settings.theme',
  'settings.fontSize',
  'theme.variant.v1',
  'pwa.installHintDismissed.v1',
  'recording.systemAudioDevice.v1',
])

/** Call on login, logout and invite acceptance, right before the full reload. */
export function clearDeviceState(): void {
  try {
    void persister.removeClient()
  } catch {
    /* storage unavailable */
  }
  try {
    for (const key of Object.keys(localStorage)) {
      if (!DEVICE_KEYS.has(key)) localStorage.removeItem(key)
    }
  } catch {
    /* storage unavailable */
  }
  queryClient.removeQueries()
}
