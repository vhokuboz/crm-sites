import type { OnUpdate } from '../lib/useProspects'
import type { Prospect } from '../lib/database.types'
import { serviceQueue } from '../lib/service'
import { ClienteRow } from './ClienteRow'
import { CardGrid, Section, useStoredOpen } from './Section'

type Props = {
  prospects: Prospect[]
  onUpdate: OnUpdate
  onOpen: (p: Prospect) => void
}

/** Fila de serviço do dia: suspensões pendentes, cobranças e renovações. Some quando não há nada. */
export function ServicoFila({ prospects, onUpdate, onOpen }: Props) {
  const queue = serviceQueue(prospects)
  const [open, toggle] = useStoredOpen('servico', true)
  if (queue.length === 0) return null

  return (
    <Section
      title="Serviço"
      count={queue.length}
      open={open}
      onToggle={toggle}
      hint="Suspensões pendentes, cobranças e renovações."
      urgent
    >
      <CardGrid>
        {queue.map((p) => (
          <ClienteRow key={p.id} prospect={p} onUpdate={onUpdate} onOpen={onOpen} />
        ))}
      </CardGrid>
    </Section>
  )
}
