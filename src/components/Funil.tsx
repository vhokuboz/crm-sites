import { useState } from 'react'
import type { OnUpdate } from '../lib/useProspects'
import type { Prospect, ProspectStatus } from '../lib/database.types'
import { ALL_STATUS, CLOSED, FUNNEL, STATUS_LABEL, readGap, relativeDay } from '../lib/domain'
import { BusinessStatusBadge } from './BusinessStatusBadge'
import { QuickActions } from './QuickActions'

type Props = {
  prospects: Prospect[]
  onUpdate: OnUpdate
  onOpen: (p: Prospect) => void
}

/** Mudar de coluna por qualquer caminho (arrastar ou seletor) passa por aqui. */
function moveTo(p: Prospect, status: ProspectStatus, onUpdate: OnUpdate) {
  if (p.status === status) return Promise.resolve(true)
  return onUpdate(p.id, { status }, `${p.name}: ${STATUS_LABEL[status]}`)
}

export function Funil({ prospects, onUpdate, onOpen }: Props) {
  const [dragging, setDragging] = useState<string | null>(null)
  const [over, setOver] = useState<ProspectStatus | null>(null)

  function drop(status: ProspectStatus) {
    const p = prospects.find((x) => x.id === dragging)
    if (p) void moveTo(p, status, onUpdate)
    setDragging(null)
    setOver(null)
  }

  const encerrados = prospects.filter((p) => CLOSED.includes(p.status))

  return (
    <div className="space-y-8">
      <p className="text-body text-muted">
        Arraste um card para mudar o status, ou use “Mover para” no próprio card.
      </p>

      {/* No celular cada coluna ocupa quase a tela e encaixa ao rolar. */}
      <div className="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-2 sm:snap-none sm:gap-4">
        {FUNNEL.map((status) => {
          const items = prospects.filter((p) => p.status === status)
          return (
            <section
              key={status}
              aria-label={`${STATUS_LABEL[status]}, ${items.length}`}
              onDragOver={(e) => {
                e.preventDefault()
                setOver(status)
              }}
              onDragLeave={() => setOver((s) => (s === status ? null : s))}
              onDrop={() => drop(status)}
              className={`flex min-h-40 w-[82vw] max-w-72 shrink-0 snap-start flex-col rounded-sm border p-2 transition-colors sm:w-72 sm:max-w-none ${
                over === status ? 'border-deep bg-stage-1' : 'border-rule bg-card/50'
              }`}
            >
              <div className="flex items-baseline justify-between px-1 pb-2">
                <h2 className="section-title">{STATUS_LABEL[status]}</h2>
                <span className="text-meta tabular-nums text-muted">{items.length}</span>
              </div>

              {items.length === 0 ? (
                <p className="grid flex-1 place-items-center rounded-sm border border-dashed border-rule px-3 py-6 text-center text-meta text-muted">
                  Nenhum card aqui. Solte um para mover.
                </p>
              ) : (
                <div className="space-y-2">
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
              )}
            </section>
          )
        })}
      </div>

      {encerrados.length > 0 && (
        <section>
          <h2 className="section-title">Encerrados</h2>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {encerrados.map((p) => (
              <button
                key={p.id}
                onClick={() => onOpen(p)}
                className="hit rounded-sm border border-rule bg-faded px-3 py-2.5 text-left"
              >
                <p className="truncate text-body text-ink">{p.name}</p>
                <p className="text-meta text-muted">{STATUS_LABEL[p.status]}</p>
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
  onUpdate: OnUpdate
  onDragStart: () => void
  onDragEnd: () => void
  dimmed: boolean
}) {
  const gap = readGap(p)
  // Segura mudancas repetidas enquanto a gravacao nao volta.
  const [busy, setBusy] = useState(false)

  async function change(status: ProspectStatus) {
    setBusy(true)
    await moveTo(p, status, onUpdate)
    setBusy(false)
  }

  return (
    <article
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className={`cursor-grab rounded-sm border border-rule bg-card p-3 active:cursor-grabbing ${
        dimmed ? 'opacity-40' : ''
      }`}
    >
      <button
        onClick={() => onOpen(p)}
        className="w-full break-words text-left text-name font-semibold tracking-tight hover:underline"
      >
        {p.name}
      </button>

      <p className="mt-1 flex flex-wrap items-center gap-x-2 text-meta text-muted">
        {p.segment && <span className="truncate">{p.segment}</span>}
        {p.next_action_at && <span>{relativeDay(p.next_action_at)}</span>}
      </p>

      <p className="mt-1.5 flex items-center gap-2 text-meta text-muted">
        {gap.reputation !== null && (
          <span className="shrink-0 text-gold-ink">★ {gap.reputation.toFixed(1)}</span>
        )}
        <span className="truncate">{gap.presenceLabel}</span>
      </p>

      <BusinessStatusBadge prospect={p} className="mt-1.5" />

      {p.status === 'refinamento' && p.revision_count > 0 && (
        <p className="mt-1 text-meta text-gold-ink">{p.revision_count + 1}ª rodada</p>
      )}

      {/* Arrastar não existe em touch nem por teclado: este seletor é o caminho de ambos. */}
      <label className="mt-2.5 block">
        <span className="text-meta text-muted">Mover para</span>
        <select
          value={p.status}
          disabled={busy}
          onChange={(e) => void change(e.target.value as ProspectStatus)}
          aria-label={`Mover para, ${p.name}`}
          className="mt-0.5 min-h-9 w-full rounded-sm border border-rule bg-paper px-2 text-body disabled:opacity-50"
        >
          {ALL_STATUS.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABEL[s]}
            </option>
          ))}
        </select>
      </label>

      <div className="mt-2.5">
        <QuickActions prospect={p} max={3} />
      </div>
    </article>
  )
}
