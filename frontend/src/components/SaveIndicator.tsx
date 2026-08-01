export type SaveState = 'idle' | 'saving' | 'unsaved' | 'saved'

export default function SaveIndicator({ state }: { state: SaveState }) {
 switch (state) {
 case 'saving':
 return <span className="text-xs text-fg-subtle">Saving...</span>
 case 'unsaved':
 return <span className="text-xs text-warning">Unsaved</span>
 case 'saved':
 return <span className="text-xs text-success">Saved</span>
 case 'idle':
 return null
 }
}
