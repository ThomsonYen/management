import { useState, useEffect, useRef } from 'react'
import { Moon, Sun, FolderOpen, Plus, RefreshCw, Trash2, Loader2, Mic, LogOut, KeyRound, Copy, Check, ChevronDown, ChevronRight, Ban } from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
 getSystemAudioDevice,
 setSystemAudioDevice,
 type SystemAudioDevice,
} from '../RecordingContext'
import {
 useTheme,
 useTodoDefaults,
 useTimezone,
 useMeetingNoteSort,
 useHotkeys,
 useFontSize,
 useThemeVariant,
 formatHotkey,
 eventToBinding,
 type MeetingNoteSortField,
 type HotkeyBindings,
 type FontSize,
} from '../SettingsContext'
import {
 fetchPersons, fetchVaults, createVault, deleteVault, rescanVault, logout,
 fetchApiTokens, createApiToken, revokeApiToken, fetchApiTokenAudit,
 type AuthUser,
} from '../api'
import type { ApiToken, ApiTokenScope } from '../types'
import { listThemes, type ThemeName } from '../theme'
import { Select } from '../components/ui'

function HotkeyInput({ label, description, bindingKey }: { label: string; description: string; bindingKey: keyof HotkeyBindings }) {
 const { bindings, setBinding } = useHotkeys()
 const [recording, setRecording] = useState(false)
 const buttonRef = useRef<HTMLButtonElement>(null)

 useEffect(() => {
 if (!recording) return
 const handler = (e: KeyboardEvent) => {
 e.preventDefault()
 e.stopPropagation()
 // Ignore bare modifier keys
 if (['Meta', 'Control', 'Alt', 'Shift'].includes(e.key)) return
 const binding = eventToBinding(e)
 setBinding(bindingKey, binding)
 setRecording(false)
 }
 const cancelOnClick = (e: MouseEvent) => {
 if (buttonRef.current && !buttonRef.current.contains(e.target as Node)) {
 setRecording(false)
 }
 }
 document.addEventListener('keydown', handler, true)
 document.addEventListener('mousedown', cancelOnClick)
 return () => {
 document.removeEventListener('keydown', handler, true)
 document.removeEventListener('mousedown', cancelOnClick)
 }
 }, [recording, bindingKey, setBinding])

 return (
 <div className="flex items-center justify-between gap-4">
 <div>
 <p className="text-sm text-fg">{label}</p>
 <p className="text-xs text-fg-subtle">{description}</p>
 </div>
 <button
 ref={buttonRef}
 onClick={() => setRecording(true)}
 className={`min-w-[120px] px-4 py-2 rounded-lg text-sm font-mono font-medium border transition-colors ${
 recording
 ? 'border-accent bg-accent-1 text-accent ring-2 ring-accent/40 dark:ring-accent'
 : 'border-border bg-surface text-fg hover:border-accent dark:hover:border-accent'
 }`}
 >
 {recording ? 'Press keys...' : formatHotkey(bindings[bindingKey])}
 </button>
 </div>
 )
}

