import { Badge, PageHeader } from '../components/ui'
import { cn } from '../components/ui/cn'
import TodoCard from '../components/TodoCard'
import type { Todo } from '../types'
import { importanceBadgeClass } from '../utils/badgeClasses'
import { PROJECT_IMPORTANCE_DOT, PROJECT_IMPORTANCE_TEXT } from '../utils/projects'

// Scratch page for trying visual treatments before they go into the theme.
// Not in the nav; open /demo directly. Current experiment: the colour for
// critical projects and todos.

type Variant = {
  key: string
  name: string
  note: string
  // Token variants use the old prio-critical utilities with the token overridden on
  // the wrapper; gradient variants use the demo-grad-* classes below; 'live' is
  // what the app ships (Badge, importanceBadgeClass, project dot/text, board ring).
  kind: 'token' | 'gradient' | 'live'
}

const VARIANTS: Variant[] = [
  { key: 'live', name: 'Aurora (live)', note: 'What the app now uses: the real classes, including a native <select> chip.', kind: 'live' },
  { key: 'current', name: 'Previous', note: "The theme's magenta-pink, for comparison.", kind: 'token' },
  { key: 'purple', name: 'Purple', note: 'One violet token. Drop-in: changes only the theme values.', kind: 'token' },
  { key: 'gemini', name: 'Gemini gradient', note: 'Blue → purple → rose.', kind: 'gradient' },
]

const DEMO_CSS = `
.demo-purple { --prio-critical: 124 58 237; --prio-critical-bg: 245 243 255; }
.dark .demo-purple { --prio-critical: 167 139 250; --prio-critical-bg: 46 27 84; }

.demo-gemini { --g: linear-gradient(90deg, #4285f4, #9b72cb, #d96570); --g-mid: #9b72cb; }
.dark .demo-gemini { --g: linear-gradient(90deg, #6ea0ff, #b48ce6, #f08a94); --g-mid: #b48ce6; }
.demo-aurora { --g: linear-gradient(90deg, #7c3aed, #db2777, #f59e0b); --g-mid: #db2777; }
.dark .demo-aurora { --g: linear-gradient(90deg, #a78bfa, #f472b6, #fbbf24); --g-mid: #f472b6; }

.demo-grad-text { background-image: var(--g); -webkit-background-clip: text; background-clip: text; color: transparent; }
.demo-grad-fill { background-image: var(--g); }
.demo-grad-solid { background-image: var(--g); color: #fff; border-color: transparent; }
.demo-grad-soft {
  border-color: transparent;
  background:
    linear-gradient(color-mix(in srgb, var(--g-mid) 12%, rgb(var(--bg-surface))),
                    color-mix(in srgb, var(--g-mid) 12%, rgb(var(--bg-surface)))) padding-box,
    var(--g) border-box;
}
.demo-grad-outline {
  border-color: transparent;
  background: linear-gradient(rgb(var(--bg-surface)), rgb(var(--bg-surface))) padding-box, var(--g) border-box;
}
.demo-grad-ring {
  border: 2px solid transparent;
  background: linear-gradient(rgb(var(--bg-surface)), rgb(var(--bg-surface))) padding-box, var(--g) border-box;
}
`

const pill = 'inline-flex items-center rounded-full font-medium border whitespace-nowrap text-xs h-5 px-2.5'
// Same classes as the importance chip on TodoCard
const todoChip = 'text-[10px] font-bold px-1.5 rounded border uppercase tracking-wide'

