import { useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import type { Prospect } from '../lib/database.types'

type Props = {
  onCreated: (prospect: Prospect) => void
  onClose: () => void
}

/**
 * Chama a Edge Function `add-prospect`, que resolve nome/endereço/nota/site
 * via Places API a partir do link do Maps. Em erro HTTP o supabase-js devolve
 * o corpo só via `error.context` — sem isso a mensagem real (ex.: "link não
 * reconhecido") ficaria escondida atrás de um "Failed to send a request".
 */
async function invokeAddProspect(googleMapsUrl: string, instagramUrl: string) {
  const { data, error } = await supabase.functions.invoke<{ prospect: Prospect }>('add-prospect', {
    body: { googleMapsUrl: googleMapsUrl || undefined, instagramUrl: instagramUrl || undefined },
  })
  if (error) {
    const context = (error as { context?: Response }).context
    const body = await context?.json().catch(() => null)
    throw new Error(body?.error ?? error.message)
  }
  if (!data) throw new Error('Resposta vazia da function.')
  return data.prospect
}

export function AddProspectModal({ onCreated, onClose }: Props) {
  const [mapsUrl, setMapsUrl] = useState('')
  const [igUrl, setIgUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (!mapsUrl.trim() && !igUrl.trim()) {
      setError('Informe ao menos um link: Google Maps ou Instagram.')
      return
    }
    setBusy(true)
    try {
      const prospect = await invokeAddProspect(mapsUrl.trim(), igUrl.trim())
      onCreated(prospect)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink/25 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Novo prospect"
        className="w-full max-w-md rounded-sm border border-rule bg-paper p-6"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="eyebrow">Novo prospect</p>
            <h2 className="mt-1 font-display text-xl font-semibold tracking-tight">
              Por link do Maps
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-sm border border-rule px-2.5 py-1 font-mono text-[11px] hover:bg-card"
          >
            Fechar
          </button>
        </div>

        <p className="mt-2 text-[13px] leading-relaxed text-muted">
          Informe pelo menos um dos links. Quando o Google Maps é informado, nome, endereço,
          nota, avaliações, telefone e site vêm dele automaticamente. Segmento e problema
          ficam para revisar na ficha depois.
        </p>

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <label className="block">
            <span className="eyebrow">Link do Google Maps</span>
            <input
              type="url"
              autoFocus
              value={mapsUrl}
              onChange={(e) => setMapsUrl(e.target.value)}
              placeholder="https://maps.app.goo.gl/… ou o link da barra de endereço (opcional)"
              className="mt-1.5 w-full rounded-sm border border-rule bg-card px-3 py-2 font-mono text-xs placeholder:text-muted/70"
            />
          </label>

          <label className="block">
            <span className="eyebrow">Link do Instagram</span>
            <input
              type="url"
              value={igUrl}
              onChange={(e) => setIgUrl(e.target.value)}
              placeholder="https://instagram.com/perfil (opcional)"
              className="mt-1.5 w-full rounded-sm border border-rule bg-card px-3 py-2 font-mono text-xs placeholder:text-muted/70"
            />
          </label>

          {error && (
            <p role="alert" className="border-l-2 border-seal pl-3 text-sm text-seal">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-sm bg-ink px-4 py-2.5 font-display text-sm font-semibold text-paper transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {busy ? 'Buscando no Maps…' : 'Adicionar prospect'}
          </button>
        </form>
      </div>
    </div>
  )
}