function RecordingSection() {
 const [devices, setDevices] = useState<MediaDeviceInfo[]>([])
 const [selected, setSelected] = useState<SystemAudioDevice | null>(getSystemAudioDevice())
 const [permission, setPermission] = useState<'unknown' | 'granted' | 'denied'>('unknown')
 const [loading, setLoading] = useState(false)

 const loadDevices = async () => {
 setLoading(true)
 try {
 const all = await navigator.mediaDevices.enumerateDevices()
 const inputs = all.filter((d) => d.kind === 'audioinput')
 setDevices(inputs)
 // Labels are empty until mic permission is granted at least once.
 if (inputs.some((d) => d.label)) setPermission('granted')
 } finally {
 setLoading(false)
 }
 }

 useEffect(() => {
 loadDevices()
 const handler = () => loadDevices()
 navigator.mediaDevices?.addEventListener?.('devicechange', handler)
 return () => navigator.mediaDevices?.removeEventListener?.('devicechange', handler)
 // eslint-disable-next-line react-hooks/exhaustive-deps
 }, [])

 const requestPermission = async () => {
 try {
 const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
 stream.getTracks().forEach((t) => t.stop())
 setPermission('granted')
 await loadDevices()
 } catch {
 setPermission('denied')
 }
 }

 const choose = (deviceId: string) => {
 if (!deviceId) {
 setSystemAudioDevice(null)
 setSelected(null)
 return
 }
 const dev = devices.find((d) => d.deviceId === deviceId)
 if (!dev) return
 const next = { deviceId: dev.deviceId, label: dev.label || 'Unnamed device' }
 setSystemAudioDevice(next)
 setSelected(next)
 }

 const labelsHidden = devices.length > 0 && !devices.some((d) => d.label)

 return (
 <div className="bg-surface rounded-xl shadow-sm border border-border">
 <div className="px-6 py-5">
 <div className="flex items-center justify-between mb-2">
 <div>
 <h2 className="text-sm font-semibold text-fg flex items-center gap-2">
 <Mic size={16} /> Recording
 </h2>
 <p className="text-sm text-fg-muted mt-0.5">
 Pick a virtual loopback device to capture system audio without the screen-share prompt.
 </p>
 </div>
 </div>

 <div className="mt-4 space-y-3">
 {permission !== 'granted' && labelsHidden && (
 <div className="flex items-center justify-between gap-3 p-3 rounded-lg border border-warning/30 bg-warning-bg ">
 <p className="text-xs text-warning leading-tight">
 Grant microphone permission once to see your input devices by name.
 </p>
 <button
 onClick={requestPermission}
 className="text-xs font-medium px-3 py-1.5 bg-warning text-white rounded-md hover:bg-amber-700 transition-colors flex-shrink-0"
 >
 Grant access
 </button>
 </div>
 )}

 <div className="flex flex-wrap items-center justify-between gap-4 gap-y-2">
 <label className="text-sm text-fg shrink-0">
 System audio device
 </label>
 <select
 value={selected?.deviceId ?? ''}
 onChange={(e) => choose(e.target.value)}
 disabled={loading}
 className="w-full md:w-72 border border-border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
 >
 <option value="">None — use screen-share prompt</option>
 {devices.map((d) => (
 <option key={d.deviceId} value={d.deviceId}>
 {d.label || `Input (${d.deviceId.slice(0, 6)}…)`}
 </option>
 ))}
 {selected && !devices.some((d) => d.deviceId === selected.deviceId) && (
 <option value={selected.deviceId}>{selected.label} (not connected)</option>
 )}
 </select>
 </div>

 <details className="text-xs text-fg-muted">
 <summary className="cursor-pointer hover:text-fg dark:hover:text-fg">
 How to set up loopback on macOS
 </summary>
 <ol className="list-decimal list-inside mt-2 space-y-1 leading-relaxed pl-1">
 <li>
 Install{' '}
 <a
 href="https://github.com/ExistentialAudio/BlackHole"
 target="_blank"
 rel="noreferrer"
 className="text-accent hover:underline"
 >
 BlackHole 2ch
 </a>{' '}
 (free virtual audio driver).
 </li>
 <li>
 Open <span className="font-mono">Audio MIDI Setup</span> → create a{' '}
 <em>Multi-Output Device</em> that includes your speakers/headphones <em>and</em>{' '}
 BlackHole. Set this as your Mac's output so audio is both audible and piped to
 BlackHole.
 </li>
 <li>Pick "BlackHole 2ch" in the selector above.</li>
 <li>
 Recording with "System audio" checked will now capture mic + system audio with zero
 extra prompts.
 </li>
 </ol>
 </details>
 </div>
 </div>
 </div>
 )
}

