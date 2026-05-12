export type SaveState = 'idle' | 'saving' | 'unsaved' | 'saved'

export default function SaveIndicator({ state }: { state: SaveState }) {
  switch (state) {
    case 'saving':
      return <span className="text-xs text-slate-400">Saving...</span>
    case 'unsaved':
      return <span className="text-xs text-amber-500">Unsaved</span>
    case 'saved':
      return <span className="text-xs text-green-500">Saved</span>
    case 'idle':
      return null
  }
}
