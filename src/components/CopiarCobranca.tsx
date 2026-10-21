import { useState } from 'react'
import type { Prospect } from '../lib/database.types'
import type { OnUpdate } from '../lib/useProspects'
import { canCopyCobranca, cobrancaMessage, repeatPatch } from '../lib/queueActions'

/** Copia o follow-up para colar à mão no Instagram; não envia nada. Depois pergunta se registra a cobrança. */
export function CopiarCobranca({
  prospect: p,
  onUpdate,
  className,
}: {
  prospect: Prospect
  onUpdate: OnUpdate
  className: string
}) {
  const [copied, setCopied] = useState(false)
  if (!canCopyCobranca(p)) return null

  async function copy() {
    const text = cobrancaMessage(p)
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      window.alert('Não foi possível copiar a mensagem.')
      return
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 1800)
    if (window.confirm('Mensagem copiada. Marcar como enviado?'))
      await onUpdate(p.id, repeatPatch(p), 'Nova cobrança registrada')
  }

  return (
    <button type="button" onClick={copy} className={className}>
      {copied ? 'Copiado' : 'Copiar cobrança'}
    </button>
  )
}
