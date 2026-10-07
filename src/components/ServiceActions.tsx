import { useEffect, useState, type FormEvent } from 'react'
import type { Prospect, ProspectUpdate } from '../lib/database.types'
import { todayISO } from '../lib/domain'
import { continuePatch, pixReceivedPatch, serviceState } from '../lib/service'
import { ServiceCloseModal } from './ServiceCloseModal'

type Props = {
  prospect: Prospect
  onUpdate: (id: string, patch: ProspectUpdate) => Promise<boolean>
  /** A ficha usa isto pra não fechar inteira com o Escape de um modal aberto por cima. */
  onModalChange?: (open: boolean) => void
}

const BTN = 'rounded-sm border border-rule px-3 py-1.5 font-mono text-[11px] hover:bg-card disabled:opacity-40'
const BTN_DANGER = 'rounded-sm border border-seal/40 px-3 py-1.5 font-mono text-[11px] text-seal hover:bg-seal/10'

/** Botões do ciclo do serviço, conforme o estado derivado do cliente. */
export function ServiceActions({ prospect: p, onUpdate, onModalChange }: Props) {
  const state = serviceState(p)
  const [fee, setFee] = useState(p.monthly_fee?.toString() ?? '')
  const [modal, setModal] = useState<'suspender' | 'encerrar' | null>(null)

  useEffect(() => {
    onModalChange?.(modal !== null)
  }, [modal, onModalChange])

  if (!state || state === 'encerrado') return null

  const feeValue = Number(fee)

  function handleContinue(e: FormEvent) {
    e.preventDefault()
    if (feeValue > 0) void onUpdate(p.id, continuePatch(p, feeValue))
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {state === 'suspenso' ? (
        <>
          <button type="button" className={BTN} onClick={() => void onUpdate(p.id, { suspended_at: null })}>
            Reativar
          </button>
          <p className="w-full font-mono text-[11px] text-muted">
            Site derrubado. Depois de reativar, rode o deploy de {p.slug ?? 'este cliente'} no
            agent-okaisites (workflow manual).
          </p>
        </>
      ) : (
        <>
          {p.paid_until === null ? (
            <form onSubmit={handleContinue} className="flex items-center gap-2">
              <input
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
                value={fee}
                onChange={(e) => setFee(e.target.value)}
                placeholder="Mensalidade (R$)"
                aria-label="Mensalidade (R$)"
                className="w-36 rounded-sm border border-rule bg-card px-2 py-1.5 text-sm"
              />
              <button type="submit" disabled={!(feeValue > 0)} className={BTN}>
                Vai continuar
              </button>
            </form>
          ) : (
            <button type="button" className={BTN} onClick={() => void onUpdate(p.id, pixReceivedPatch(p))}>
              Pix recebido
            </button>
          )}
          {(state === 'renovacao' || state === 'a_cobrar' || state === 'suspender') && (
            <button
              type="button"
              className={BTN}
              onClick={() => void onUpdate(p.id, { last_reminded_at: todayISO() })}
            >
              Lembrei o cliente
            </button>
          )}
          {state === 'suspender' && (
            <button type="button" className={BTN_DANGER} onClick={() => setModal('suspender')}>
              Suspender site
            </button>
          )}
        </>
      )}
      <button type="button" className={BTN_DANGER} onClick={() => setModal('encerrar')}>
        Encerrar cliente
      </button>

      {modal && (
        <ServiceCloseModal
          prospect={p}
          kind={modal}
          onConfirm={() =>
            onUpdate(p.id, modal === 'suspender' ? { suspended_at: todayISO() } : { service_ended_at: todayISO() })
          }
          onClose={() => setModal(null)}
        />
      )}
    </div>
  )
}
