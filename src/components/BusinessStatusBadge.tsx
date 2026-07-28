import type { Prospect } from '../lib/database.types'
import { businessClosedLabel } from '../lib/domain'

export function BusinessStatusBadge({
  prospect: p,
  className = '',
}: {
  prospect: Prospect
  className?: string
}) {
  const label = businessClosedLabel(p)
  if (!label) return null

  return (
    <span
      className={`inline-block w-fit shrink-0 rounded-full bg-seal/12 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-seal ${className}`}
    >
      {label}
    </span>
  )
}
