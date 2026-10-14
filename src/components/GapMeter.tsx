import type { Prospect } from '../lib/database.types'
import { readGap } from '../lib/domain'

/**
 * O elemento central da interface.
 *
 * Duas hastes na mesma escala 0–5: reputacao (nota do Google) e presenca
 * digital (lida de website_quality). O espaco entre elas e literalmente o
 * argumento de venda -- bem avaliado e mal representado na internet.
 * Sem nota do Google nao ha lacuna a mostrar, entao o componente diz isso
 * em vez de estimar um numero.
 */
export function GapMeter({ prospect, compact = false }: { prospect: Prospect; compact?: boolean }) {
  const gap = readGap(prospect)
  const pct = (v: number) => `${(v / 5) * 100}%`

  return (
    <div className={compact ? 'space-y-2' : 'space-y-2.5'}>
      <Bar
        label="reputação"
        value={gap.reputation}
        color="bg-gold"
        note={
          gap.reputation === null
            ? 'sem nota'
            : `${gap.reputation.toFixed(1)}${
                prospect.google_reviews_count ? ` · ${prospect.google_reviews_count} avaliações` : ''
              }`
        }
        pct={pct}
      />
      <Bar
        label="presença"
        value={gap.presence}
        color="bg-deep"
        note={gap.presenceLabel}
        pct={pct}
      />

      {gap.size !== null && gap.size > 0 && !compact && (
        <p className="pt-0.5 font-mono text-xs text-muted">
          lacuna de{' '}
          <span className="font-semibold text-ink">{gap.size.toFixed(1)} pontos</span> entre o
          que dizem dele e o que ele mostra
        </p>
      )}
    </div>
  )
}

function Bar({
  label,
  value,
  color,
  note,
  pct,
}: {
  label: string
  value: number | null
  color: string
  note: string
  pct: (v: number) => string
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 text-xs text-muted">
        <span className="uppercase tracking-wider">{label}</span>
        <span className="truncate text-right">{note}</span>
      </div>
      <div className="mt-1 h-1.5 rounded-full bg-rule/70">
        {value !== null && (
          <div
            className={`h-full rounded-full ${color} transition-[width] duration-500`}
            style={{ width: pct(value) }}
          />
        )}
      </div>
    </div>
  )
}