function VaultsSection() {
 const queryClient = useQueryClient()
 const { data: vaults = [], isLoading } = useQuery({ queryKey: ['vaults'], queryFn: fetchVaults })
 const [showAdd, setShowAdd] = useState(false)
 const [name, setName] = useState('')
 const [path, setPath] = useState('')
 const [error, setError] = useState<string | null>(null)

 const invalidateAll = () => {
 queryClient.invalidateQueries({ queryKey: ['vaults'] })
 queryClient.invalidateQueries({ queryKey: ['notes'] })
 queryClient.invalidateQueries({ queryKey: ['tags'] })
 }

 const createMutation = useMutation({
 mutationFn: createVault,
 onSuccess: () => {
 setShowAdd(false)
 setName('')
 setPath('')
 setError(null)
 invalidateAll()
 },
 onError: (e: any) => setError(e?.response?.data?.detail ?? e.message ?? 'Failed to add vault'),
 })

 const deleteMutation = useMutation({
 mutationFn: deleteVault,
 onSuccess: invalidateAll,
 })

 const rescanMutation = useMutation({
 mutationFn: rescanVault,
 onSuccess: invalidateAll,
 })

 return (
 <div className="bg-surface rounded-xl shadow-sm border border-border">
 <div className="px-6 py-5">
 <div className="flex items-center justify-between mb-4">
 <div>
 <h2 className="text-sm font-semibold text-fg flex items-center gap-2">
 <FolderOpen size={16} /> Vaults
 </h2>
 <p className="text-sm text-fg-muted mt-0.5">
 Point the app at folders on disk (e.g. an Obsidian vault) to index their <code className="font-mono text-xs">.md</code> files.
 </p>
 </div>
 {!showAdd && (
 <button
 onClick={() => setShowAdd(true)}
 className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-accent text-white rounded-lg hover:bg-accent-hover transition-colors"
 >
 <Plus size={14} /> Add vault
 </button>
 )}
 </div>

 {showAdd && (
 <div className="mb-4 p-4 border border-border rounded-lg space-y-3 bg-app/30">
 <div>
 <label className="block text-xs font-medium text-fg-muted mb-1">Name</label>
 <input
 value={name}
 onChange={(e) => setName(e.target.value)}
 placeholder="my-obsidian"
 className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-surface text-fg focus:outline-none focus:ring-2 focus:ring-accent"
 />
 </div>
 <div>
 <label className="block text-xs font-medium text-fg-muted mb-1">Absolute path</label>
 <input
 value={path}
 onChange={(e) => setPath(e.target.value)}
 placeholder="/Users/me/Documents/Obsidian"
 className="w-full px-3 py-2 text-sm font-mono border border-border rounded-lg bg-surface text-fg focus:outline-none focus:ring-2 focus:ring-accent"
 />
 <p className="text-xs text-fg-muted mt-1">
 The app will scan this folder, stamp a <code className="font-mono">mgmt_id</code> into each note's YAML frontmatter, and index tags. Your other frontmatter keys are preserved.
 </p>
 </div>
 {error && (
 <div className="text-xs text-danger bg-danger-bg border border-danger/30 rounded px-3 py-2">{error}</div>
 )}
 <div className="flex items-center gap-2">
 <button
 onClick={() => createMutation.mutate({ name: name.trim(), root_path: path.trim() })}
 disabled={!name.trim() || !path.trim() || createMutation.isPending}
 className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-accent text-white rounded-lg hover:bg-accent-hover disabled:opacity-50 transition-colors"
 >
 {createMutation.isPending ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
 {createMutation.isPending ? 'Scanning…' : 'Add & scan'}
 </button>
 <button
 onClick={() => { setShowAdd(false); setError(null) }}
 className="px-3 py-1.5 text-xs font-medium text-fg-muted hover:bg-inset rounded-lg transition-colors"
 >
 Cancel
 </button>
 </div>
 </div>
 )}

 {isLoading ? (
 <p className="text-xs text-fg-subtle">Loading…</p>
 ) : vaults.length === 0 ? (
 <p className="text-xs text-fg-subtle">No vaults yet.</p>
 ) : (
 <ul className="space-y-2">
 {vaults.map((v) => (
 <li
 key={v.id}
 className="flex items-center justify-between gap-3 px-4 py-3 border border-border rounded-lg bg-app/30"
 >
 <div className="min-w-0">
 <div className="flex items-center gap-2">
 <span className="text-sm font-medium text-fg">{v.name}</span>
 {v.is_managed && (
 <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-accent-1 text-accent-fg uppercase tracking-wider">Managed</span>
 )}
 <span className="text-xs text-fg-subtle">{v.note_count} note{v.note_count !== 1 ? 's' : ''}</span>
 </div>
 <p className="text-xs text-fg-muted font-mono truncate">{v.root_path}</p>
 {v.last_scan_at && (
 <p className="text-[10px] text-fg-subtle mt-0.5">Last scan: {new Date(v.last_scan_at).toLocaleString()}</p>
 )}
 </div>
 <div className="flex items-center gap-1 flex-shrink-0">
 <button
 onClick={() => rescanMutation.mutate(v.id)}
 disabled={rescanMutation.isPending && rescanMutation.variables === v.id}
 className="p-1.5 text-fg-subtle hover:text-accent dark:hover:text-accent hover:bg-accent-1 dark:hover:bg-accent-1 rounded transition-colors"
 title="Rescan now"
 >
 {rescanMutation.isPending && rescanMutation.variables === v.id ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
 </button>
 {!v.is_managed && (
 <button
 onClick={() => {
 if (confirm(`Stop watching "${v.name}"? Files on disk won't be touched.`)) {
 deleteMutation.mutate(v.id)
 }
 }}
 className="p-1.5 text-fg-subtle hover:text-danger hover:bg-danger-bg rounded transition-colors"
 title="Remove vault (files stay on disk)"
 >
 <Trash2 size={14} />
 </button>
 )}
 </div>
 </li>
 ))}
 </ul>
 )}
 </div>
 </div>
 )
}

const SCOPE_OPTIONS: { value: ApiTokenScope; label: string; hint: string }[] = [
 { value: 'read', label: 'read', hint: 'List and read todos, projects, people, goals, notes, the operator manual' },
 { value: 'write:todos', label: 'write:todos', hint: 'Create, edit, complete, focus todos and subtodos' },
 { value: 'write:persons', label: 'write:persons', hint: 'Record check-ins and person notes only' },
 { value: 'write:notes', label: 'write:notes', hint: 'Create and edit personal notes (reports)' },
 { value: 'write:daily', label: 'write:daily', hint: 'Daily goals and must-do items' },
]

const inputCls = 'w-full px-3 py-2 text-sm border border-border rounded-lg bg-surface text-fg focus:outline-none focus:ring-2 focus:ring-accent'

function tokenState(t: ApiToken): { label: string; cls: string } {
 if (t.revoked_at) return { label: 'Revoked', cls: 'bg-inset text-fg-subtle' }
 if (new Date(t.expires_at) <= new Date()) return { label: 'Expired', cls: 'bg-warning-bg text-warning' }
 return { label: 'Active', cls: 'bg-success-bg text-success' }
}

function ApiTokenAudit({ tokenId }: { tokenId: number }) {
 const { data: rows = [], isLoading } = useQuery({
 queryKey: ['api-token-audit', tokenId],
 queryFn: () => fetchApiTokenAudit(tokenId),
 })
 if (isLoading) return <p className="text-xs text-fg-subtle px-4 pb-3">Loading…</p>
 if (rows.length === 0) return <p className="text-xs text-fg-subtle px-4 pb-3">No writes recorded with this token.</p>
 return (
 <ul className="px-4 pb-3 space-y-1 max-h-64 overflow-y-auto">
 {rows.map((r) => (
 <li key={r.id} className="text-xs font-mono flex items-start gap-2">
 <span className="text-fg-subtle whitespace-nowrap">{new Date(r.ts).toLocaleString()}</span>
 <span className={r.status >= 400 ? 'text-danger' : 'text-success'}>{r.status}</span>
 <span className="text-fg whitespace-nowrap">{r.method} {r.path}</span>
 {r.body && <span className="text-fg-muted truncate" title={r.body}>{r.body}</span>}
 </li>
 ))}
 </ul>
 )
}

function ApiTokensSection() {
 const queryClient = useQueryClient()
 const { data: tokens = [], isLoading } = useQuery({ queryKey: ['api-tokens'], queryFn: fetchApiTokens })
 const [showAdd, setShowAdd] = useState(false)
 const [name, setName] = useState('')
 const [scopes, setScopes] = useState<ApiTokenScope[]>(['read'])
 const [days, setDays] = useState(90)
 const [error, setError] = useState<string | null>(null)
 const [revealed, setRevealed] = useState<{ name: string; token: string } | null>(null)
 const [copied, setCopied] = useState(false)
 const [openAudit, setOpenAudit] = useState<number | null>(null)

 const createMutation = useMutation({
 mutationFn: createApiToken,
 onSuccess: (t) => {
 setRevealed({ name: t.name, token: t.token })
 setCopied(false)
 setShowAdd(false)
 setName('')
 setScopes(['read'])
 setDays(90)
 setError(null)
 queryClient.invalidateQueries({ queryKey: ['api-tokens'] })
 },
 onError: (e: any) => setError(e?.response?.data?.detail ?? e.message ?? 'Failed to create token'),
 })

 const revokeMutation = useMutation({
 mutationFn: revokeApiToken,
 onSuccess: () => queryClient.invalidateQueries({ queryKey: ['api-tokens'] }),
 })

 const toggleScope = (s: ApiTokenScope) =>
 setScopes((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]))

 const copyToken = async () => {
 if (!revealed) return
 try {
 await navigator.clipboard.writeText(revealed.token)
 setCopied(true)
 } catch {
 setCopied(false)
 }
 }

 return (
 <div className="bg-surface rounded-xl shadow-sm border border-border">
 <div className="px-6 py-5">
 <div className="flex items-center justify-between mb-4">
 <div>
 <h2 className="text-sm font-semibold text-fg flex items-center gap-2">
 <KeyRound size={16} /> API tokens
 </h2>
 <p className="text-sm text-fg-muted mt-0.5">
 Let an agent or script use the API with a scoped, revocable token. Deletes, config, vaults and backups are never reachable with a token.
 </p>
 </div>
 {!showAdd && (
 <button
 onClick={() => { setShowAdd(true); setRevealed(null) }}
 className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-accent text-white rounded-lg hover:bg-accent-hover transition-colors"
 >
 <Plus size={14} /> New token
 </button>
 )}
 </div>

 {revealed && (
 <div className="mb-4 p-4 border border-success/40 bg-success-bg rounded-lg space-y-2">
 <p className="text-xs font-medium text-fg">
 Token <span className="font-mono">{revealed.name}</span> created. Copy it now — it will not be shown again.
 </p>
 <div className="flex items-center gap-2">
 <code className="flex-1 min-w-0 px-3 py-2 text-xs font-mono bg-surface border border-border rounded-lg break-all select-all">{revealed.token}</code>
 <button
 onClick={copyToken}
 className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-accent text-white rounded-lg hover:bg-accent-hover transition-colors flex-shrink-0"
 >
 {copied ? <Check size={12} /> : <Copy size={12} />} {copied ? 'Copied' : 'Copy'}
 </button>
 </div>
 <p className="text-xs text-fg-muted">
 On a Mac: <code className="font-mono">security add-generic-password -U -s management-api -a claude -w '&lt;token&gt;'</code>
 </p>
 <button onClick={() => setRevealed(null)} className="text-xs text-fg-muted hover:text-fg underline">Dismiss</button>
 </div>
 )}

 {showAdd && (
 <div className="mb-4 p-4 border border-border rounded-lg space-y-3 bg-app/30">
 <div>
 <label className="block text-xs font-medium text-fg-muted mb-1">Name</label>
 <input value={name} onChange={(e) => setName(e.target.value)} placeholder="claude-mac" className={inputCls} />
 </div>
 <div>
 <label className="block text-xs font-medium text-fg-muted mb-1">Scopes</label>
 <div className="space-y-1.5">
 {SCOPE_OPTIONS.map((o) => (
 <label key={o.value} className="flex items-start gap-2 text-sm text-fg cursor-pointer">
 <input
 type="checkbox"
 checked={scopes.includes(o.value)}
 onChange={() => toggleScope(o.value)}
 className="mt-0.5 h-4 w-4 rounded border-border"
 />
 <span>
 <span className="font-mono text-xs">{o.label}</span>
 <span className="block text-xs text-fg-muted">{o.hint}</span>
 </span>
 </label>
 ))}
 </div>
 </div>
 <div>
 <label className="block text-xs font-medium text-fg-muted mb-1">Expires in (days)</label>
 <input
 type="number"
 min={1}
 max={365}
 value={days}
 onChange={(e) => setDays(Math.max(1, Math.min(365, Number(e.target.value) || 1)))}
 className={`${inputCls} md:w-32`}
 />
 </div>
 {error && (
 <div className="text-xs text-danger bg-danger-bg border border-danger/30 rounded px-3 py-2">{error}</div>
 )}
 <div className="flex items-center gap-2">
 <button
 onClick={() => createMutation.mutate({ name: name.trim(), scopes, expires_in_days: days })}
 disabled={!name.trim() || scopes.length === 0 || createMutation.isPending}
 className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-accent text-white rounded-lg hover:bg-accent-hover disabled:opacity-50 transition-colors"
 >
 {createMutation.isPending ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
 Create token
 </button>
 <button
 onClick={() => { setShowAdd(false); setError(null) }}
 className="px-3 py-1.5 text-xs font-medium text-fg-muted hover:bg-inset rounded-lg transition-colors"
 >
 Cancel
 </button>
 </div>
 </div>
 )}

 {isLoading ? (
 <p className="text-xs text-fg-subtle">Loading…</p>
 ) : tokens.length === 0 ? (
 <p className="text-xs text-fg-subtle">No tokens yet.</p>
 ) : (
 <ul className="space-y-2">
 {tokens.map((t) => {
 const state = tokenState(t)
 const auditOpen = openAudit === t.id
 return (
 <li key={t.id} className="border border-border rounded-lg bg-app/30">
 <div className="flex items-center justify-between gap-3 px-4 py-3">
 <div className="min-w-0">
 <div className="flex items-center gap-2 flex-wrap">
 <span className="text-sm font-medium text-fg font-mono">{t.name}</span>
 <span className={`text-[10px] px-1.5 py-0.5 rounded-full uppercase tracking-wider ${state.cls}`}>{state.label}</span>
 {t.scopes.map((s) => (
 <span key={s} className="text-[10px] px-1.5 py-0.5 rounded-full bg-accent-1 text-accent-fg font-mono">{s}</span>
 ))}
 </div>
 <p className="text-[11px] text-fg-subtle mt-0.5">
 Expires {new Date(t.expires_at).toLocaleDateString()}
 {' · '}
 {t.last_used_at ? `Last used ${new Date(t.last_used_at).toLocaleString()}` : 'Never used'}
 {t.revoked_at && ` · Revoked ${new Date(t.revoked_at).toLocaleString()}`}
 </p>
 </div>
 <div className="flex items-center gap-1 flex-shrink-0">
 <button
 onClick={() => setOpenAudit(auditOpen ? null : t.id)}
 className="flex items-center gap-1 px-2 py-1.5 text-xs text-fg-subtle hover:text-fg hover:bg-inset rounded transition-colors"
 title="Show writes made with this token"
 >
 {auditOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />} Audit
 </button>
 {!t.revoked_at && (
 <button
 onClick={() => {
 if (confirm(`Revoke "${t.name}"? Anything using it will stop working immediately.`)) {
 revokeMutation.mutate(t.id)
 }
 }}
 className="p-1.5 text-fg-subtle hover:text-danger hover:bg-danger-bg rounded transition-colors"
 title="Revoke token"
 >
 <Ban size={14} />
 </button>
 )}
 </div>
 </div>
 {auditOpen && <ApiTokenAudit tokenId={t.id} />}
 </li>
 )
 })}
 </ul>
 )}
 </div>
 </div>
 )
}


function getAvailableTimezones(): string[] {
 try {
 return (Intl as any).supportedValuesOf('timeZone') as string[]
 } catch {
 return [
 'UTC',
 'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles',
 'America/Toronto', 'America/Vancouver', 'America/Sao_Paulo', 'America/Mexico_City',
 'Europe/London', 'Europe/Berlin', 'Europe/Paris', 'Europe/Amsterdam', 'Europe/Rome',
 'Europe/Madrid', 'Europe/Zurich', 'Europe/Stockholm', 'Europe/Moscow',
 'Asia/Tokyo', 'Asia/Shanghai', 'Asia/Hong_Kong', 'Asia/Singapore', 'Asia/Seoul',
 'Asia/Kolkata', 'Asia/Dubai', 'Asia/Bangkok', 'Asia/Taipei',
 'Australia/Sydney', 'Australia/Melbourne', 'Pacific/Auckland', 'Pacific/Honolulu',
 'Africa/Cairo', 'Africa/Lagos', 'Africa/Johannesburg',
 ]
 }
}

const TIMEZONES = getAvailableTimezones()

const IMPORTANCE_OPTIONS = ['low', 'medium', 'high', 'critical']

function AccountSection() {
 const queryClient = useQueryClient()
 const sessionUser = queryClient.getQueryData<AuthUser>(['session'])
 const logoutMutation = useMutation({
 mutationFn: logout,
 onSettled: () => {
 queryClient.clear()
 window.location.assign('/login')
 },
 })

 return (
 <div className="bg-surface rounded-xl shadow-sm border border-border">
 <div className="px-6 py-5 flex items-center justify-between">
 <div>
 <h2 className="text-sm font-semibold text-fg">Account</h2>
 <p className="text-sm text-fg-muted mt-0.5">
 {sessionUser ? `Signed in as ${sessionUser.username}` : 'Signed in'}
 </p>
 </div>
 <button
 onClick={() => logoutMutation.mutate()}
 disabled={logoutMutation.isPending}
 className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium border border-border text-fg-muted hover:text-fg hover:bg-inset transition-colors disabled:opacity-50"
 >
 <LogOut size={14} />
 {logoutMutation.isPending ? 'Signing out…' : 'Sign out'}
 </button>
 </div>
 </div>
 )
}

export default function SettingsPage() {
 const { theme, setTheme } = useTheme()
 const { defaults, setDefaults } = useTodoDefaults()
 const { timezone, setTimezone } = useTimezone()
 const { sortBy, setSortBy } = useMeetingNoteSort()
 const { resetToDefaults } = useHotkeys()
 const { size: fontSize, setSize: setFontSize } = useFontSize()
 const { variant: themeVariant, setVariant: setThemeVariant } = useThemeVariant()
 const { data: persons = [] } = useQuery({ queryKey: ['persons'], queryFn: fetchPersons })
 const themeOptions = listThemes()

 const updateField = <K extends keyof typeof defaults>(key: K, value: (typeof defaults)[K]) => {
 setDefaults({ ...defaults, [key]: value })
 }

 return (
 <div className="p-4 md:p-8 max-w-2xl">
 <h1 className="text-2xl font-bold text-fg mb-6">Settings</h1>

 <div className="space-y-4">
 <AccountSection />

 {/* Appearance */}
 <div className="bg-surface rounded-xl shadow-sm border border-border">
 <div className="px-6 py-5 flex items-center justify-between">
 <div>
 <h2 className="text-sm font-semibold text-fg">Appearance</h2>
 <p className="text-sm text-fg-muted mt-0.5">
 Switch between day and night mode
 </p>
 </div>
 <div className="flex items-center gap-1 bg-inset rounded-lg p-1">
 <button
 onClick={() => setTheme('light')}
 className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
 theme === 'light'
 ? 'bg-surface text-fg shadow-xs'
 : 'text-fg-muted hover:text-fg'
 }`}
 >
 <Sun size={14} />
 Light
 </button>
 <button
 onClick={() => setTheme('dark')}
 className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
 theme === 'dark'
 ? 'bg-surface text-fg shadow-xs'
 : 'text-fg-muted hover:text-fg'
 }`}
 >
 <Moon size={14} />
 Dark
 </button>
 </div>
 </div>
 <div className="px-6 py-5 border-t border-border flex flex-wrap items-start justify-between gap-4 gap-y-2">
 <div className="min-w-0">
 <h2 className="text-sm font-semibold text-fg">Theme</h2>
 <p className="text-sm text-fg-muted mt-0.5">
 Choose the visual style. Changes apply instantly.
 </p>
 </div>
 <div className="w-full md:w-56 md:shrink-0">
 <Select
   value={themeVariant}
   onChange={(e) => setThemeVariant(e.target.value as ThemeName)}
 >
   {themeOptions.map((opt) => (
     <option key={opt.name} value={opt.name}>{opt.label}</option>
   ))}
 </Select>
 </div>
 </div>
 <div className="px-6 py-5 border-t border-border flex items-center justify-between gap-4">
 <div className="min-w-0">
 <h2 className="text-sm font-semibold text-fg">Text size</h2>
 <p className="text-sm text-fg-muted mt-0.5">
 Scales all interface text.
 </p>
 </div>
 <div className="flex items-center gap-1 bg-inset rounded-lg p-1">
 {(['sm', 'md', 'lg', 'xl'] as FontSize[]).map((s) => (
 <button
 key={s}
 onClick={() => setFontSize(s)}
 className={`px-3 py-1.5 rounded-md font-medium transition-colors ${
 fontSize === s
 ? 'bg-surface text-fg shadow-xs'
 : 'text-fg-muted hover:text-fg'
 }`}
 style={{ fontSize: s === 'sm' ? '11px' : s === 'md' ? '13px' : s === 'lg' ? '15px' : '17px' }}
 title={s === 'sm' ? 'Small' : s === 'md' ? 'Medium' : s === 'lg' ? 'Large' : 'Extra large'}
 >
 A
 </button>
 ))}
 </div>
 </div>
 </div>

 {/* Timezone */}
 <div className="bg-surface rounded-xl shadow-sm border border-border">
 <div className="px-6 py-5 flex flex-wrap items-center justify-between gap-y-2">
 <div>
 <h2 className="text-sm font-semibold text-fg">Timezone</h2>
 <p className="text-sm text-fg-muted mt-0.5">
 Used for dates, deadlines, and daily tasks
 </p>
 </div>
 <select
 value={timezone}
 onChange={(e) => setTimezone(e.target.value)}
 className="w-full md:w-64 border border-border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
 >
 {TIMEZONES.map((tz) => (
 <option key={tz} value={tz}>
 {tz.replace(/_/g, ' ')}
 </option>
 ))}
 </select>
 </div>
 </div>

 <RecordingSection />

 <VaultsSection />

 <ApiTokensSection />

 {/* Meeting Notes */}
 <div className="bg-surface rounded-xl shadow-sm border border-border">
 <div className="px-6 py-5 flex flex-wrap items-center justify-between gap-y-2">
 <div>
 <h2 className="text-sm font-semibold text-fg">Meeting Notes Sort Order</h2>
 <p className="text-sm text-fg-muted mt-0.5">
 Sort meeting notes by created or last edited time
 </p>
 </div>
 <select
 value={sortBy}
 onChange={(e) => setSortBy(e.target.value as MeetingNoteSortField)}
 className="w-full md:w-64 border border-border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
 >
 <option value="updated_at">Last edited</option>
 <option value="created_at">Created</option>
 </select>
 </div>
 </div>

 {/* Hotkeys — pointless on touch, hidden below md */}
 <div className="hidden md:block bg-surface rounded-xl shadow-sm border border-border">
 <div className="px-6 py-5">
 <div className="flex items-center justify-between mb-4">
 <div>
 <h2 className="text-sm font-semibold text-fg">Keyboard Shortcuts</h2>
 <p className="text-sm text-fg-muted mt-0.5">
 Click a shortcut to reassign it
 </p>
 </div>
 <button
 onClick={resetToDefaults}
 className="text-xs text-fg-subtle hover:text-fg-muted dark:hover:text-fg transition-colors"
 >
 Reset defaults
 </button>
 </div>
 <div className="space-y-6">
 {/* Navigation */}
 <div>
 <h3 className="text-xs font-semibold text-fg-subtle uppercase tracking-wider mb-3">Navigation</h3>
 <div className="space-y-3">
 <HotkeyInput label="Go to Dashboard" description="" bindingKey="goToDashboard" />
 <HotkeyInput label="Go to Focus" description="" bindingKey="goToFocus" />
 <HotkeyInput label="Go to Todos" description="" bindingKey="goToTodos" />
 <HotkeyInput label="Go to Projects" description="" bindingKey="goToProjects" />
 <HotkeyInput label="Go to People" description="" bindingKey="goToPeople" />
 <HotkeyInput label="Go to Meetings" description="" bindingKey="goToMeetings" />
 <HotkeyInput label="Go to Recently Done" description="" bindingKey="goToDone" />
 <HotkeyInput label="Open command palette" description="Global search and actions" bindingKey="openCommandPalette" />
 </div>
 </div>

 {/* Sidebars */}
 <div>
 <h3 className="text-xs font-semibold text-fg-subtle uppercase tracking-wider mb-3">Sidebars</h3>
 <div className="space-y-3">
 <HotkeyInput label="Toggle main sidebar" description="Navigation sidebar" bindingKey="toggleMainSidebar" />
 <HotkeyInput label="Toggle secondary sidebar" description="Projects / People panel" bindingKey="toggleSecondarySidebar" />
 </div>
 </div>

 {/* Creation */}
 <div>
 <h3 className="text-xs font-semibold text-fg-subtle uppercase tracking-wider mb-3">Creation</h3>
 <div className="space-y-3">
 <HotkeyInput label="New todo" description="Open new todo modal" bindingKey="newTodo" />
 <HotkeyInput label="New meeting note" description="Create and open a new note" bindingKey="newMeetingNote" />
 </div>
 </div>

 {/* Todo Actions */}
 <div>
 <h3 className="text-xs font-semibold text-fg-subtle uppercase tracking-wider mb-3">Todo Actions</h3>
 <div className="space-y-3">
 <HotkeyInput label="Mark done" description="Mark selected todo(s) as done" bindingKey="markDone" />
 <HotkeyInput label="Toggle focus" description="Add/remove selected todo(s) from focus" bindingKey="toggleFocus" />
 <HotkeyInput label="Edit todo" description="Open edit modal for selected todo" bindingKey="editTodo" />
 </div>
 </div>

 {/* View */}
 <div>
 <h3 className="text-xs font-semibold text-fg-subtle uppercase tracking-wider mb-3">View</h3>
 <div className="space-y-3">
 <HotkeyInput label="Toggle theme" description="Switch between light and dark mode" bindingKey="toggleTheme" />
 <HotkeyInput label="Focus search" description="Jump to search/filter input" bindingKey="focusSearch" />
 </div>
 </div>

 {/* Editor */}
 <div>
 <h3 className="text-xs font-semibold text-fg-subtle uppercase tracking-wider mb-3">Markdown Editor</h3>
 <div className="space-y-3">
 <HotkeyInput label="Insert todo" description="Insert - [ ] at cursor" bindingKey="editorInsertTodo" />
 <HotkeyInput label="Indent" description="Add leading indentation" bindingKey="editorIndent" />
 <HotkeyInput label="Un-indent" description="Remove leading indentation" bindingKey="editorUnindent" />
 </div>
 </div>

 {/* Selection */}
 <div>
 <h3 className="text-xs font-semibold text-fg-subtle uppercase tracking-wider mb-3">Selection &amp; General</h3>
 <div className="space-y-3">
 <HotkeyInput label="Select all" description="Select all visible todos" bindingKey="selectAll" />
 <HotkeyInput label="Escape" description="Close modal / clear selection / go back" bindingKey="escape" />
 </div>
 </div>
 </div>
 </div>
 </div>

 {/* Todo Defaults */}
 <div className="bg-surface rounded-xl shadow-sm border border-border">
 <div className="px-6 py-5">
 <h2 className="text-sm font-semibold text-fg">Todo Defaults</h2>
 <p className="text-sm text-fg-muted mt-0.5 mb-4">
 Pre-fill fields when creating new todos
 </p>

 <div className="space-y-4">
 {/* Default Assignee (stored by name so restores survive person id changes) */}
 <div className="flex items-center justify-between gap-4">
 <label className="text-sm text-fg shrink-0">
 Default assignee
 </label>
 <select
 value={defaults.assigneeName}
 onChange={(e) => updateField('assigneeName', e.target.value)}
 className="w-48 border border-border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
 >
 <option value="">None</option>
 {persons.map((p) => (
 <option key={p.id} value={p.name}>
 {p.name}
 </option>
 ))}
 {defaults.assigneeName && !persons.some((p) => p.name === defaults.assigneeName) && (
 <option value={defaults.assigneeName}>
 {defaults.assigneeName} (not found)
 </option>
 )}
 </select>
 </div>

 {/* Default Deadline to Today */}
 <div className="flex items-center justify-between gap-4">
 <label className="text-sm text-fg shrink-0">
 Auto-set deadline to today
 </label>
 <button
 onClick={() => updateField('deadlineToToday', !defaults.deadlineToToday)}
 className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
 defaults.deadlineToToday ? 'bg-accent' : 'bg-border dark:bg-inset'
 }`}
 >
 <span
 className={`inline-block h-4 w-4 rounded-full bg-white transition-transform ${
 defaults.deadlineToToday ? 'translate-x-6' : 'translate-x-1'
 }`}
 />
 </button>
 </div>

 {/* Default Estimated Hours */}
 <div className="flex items-center justify-between gap-4">
 <label className="text-sm text-fg shrink-0">
 Default estimated hours
 </label>
 <input
 type="number"
 min="0.25"
 step="0.25"
 value={defaults.estimatedHours}
 onChange={(e) => updateField('estimatedHours', e.target.value)}
 className="w-24 border border-border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
 />
 </div>

 {/* Default Importance */}
 <div className="flex items-center justify-between gap-4">
 <label className="text-sm text-fg shrink-0">
 Default importance
 </label>
 <select
 value={defaults.importance}
 onChange={(e) => updateField('importance', e.target.value)}
 className="w-48 border border-border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
 >
 {IMPORTANCE_OPTIONS.map((o) => (
 <option key={o} value={o}>
 {o.charAt(0).toUpperCase() + o.slice(1)}
 </option>
 ))}
 </select>
 </div>
 </div>
 </div>
 </div>
 </div>
 </div>
 )
}
