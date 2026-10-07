import type { Prospect, ProspectUpdate } from '../lib/database.types'
import { serviceQueue } from '../lib/service'
import { ClienteRow } from './ClienteRow'

type Props = {
  prospects: Prospect[]
  onUpdate: (id: string, patch: ProspectUpdate) => Promise<boolean>
  onOpen: (p: Prospect) => void
}

/** Fila de serviço do dia: suspensões pendentes, cobranças e renovações. Some quando não há nada. */
export function ServicoFila({ prospects, onUpdate, onOpen }: Props) {
  const queue = serviceQueue(prospects)
  if (queue.length === 0) return null

  return (
    <section>
      <div className="flex items-baseline gap-2">
        <h2 className="font-display text-lg font-semibold tracking-tight">Serviço</h2>
        <span className="font-mono text-xs text-seal">{queue.length}</span>
      </div>
      <p className="mt-1 text-[13px] text-muted">Suspensões pendentes, cobranças e renovações.</p>
      <div className="mt-3 grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
        {queue.map((p) => (
          <ClienteRow key={p.id} prospect={p} onUpdate={onUpdate} onOpen={onOpen} />
        ))}
      </div>
    </section>
  )
}
