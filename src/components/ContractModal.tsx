import { useState, type ChangeEvent, type FormEvent } from 'react'
import { CONTRACT_EXTRA_FIELDS, missingContractFields, type ContractFormValues } from '../lib/contract'
import type { Prospect } from '../lib/database.types'

type Props = {
  prospect: Prospect
  onSubmit: (file: File, form: ContractFormValues, save: boolean) => Promise<void>
  onClose: () => void
}

export function ContractModal({ prospect, onSubmit, onClose }: Props) {
  const fields = missingContractFields(prospect)
  const [file, setFile] = useState<File | null>(null)
  const [form, setForm] = useState<ContractFormValues>({})
  const [save, setSave] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null
    if (f && !f.name.toLowerCase().endsWith('.docx')) {
      setError('Selecione um arquivo .docx.')
      setFile(null)
      return
    }
    setError(null)
    setFile(f)
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!file) {
      setError('Selecione o arquivo do contrato (.docx).')
      return
    }
    setBusy(true)
    setError(null)
    try {
      await onSubmit(file, form, save)
      onClose()
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
        aria-label="Gerar contrato"
        className="w-full max-w-md rounded-sm border border-rule bg-paper p-6"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="eyebrow">Contrato</p>
            <h2 className="mt-1 font-display text-xl font-semibold tracking-tight">
              Gerar contrato de {prospect.name}
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

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <label className="block">
            <span className="eyebrow">Arquivo do contrato (.docx) *</span>
            <input
              type="file"
              accept=".docx"
              required
              onChange={handleFileChange}
              className="mt-1.5 w-full font-mono text-xs"
            />
          </label>

          {fields.map((key) => {
            const meta = CONTRACT_EXTRA_FIELDS.find((f) => f.key === key)!
            return (
              <label key={key} className="block">
                <span className="eyebrow">{meta.label}</span>
                <input
                  type="text"
                  value={form[key] ?? ''}
                  onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                  className="mt-1.5 w-full rounded-sm border border-rule bg-card px-3 py-2 font-mono text-xs"
                />
              </label>
            )
          })}

          {fields.length > 0 && (
            <label className="flex items-center gap-2 text-[13px]">
              <input type="checkbox" checked={save} onChange={(e) => setSave(e.target.checked)} />
              Salvar esses dados na ficha do cliente
            </label>
          )}

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
            {busy ? 'Gerando…' : 'Gerar contrato'}
          </button>
        </form>
      </div>
    </div>
  )
}
