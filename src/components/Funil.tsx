import { useState } from 'react'
import type { Prospect, ProspectStatus, ProspectUpdate } from '../lib/database.types'
import { ALL_STATUS, CLOSED, FUNNEL, STATUS_LABEL, readGap, relativeDay } from '../lib/domain'
import { BusinessStatusBadge } from './BusinessStatusBadge'
import { QuickActions } from './QuickActions'

type Props = {
  prospects: Prospect[]
  onUpdate: (id: string, patch: ProspectUpdate) => Promise<boolean>
  onOpen: (p: Prospect) => void
}

export function Funil({ prospects, onUpdate, onOpen }: Props) {
  const [dragging, setDragging] = useState<string | null>(null)
  const [over, setOver] = useState<ProspectStatus | null>(null)

  function drop(status: ProspectStatus) {
    if (dragging) void onUpdate(dragging, { status })
    setDragging(null)
    setOver(null)
  }

  const encerrados = prospects.filter((p) => CLOSED.includes(p.status))

  return (
    <div className="space-y-8">
      <p className="text-[13px] text-muted">
        Arraste um card para mudar o status, ou use o seletor no próprio card.
      </p>

      <div className="flex gap-4 overflow-x-auto pb-2">
        {FUNNEL.map((status) => {
          const items = prospects.filter((p) => p.status === status)
          return (
            <div
              key={status}
              onDragOver={(e) => {
                e.preventDefault()
                setOver(status)
              }}
              onDragLeave={() => setOver((s) => (s === status ? null : s))}
              onDrop={() => drop(status)}
              className={`flex min-h-40 w-64 shrink-0 flex-col rounded-sm border p-2 transition-colors ${
                over === status ? 'border-deep bg-deep/5' : 'border-rule bg-card/50'
              }`}
            >
              <div className="flex items-baseline justify-between px-1 pb-2">
                <h2 className="font-mono text-[11px] uppercase tracking-wider text-muted">
                  {STATUS_LABEL[status]}
                </h2>
                <span className="font-mono text-[11px] tabular-nums text-muted">
                  {items.length}
                </span>
              </div>

              <div className="space-y-1.5">
                {items.map((p) => (
                  <Card
                    key={p.id}
                    prospect={p}
                    onOpen={onOpen}
                    onUpdate={onUpdate}
                    onDragStart={() => setDragging(p.id)}
                    onDragEnd={() => setDragging(null)}
                    dimmed={dragging === p.id}
                  />
                ))}
              </div>
            </div>
          )
        })}
      </div>

      {encerrados.length > 0 && (
        <section>
          <h2 className="eyebrow">Encerrados</h2>
          <div className="mt-3 grid gap-1.5 sm:grid-cols-2 lg:grid-cols-4">
            {encerrados.map((p) => (
              <button
                key={p.id}
                onClick={() => onOpen(p)}
                className="rounded-sm border border-rule bg-card/40 px-3 py-2 text-left"
              >
                <p className="truncate text-[13px] text-muted line-through">{p.name}</p>
                <p className="font-mono text-[10px] uppercase tracking-wider text-muted">
                  {STATUS_LABEL[p.status]}
                </p>
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

function Card({
  prospect: p,
  onOpen,
  onUpdate,
  onDragStart,
  onDragEnd,
  dimmed,
}: {
  prospect: Prospect
  onOpen: (p: Prospect) => void
  onUpdate: (id: string, patch: ProspectUpdate) => Promise<boolean>
  onDragStart: () => void
  onDragEnd: () => void
  dimmed: boolean
}) {
  const gap = readGap(p)

  return (
    <article
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className={`cursor-grab rounded-sm border border-rule bg-card p-2.5 active:cursor-grabbing ${
        dimmed ? 'opacity-40' : ''
      }`}
    >
      <button
        onClick={() => onOpen(p)}
        className="w-full text-left font-display text-[13px] font-semibold leading-snug tracking-tight hover:underline"
      >
        {p.name}
      </button>

      <div className="mt-1.5 flex items-center gap-1.5 font-mono text-[10px] text-muted">
        {gap.reputation !== null && (
          <span className="text-gold">★ {gap.reputation.toFixed(1)}</span>
        )}
        <span className="truncate">{gap.presenceLabel}</span>
      </div>

      <BusinessStatusBadge prospect={p} className="mt-1.5" />

      {p.status === 'refinamento' && p.revision_count > 0 && (
        <p className="mt-1 font-mono text-[10px] text-gold">{p.revision_count + 1}ª rodada</p>
      )}

      {p.next_action_at && (
        <p className="mt-1 font-mono text-[10px] text-muted">{relativeDay(p.next_action_at)}</p>
      )}

      {/* Arrastar não existe em touch: este seletor é o jeito de mudar de coluna no celular. */}
      <select
        value={p.status}
        onChange={(e) => void onUpdate(p.id, { status: e.target.value as ProspectStatus })}
        aria-label={`Mudar status de ${p.name}`}
        className="mt-2 w-full rounded-sm border border-rule bg-paper px-1.5 py-1 font-mono text-[10px] text-muted"
      >
        {ALL_STATUS.map((s) => (
          <option key={s} value={s}>
            {STATUS_LABEL[s]}
          </option>
        ))}
      </select>

      <div className="mt-2">
        <QuickActions prospect={p} bare />
      </div>
    </article>
  )
}