function LiveSwatches() {
  return (
    <div className="space-y-2.5">
      <Row name="Badges">
        <Badge tone="critical" variant="soft">critical</Badge>
        <Badge tone="critical" variant="solid">critical</Badge>
        <Badge tone="critical" variant="outline">critical</Badge>
        <Badge tone="high" variant="soft">high</Badge>
      </Row>
      <Row name="Select chip">
        <select
          defaultValue="critical"
          className={cn('text-xs font-bold px-2 py-0.5 rounded-full border uppercase tracking-wide', importanceBadgeClass('critical'))}
        >
          {['low', 'medium', 'high', 'critical'].map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
        <span className={cn(todoChip, importanceBadgeClass('critical'))}>critical</span>
      </Row>
      <Row name="Project">
        <span className="flex items-center gap-2 text-sm">
          <span className={cn('w-2.5 h-2.5 rounded-full shrink-0', PROJECT_IMPORTANCE_DOT.critical)} />
          <span className={cn('font-medium', PROJECT_IMPORTANCE_TEXT.critical)}>MBABenchV2</span>
        </span>
      </Row>
      <Row name="Board card">
        <div className="prio-critical-ring rounded-lg border border-border bg-surface px-3 py-2 text-sm text-fg w-44">
          Arxiv WebIB
          <div className="text-2xs text-fg-subtle mt-0.5">due Mon · 2.25h</div>
        </div>
      </Row>
    </div>
  )
}

function Row({ name, children }: { name: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 min-h-[28px]">
      <span className="text-2xs uppercase tracking-wide text-fg-subtle w-24 shrink-0">{name}</span>
      <div className="flex items-center gap-2 flex-wrap min-w-0">{children}</div>
    </div>
  )
}

function Swatches({ v }: { v: Variant }) {
  if (v.kind === 'live') return <LiveSwatches />
  const g = v.kind === 'gradient'
  return (
    <div className="space-y-2.5">
      <Row name="Badges">
        {g ? (
          <>
            <span className={cn(pill, 'demo-grad-soft')}><span className="demo-grad-text">critical</span></span>
            <span className={cn(pill, 'demo-grad-solid')}>critical</span>
            <span className={cn(pill, 'demo-grad-outline')}><span className="demo-grad-text">critical</span></span>
          </>
        ) : (
          <>
            <span className={cn(pill, 'bg-prio-critical-bg text-prio-critical border-prio-critical/30')}>critical</span>
            <span className={cn(pill, 'bg-prio-critical text-white dark:text-app border-transparent')}>critical</span>
            <span className={cn(pill, 'text-prio-critical border-prio-critical/40')}>critical</span>
          </>
        )}
        <Badge tone="high" variant="soft">high</Badge>
      </Row>

      <Row name="Project">
        <span className="flex items-center gap-2 text-sm">
          <span className={cn('w-2.5 h-2.5 rounded-full shrink-0', g ? 'demo-grad-fill' : 'bg-prio-critical')} />
          <span className={cn('font-medium', g ? 'demo-grad-text' : 'text-prio-critical')}>MBABenchV2</span>
        </span>
        <span className="flex items-center gap-2 text-sm">
          <span className="w-2.5 h-2.5 rounded-full shrink-0 bg-prio-high" />
          <span className="font-medium text-prio-high">SeqBench</span>
        </span>
      </Row>

      <Row name="Todo row">
        <div className="relative flex items-center gap-2 w-full max-w-sm bg-surface border border-border rounded-md pl-3.5 pr-2.5 py-1.5 overflow-hidden">
          <span className={cn('absolute left-0 inset-y-0 w-[3px]', g ? 'demo-grad-fill' : 'bg-prio-critical')} />
          <span className="w-4 h-4 rounded-full border border-border-strong shrink-0" />
          <span className="text-sm text-fg truncate flex-1">Submit SeqK</span>
          {g ? (
            <span className={cn(todoChip, 'demo-grad-soft')}><span className="demo-grad-text">critical</span></span>
          ) : (
            <span className={cn(todoChip, 'bg-prio-critical-bg text-prio-critical border-prio-critical/30')}>critical</span>
          )}
        </div>
      </Row>

      <Row name="Board card">
        <div className={cn(
          'rounded-lg px-3 py-2 text-sm text-fg w-44',
          g ? 'demo-grad-ring' : 'bg-surface border border-border ring-2 ring-prio-critical/40',
        )}>
          Arxiv WebIB
          <div className="text-2xs text-fg-subtle mt-0.5">due Mon · 2.25h</div>
        </div>
      </Row>
    </div>
  )
}

const SAMPLE_TODO = {
  id: -1, title: 'Submit SeqK', description: null, project_id: null, project_name: 'SeqBench',
  assignee_id: null, assignee_name: null, deadline: null, importance: 'critical', estimated_hours: 3,
  status: 'todo', is_blocked: false, is_focused: true, focus_order: 0, created_at: '2026-11-22T00:00:00Z',
  done_at: null, deleted_at: null, subtodos: [], blocked_by_ids: [], is_followup: false, followup_since: null,
  check_back_on: null, waiting_days: null, check_back_due: false, is_keep_in_mind: false, keep_in_mind_since: null,
} as unknown as Todo

// Real TodoCards with fake todos (no ids that exist, so stray clicks can't change anything real)
function CardSamples() {
  const cards: Array<[string, Partial<Todo>]> = [
    ['Submit SeqK', { importance: 'critical' }],
    ['Arxiv WebIB', { id: -2, importance: 'high' } as Partial<Todo>],
    ['Expense', { id: -3, importance: 'medium' } as Partial<Todo>],
  ]
  return (
    <div className="grid gap-4 md:grid-cols-2 mt-4">
      {[true, false].map((compact) => (
        <section key={String(compact)} className="space-y-2">
          <h2 className="text-sm font-semibold text-fg m-0">{compact ? 'Focus list cards' : 'Todo cards'}</h2>
          {cards.map(([title, over]) => (
            <TodoCard key={title} compact={compact} todo={{ ...SAMPLE_TODO, ...over, title } as Todo} onEdit={() => {}} />
          ))}
        </section>
      ))}
    </div>
  )
}

export default function DemoPage() {
  return (
    <div className="max-w-4xl mx-auto">
      <style>{DEMO_CSS}</style>
      <PageHeader title="Demo" description="Critical-priority colour: the live Aurora gradient and the other candidates. Toggle light/dark in Settings to compare both." />
      <div className="grid gap-4 md:grid-cols-2">
        {VARIANTS.map((v) => (
          <section key={v.key} className={cn('bg-surface border border-border rounded-lg p-4', `demo-${v.key}`)}>
            <h2 className="text-sm font-semibold text-fg m-0">{v.name}</h2>
            <p className="text-xs text-fg-muted mt-0.5 mb-3">{v.note}</p>
            <Swatches v={v} />
          </section>
        ))}
      </div>
      <CardSamples />
    </div>
  )
}
