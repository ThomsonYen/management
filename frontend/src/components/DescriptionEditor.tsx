import { useEffect, useRef, useState } from 'react'
import NoteEditor from './NoteEditor'
import { useDebouncedFn } from '../hooks/useDebouncedFn'

/**
 * A todo's description, edited where it is shown (same editor as notes).
 * Saves a moment after typing stops and when focus leaves; an empty
 * description is saved as null.
 */
export default function DescriptionEditor({
  value,
  onSave,
  readOnly = false,
  placeholder = 'Add a description…',
}: {
  value: string | null | undefined
  onSave: (description: string | null) => void
  readOnly?: boolean
  placeholder?: string
}) {
  const [draft, setDraft] = useState(value ?? '')
  // The last text we saved; the server echoing it back must not reset the draft.
  const sentRef = useRef(value ?? '')
  const onSaveRef = useRef(onSave)
  onSaveRef.current = onSave

  useEffect(() => {
    const next = value ?? ''
    if (next === sentRef.current) return
    sentRef.current = next
    setDraft(next)
  }, [value])

  const saver = useDebouncedFn(
    (md: string) => {
      if (md === sentRef.current) return
      sentRef.current = md
      onSaveRef.current(md.trim() ? md : null)
    },
    { idleMs: 800, maxMs: 4000 },
  )

  return (
    // Clicks stay here so they don't toggle or select the card around it.
    <div onClick={(e) => e.stopPropagation()} onBlur={() => saver.flush()}>
      <NoteEditor
        compact
        value={draft}
        onChange={(md) => {
          setDraft(md)
          saver.call(md)
        }}
        readOnly={readOnly}
        placeholder={readOnly ? '' : placeholder}
      />
    </div>
  )
}
