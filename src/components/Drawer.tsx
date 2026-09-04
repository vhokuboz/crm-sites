import { useEffect, useRef, useState } from 'react'
import type { Prospect, ProspectStatus, ProspectUpdate } from '../lib/database.types'
import {
  ALL_STATUS,
  CONTRACT_ELIGIBLE_STATUS,
  RISK_LABEL,
  RISK_TONE,
  STATUS_LABEL,
  addBusinessDaysISO,
  addDaysISO,
  facebookHandle,
  facebookUrl,
  formatDateBR,
  formatWhatsapp,
  inactivityRisk,
  instagramHandle,
  instagramUrl,
  lastSocialActivityLabel,
  linkBioUrl,
  parsePhones,
  prototypeUrl,
  readEmail,
  websiteUrl,
  whatsappUrl,
} from '../lib/domain'
import { buildContractFieldMap, type ContractFormValues } from '../lib/contract'
import { supabase } from '../lib/supabase'
import { BusinessStatusBadge } from './BusinessStatusBadge'
import { ContractModal } from './ContractModal'
import { GapMeter } from './GapMeter'
import { ImagePreviewModal } from './ImagePreviewModal'
import { FacebookIcon, GlobeIcon, InstagramIcon, LinkIcon, QuickActions, WhatsAppIcon } from './QuickActions'

type Props = {
  prospect: Prospect
  onUpdate: (id: string, patch: ProspectUpdate) => Promise<boolean>
  onReload: () => Promise<void>
  onClose: () => void
}

// whatsapp fica de fora: já tem seu próprio lugar na seção Contato.
type SocialFieldKey = 'instagram' | 'website' | 'facebook' | 'link_bio'

const SOCIAL_FIELDS: { key: SocialFieldKey; label: string; placeholder: string }[] = [
  { key: 'instagram', label: 'Instagram', placeholder: '@perfil' },
  { key: 'website', label: 'Site', placeholder: 'https://cliente.com.br' },
  { key: 'facebook', label: 'Facebook', placeholder: 'facebook.com/pagina' },
  { key: 'link_bio', label: 'Link na bio', placeholder: 'linktr.ee/perfil' },
]

type SocialDraft = { field: SocialFieldKey; value: string }

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}…` : text
}

/**
 * Preenchimento manual só entra com o essencial (arroba, handle, domínio) --
 * normaliza pra URL completa aqui, reusando os mesmos parsers que já leem o
 * texto livre vindo da prospecção.
 */
function normalizeSocialValue(field: SocialFieldKey, value: string): string {
  switch (field) {
    case 'instagram': {
      const parsed = instagramUrl(value)
      if (parsed) return parsed
      // Não reconheceu "@handle" nem "instagram.com/handle": se já é um link
      // (ex. link de compartilhamento sem handle no formato usual), mantém
      // como veio -- prefixar por cima geraria uma URL duplicada quebrada.
      if (/^https?:\/\//i.test(value)) return value
      return `https://instagram.com/${value.replace(/^@/, '')}`
    }
    case 'facebook':
      return facebookUrl(value) ?? value
    case 'link_bio':
      return linkBioUrl(value) ?? value
    case 'website':
      return websiteUrl(value) ?? value
  }
}

export function Drawer({ prospect: p, onUpdate, onReload, onClose }: Props) {
  const panel = useRef<HTMLDivElement>(null)
  const [notes, setNotes] = useState(p.notes ?? '')
  const [approach, setApproach] = useState(p.approach_message ?? '')
  const [email, setEmail] = useState(p.email ?? '')
  const [landing, setLanding] = useState(p.landing_page_url ?? '')
  const [whatsapp, setWhatsapp] = useState(p.whatsapp ?? '')
  const [editingWhatsapp, setEditingWhatsapp] = useState(false)
  const [status, setStatus] = useState(p.status)
  const [nextAction, setNextAction] = useState(p.next_action_at ?? '')
  const [dealValue, setDealValue] = useState(p.deal_value?.toString() ?? '')
  const [docsReceived, setDocsReceived] = useState(p.docs_received)
  const [depositPaidAmount, setDepositPaidAmount] = useState(
    p.deposit_paid_amount?.toString() ?? '',
  )
  const [finalPaidAmount, setFinalPaidAmount] = useState(p.final_paid_amount?.toString() ?? '')
  const [saved, setSaved] = useState(false)
  const [previewIndex, setPreviewIndex] = useState<number | null>(null)
  const [socialDrafts, setSocialDrafts] = useState<SocialDraft[]>([])
  const [editingSocial, setEditingSocial] = useState<Partial<Record<SocialFieldKey, string>>>({})
  const [contractModalOpen, setContractModalOpen] = useState(false)
  const [downloadingContract, setDownloadingContract] = useState(false)
  const [contractError, setContractError] = useState<string | null>(null)

  // Só reseta o rascunho inteiro ao trocar de prospect (drawer aberto pra
  // outra ficha) -- nunca em resposta a um campo de p.* mudando por baixo
  // (ex. "Cobrei de novo" fazendo onUpdate direto), senão qualquer digitação
  // não salva em notes/approach/etc. some silenciosamente.
  useEffect(() => {
    setNotes(p.notes ?? '')
    setApproach(p.approach_message ?? '')
    setEmail(p.email ?? '')
    setLanding(p.landing_page_url ?? '')
    setWhatsapp(p.whatsapp ?? '')
    setEditingWhatsapp(false)
    setStatus(p.status)
    setNextAction(p.next_action_at ?? '')
    setDealValue(p.deal_value?.toString() ?? '')
    setDocsReceived(p.docs_received)
    setDepositPaidAmount(p.deposit_paid_amount?.toString() ?? '')
    setFinalPaidAmount(p.final_paid_amount?.toString() ?? '')
    setSocialDrafts([])
    setEditingSocial({})
  }, [p.id])

  // "Cobrei de novo" atualiza p.next_action_at direto (sem passar pelo Salvar),
  // então esse campo precisa continuar refletindo o valor persistido -- sem
  // arrastar o resto do rascunho junto, ao contrário do efeito acima.
  useEffect(() => {
    setNextAction(p.next_action_at ?? '')
  }, [p.next_action_at])

  // Com o ImagePreviewModal ou o ContractModal abertos por cima, o Escape deles
  // tem que fechar só o modal -- não borbulhar pra cá e fechar a ficha inteira
  // no meio de uma geração de contrato ou de uma navegação de preview.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && previewIndex === null && !contractModalOpen) onClose()
    }
    document.addEventListener('keydown', onKey)
    panel.current?.focus()
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose, previewIndex, contractModalOpen])

  // Sem isso, no mobile a rolagem da tela por baixo do drawer (que é só
  // `position: fixed`) faz o Safari/Chrome tratar a ficha como parte do
  // documento durante o rubber-band, e ela balança pros lados junto com o
  // bounce elástico da página. Travar o scroll do body enquanto o drawer
  // está aberto remove esse documento "de baixo" da equação.
  useEffect(() => {
    const { overflow } = document.body.style
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = overflow
    }
  }, [])

  const dirty =
    notes !== (p.notes ?? '') ||
    approach !== (p.approach_message ?? '') ||
    email !== (p.email ?? '') ||
    landing !== (p.landing_page_url ?? '') ||
    whatsapp !== (p.whatsapp ?? '') ||
    status !== p.status ||
    nextAction !== (p.next_action_at ?? '') ||
    dealValue !== (p.deal_value?.toString() ?? '') ||
    docsReceived !== p.docs_received ||
    depositPaidAmount !== (p.deposit_paid_amount?.toString() ?? '') ||
    finalPaidAmount !== (p.final_paid_amount?.toString() ?? '') ||
    socialDrafts.some((d) => d.value.trim()) ||
    Object.keys(editingSocial).length > 0

  // Campos de rede social ainda vazios no prospect e não escolhidos em outra
  // linha de rascunho -- são as opções que sobram pro select de cada linha.
  const emptySocialFields = SOCIAL_FIELDS.filter((f) => !p[f.key])
  const usedSocialFields = new Set(socialDrafts.map((d) => d.field))
  const remainingSocialFields = emptySocialFields.filter((f) => !usedSocialFields.has(f.key))

  function optionsForSocialRow(index: number) {
    const usedByOthers = new Set(socialDrafts.filter((_, i) => i !== index).map((d) => d.field))
    return emptySocialFields.filter((f) => !usedByOthers.has(f.key))
  }

  function addSocialDraft() {
    if (remainingSocialFields.length === 0) return
    setSocialDrafts((rows) => [...rows, { field: remainingSocialFields[0].key, value: '' }])
  }

  function updateSocialDraftField(index: number, field: SocialFieldKey) {
    setSocialDrafts((rows) => rows.map((r, i) => (i === index ? { ...r, field } : r)))
  }

  function updateSocialDraftValue(index: number, value: string) {
    setSocialDrafts((rows) => rows.map((r, i) => (i === index ? { ...r, value } : r)))
  }

  function removeSocialDraft(index: number) {
    setSocialDrafts((rows) => rows.filter((_, i) => i !== index))
  }

  function startEditingSocial(field: SocialFieldKey, seed: string) {
    setEditingSocial((m) => ({ ...m, [field]: seed }))
  }

  function updateEditingSocial(field: SocialFieldKey, value: string) {
    setEditingSocial((m) => ({ ...m, [field]: value }))
  }

  function cancelEditingSocial(field: SocialFieldKey) {
    setEditingSocial((m) => {
      const next = { ...m }
      delete next[field]
      return next
    })
  }

  async function handleDownloadContract() {
    setDownloadingContract(true)
    setContractError(null)
    const { data, error } = await supabase.storage.from('contracts').createSignedUrl(`${p.id}.pdf`, 60)
    setDownloadingContract(false)
    if (error || !data) {
      setContractError(`Não foi possível baixar o contrato: ${error?.message ?? 'erro desconhecido'}`)
      return
    }
    // window.open depois de um await perde o gesto do usuário -- Safari bloqueia
    // o popup direto e Chrome é inconsistente. Um link clicado via JS não passa
    // pelo bloqueador de popup.
    const link = document.createElement('a')
    link.href = data.signedUrl
    link.target = '_blank'
    link.rel = 'noopener'
    link.click()
  }

  async function handleGenerateContract(file: File, form: ContractFormValues, save: boolean) {
    const body = new FormData()
    body.append('file', file)
    body.append('prospect_id', p.id)
    body.append('fields', JSON.stringify(buildContractFieldMap(p, form)))
    // No caminho mais comum (Refazer contrato, os 4 campos já salvos) form vem
    // vazio -- não faz sentido mandar save=true nem save_fields="{}" pro Edge
    // Function rodar um update({}) inútil em prospects.
    const saveFields = Object.fromEntries(
      Object.entries(form).filter(([, value]) => value?.trim()),
    )
    const shouldSave = save && Object.keys(saveFields).length > 0
    body.append('save', String(shouldSave))
    if (shouldSave) {
      body.append('save_fields', JSON.stringify(saveFields))
    }

    const { error } = await supabase.functions.invoke('generate-contract', { body })
    if (error) {
      const context = (error as { context?: Response }).context
      const errBody = await context?.json().catch(() => null)
      throw new Error(errBody?.error ?? error.message)
    }
    await onReload()
  }

  async function saveText() {
    const patch: ProspectUpdate = {
      notes: notes || null,
      approach_message: approach || null,
      email: email.trim() || null,
      landing_page_url: landing.trim() || null,
      whatsapp: whatsapp.trim() || null,
      status,
      next_action_at: nextAction || null,
      deal_value: dealValue.trim() ? Number(dealValue) : null,
      docs_received: docsReceived,
      deposit_paid_amount: depositPaidAmount.trim() ? Number(depositPaidAmount) : null,
      final_paid_amount: finalPaidAmount.trim() ? Number(finalPaidAmount) : null,
    }
    for (const d of socialDrafts) {
      const value = d.value.trim()
      if (value) patch[d.field] = normalizeSocialValue(d.field, value)
    }
    for (const [field, value] of Object.entries(editingSocial) as [SocialFieldKey, string][]) {
      const trimmed = value.trim()
      patch[field] = trimmed ? normalizeSocialValue(field, trimmed) : null
    }
    // Registrar o protótipo é o próprio ato de sair de "novo": quem tem página
    // publicada já está pronto para a abordagem, e reclassificar na mão seria
    // uma segunda etapa fácil de esquecer.
    if (patch.landing_page_url && status === 'novo') patch.status = 'prototipado'
    // Mesma ideia: documentos + sinal recebidos é o próprio sinal de que dá
    // pra começar o refinamento. Pagamento final registrado fecha o card.
    if (
      status === 'aguardando_pendencias' &&
      patch.docs_received &&
      patch.deposit_paid_amount &&
      (patch.docs_received !== p.docs_received || patch.deposit_paid_amount !== p.deposit_paid_amount)
    ) {
      patch.status = 'refinamento'
    }
    if (
      status === 'aguardando_pagamento' &&
      patch.final_paid_amount &&
      patch.final_paid_amount !== p.final_paid_amount
    ) {
      patch.status = 'finalizado'
    }

    const ok = await onUpdate(p.id, patch)
    if (ok) {
      setSaved(true)
      setSocialDrafts([])
      setEditingSocial({})
      setEditingWhatsapp(false)
      setTimeout(() => setSaved(false), 1800)
    }
  }

  const wa = whatsappUrl(p, p.approach_message)
  const ig = instagramUrl(p.instagram)
  const site = websiteUrl(p.website)
  const fb = facebookUrl(p.facebook)
  const bio = linkBioUrl(p.link_bio)
  const proto = prototypeUrl(p)
  const mail = readEmail(p)
  // Celular e whatsapp costumam ser o mesmo numero -- com whatsapp cadastrado,
  // ele já cobre o celular, então some da lista pra não duplicar a informação.
  const phones = parsePhones(p.contact).filter((ph) => !p.whatsapp || !ph.isMobile)
  const lastActivity = lastSocialActivityLabel(p)
  const risk = inactivityRisk(p)

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div
        className="absolute inset-0 bg-ink/25"
        onClick={onClose}
        aria-hidden
      />

      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={`Ficha de ${p.name}`}
        tabIndex={-1}
        className="relative flex h-full w-full max-w-lg flex-col overflow-y-auto border-l border-rule bg-paper"
      >
        <header className="sticky top-0 z-10 border-b border-rule bg-paper/95 px-4 py-4 backdrop-blur sm:px-6">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="eyebrow">{p.segment} · {p.city}</p>
              <h2 className="mt-1 font-display text-2xl font-semibold leading-tight tracking-tight">
                {p.name}
                {lastActivity && (
                  <span
                    className={`ml-1.5 font-mono text-sm font-normal ${risk ? RISK_TONE[risk] : 'text-muted'}`}
                    title={`Última atividade social: ${lastActivity}${risk ? ` · ${RISK_LABEL[risk]}` : ''}`}
                  >
                    · {lastActivity}
                  </span>
                )}
              </h2>
              <BusinessStatusBadge prospect={p} className="mt-1.5" />
            </div>
            <button
              onClick={onClose}
              className="shrink-0 rounded-sm border border-rule px-2.5 py-1 font-mono text-[11px] hover:bg-card"
            >
              Fechar
            </button>
          </div>

          <div className="mt-3">
            <QuickActions prospect={p} size="md" />
          </div>
        </header>

        <div className="space-y-7 px-4 py-6 sm:px-6">
          <section>
            <h3 className="eyebrow">Lacuna digital</h3>
            <div className="mt-3 rounded-sm border border-rule bg-card p-4">
              <GapMeter prospect={p} />
            </div>
          </section>

          <section className="grid grid-cols-2 gap-4">
            <Field label="Status">
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as ProspectStatus)}
                className="w-full rounded-sm border border-rule bg-card px-2.5 py-1.5 font-mono text-xs"
              >
                {ALL_STATUS.map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABEL[s]}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Próxima ação">
              <DateField value={nextAction} onChange={setNextAction} />
            </Field>
          </section>

          {(p.status === 'contatado' || p.status === 'aguardando_pendencias') && (
            <section>
              <h3 className="eyebrow">Cobrei de novo</h3>
              <button
                type="button"
                onClick={() => {
                  if (p.status === 'contatado') {
                    void onUpdate(p.id, {
                      next_action_at: addBusinessDaysISO(3),
                      contact_attempts: p.contact_attempts + 1,
                    })
                  } else {
                    void onUpdate(p.id, { next_action_at: addDaysISO(2) })
                  }
                }}
                className="rounded-sm border border-rule px-3 py-1.5 font-mono text-[11px] hover:bg-card"
              >
                Cobrei de novo
              </button>
              {p.status === 'contatado' && (
                <p className="mt-1.5 font-mono text-[11px] text-muted">
                  {p.contact_attempts} tentativa{p.contact_attempts === 1 ? '' : 's'}
                </p>
              )}
            </section>
          )}

          <section className="space-y-3">
            <h3 className="eyebrow">Negócio</h3>
            <label className="block">
              <span className="font-mono text-[11px] text-muted">Valor combinado (R$)</span>
              <input
                type="number"
                inputMode="decimal"
                step="0.01"
                value={dealValue}
                onChange={(e) => setDealValue(e.target.value)}
                placeholder="0,00"
                className="mt-1 w-full rounded-sm border border-rule bg-card px-2.5 py-1.5 font-mono text-xs placeholder:text-muted/70"
              />
            </label>
            <label className="flex items-center gap-2 text-[13px]">
              <input
                type="checkbox"
                checked={docsReceived}
                onChange={(e) => setDocsReceived(e.target.checked)}
              />
              Documentos recebidos
            </label>
            <div className="grid grid-cols-2 gap-4">
              <label className="block">
                <span className="font-mono text-[11px] text-muted">Sinal recebido (R$)</span>
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  value={depositPaidAmount}
                  onChange={(e) => setDepositPaidAmount(e.target.value)}
                  placeholder="0,00"
                  className="mt-1 w-full rounded-sm border border-rule bg-card px-2.5 py-1.5 font-mono text-xs placeholder:text-muted/70"
                />
              </label>
              <label className="block">
                <span className="font-mono text-[11px] text-muted">Pagamento final (R$)</span>
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  value={finalPaidAmount}
                  onChange={(e) => setFinalPaidAmount(e.target.value)}
                  placeholder="0,00"
                  className="mt-1 w-full rounded-sm border border-rule bg-card px-2.5 py-1.5 font-mono text-xs placeholder:text-muted/70"
                />
              </label>
            </div>
          </section>

          {CONTRACT_ELIGIBLE_STATUS.has(p.status) && (
            <section className="space-y-2">
              <h3 className="eyebrow">Contrato</h3>
              <div className="flex flex-wrap items-center gap-3">
                {p.contract_generated_at ? (
                  <>
                    <button
                      type="button"
                      onClick={handleDownloadContract}
                      disabled={downloadingContract}
                      className="rounded-sm border border-rule px-3 py-1.5 font-mono text-[11px] hover:bg-card disabled:opacity-40"
                    >
                      {downloadingContract ? 'Abrindo…' : 'Baixar contrato'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setContractError(null)
                        setContractModalOpen(true)
                      }}
                      className="rounded-sm border border-rule px-3 py-1.5 font-mono text-[11px] hover:bg-card"
                    >
                      Refazer contrato
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setContractError(null)
                      setContractModalOpen(true)
                    }}
                    className="rounded-sm border border-rule px-3 py-1.5 font-mono text-[11px] hover:bg-card"
                  >
                    Gerar contrato
                  </button>
                )}
              </div>
              {p.contract_generated_at && (
                <p className="font-mono text-[11px] text-muted">
                  Gerado em {formatDateBR(p.contract_generated_at)}
                </p>
              )}
              {contractError && (
                <p role="alert" className="border-l-2 border-seal pl-3 text-sm text-seal">
                  {contractError}
                </p>
              )}
            </section>
          )}

          {contractModalOpen && (
            <ContractModal
              prospect={p}
              onSubmit={handleGenerateContract}
              onClose={() => setContractModalOpen(false)}
            />
          )}

          {p.problem && (
            <section>
              <h3 className="eyebrow">O problema dele</h3>
              <p className="mt-2 text-sm leading-relaxed">{p.problem}</p>
            </section>
          )}

          <section>
            <h3 className="eyebrow">Contato</h3>
            <dl className="mt-2 space-y-1.5 font-mono text-xs">
              {phones.length > 0 ? (
                phones.map((ph) => (
                  <div key={ph.digits} className="flex gap-2">
                    <dt className="w-20 text-muted">{ph.isMobile ? 'celular' : 'fixo'}</dt>
                    <dd>
                      <a href={`tel:+55${ph.digits}`} className="hover:underline">
                        {ph.raw}
                      </a>
                    </dd>
                  </div>
                ))
              ) : (
                !p.whatsapp && <p className="text-muted">Sem telefone cadastrado.</p>
              )}
              {mail && (
                <div className="flex gap-2">
                  <dt className="w-20 text-muted">e-mail</dt>
                  <dd className="min-w-0 break-all">
                    <a href={`mailto:${mail}`} className="hover:underline">
                      {mail}
                    </a>
                  </dd>
                </div>
              )}
              {p.whatsapp && (
                <SocialInfoRow
                  icon={<WhatsAppIcon size={13} />}
                  label="whatsapp"
                  href={wa}
                  displayText={formatWhatsapp(p.whatsapp) ?? p.whatsapp}
                  editingValue={editingWhatsapp ? whatsapp : undefined}
                  onStartEdit={() => {
                    setWhatsapp(p.whatsapp ?? '')
                    setEditingWhatsapp(true)
                  }}
                  onChange={setWhatsapp}
                  onCancelEdit={() => {
                    setWhatsapp(p.whatsapp ?? '')
                    setEditingWhatsapp(false)
                  }}
                />
              )}
            </dl>

            {!p.whatsapp && (
              <label className="mt-3 block">
                <span className="font-mono text-[11px] text-muted">WhatsApp</span>
                <input
                  type="tel"
                  value={whatsapp}
                  onChange={(e) => setWhatsapp(e.target.value)}
                  placeholder="(11) 99999-9999"
                  className="mt-1 w-full rounded-sm border border-rule bg-card px-2.5 py-1.5 font-mono text-xs placeholder:text-muted/70"
                />
              </label>
            )}

            {wa && (
              <a
                href={wa}
                target="_blank"
                rel="noreferrer noopener"
                className="mt-3 inline-block rounded-sm bg-deep px-3 py-2 font-mono text-[11px] font-medium text-card hover:opacity-90"
              >
                Abrir WhatsApp com a abordagem
              </a>
            )}
          </section>

          <section className="space-y-3">
            <h3 className="eyebrow">Protótipo e e-mail</h3>
            <label className="block">
              <span className="font-mono text-[11px] text-muted">URL do protótipo</span>
              <input
                type="url"
                value={landing}
                onChange={(e) => setLanding(e.target.value)}
                placeholder="https://cliente.pages.dev"
                className="mt-1 w-full rounded-sm border border-rule bg-card px-2.5 py-1.5 font-mono text-xs placeholder:text-muted/70"
              />
            </label>
            <label className="block">
              <span className="font-mono text-[11px] text-muted">E-mail</span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="contato@cliente.com.br"
                className="mt-1 w-full rounded-sm border border-rule bg-card px-2.5 py-1.5 font-mono text-xs placeholder:text-muted/70"
              />
            </label>
            {proto && (
              <p className="font-mono text-[11px] text-muted">
                Publicado em{' '}
                <a
                  href={proto}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="break-all text-deep hover:underline"
                >
                  {p.landing_page_url}
                </a>
              </p>
            )}
            {status === 'novo' && landing.trim() && (
              <p className="font-mono text-[11px] text-deep">
                Ao salvar, o status passa de Novo para Prototipado.
              </p>
            )}
            {p.preview_images && p.preview_images.length > 0 && (
              <div className="grid grid-cols-3 gap-2">
                {p.preview_images.map((src, i) => (
                  <button
                    key={src}
                    type="button"
                    onClick={() => setPreviewIndex(i)}
                    className="block overflow-hidden rounded-sm border border-rule"
                  >
                    <img
                      src={src}
                      alt={`Preview do protótipo de ${p.name}`}
                      loading="lazy"
                      className="aspect-video w-full object-cover object-top transition-opacity hover:opacity-90"
                    />
                  </button>
                ))}
              </div>
            )}
            {previewIndex !== null && (
              <ImagePreviewModal
                images={p.preview_images ?? []}
                initialIndex={previewIndex}
                title={`Previews de ${p.name}`}
                onClose={() => setPreviewIndex(null)}
              />
            )}
          </section>

          <section className="space-y-3">
            <h3 className="eyebrow">Redes sociais</h3>
            <dl className="space-y-1.5 font-mono text-xs">
              {p.instagram && (
                <SocialInfoRow
                  icon={<InstagramIcon size={13} />}
                  label="instagram"
                  href={ig}
                  displayText={instagramHandle(p.instagram) ?? p.instagram}
                  editingValue={editingSocial.instagram}
                  onStartEdit={() => startEditingSocial('instagram', instagramHandle(p.instagram) ?? p.instagram ?? '')}
                  onChange={(v) => updateEditingSocial('instagram', v)}
                  onCancelEdit={() => cancelEditingSocial('instagram')}
                />
              )}
              {p.website && (
                <SocialInfoRow
                  icon={<GlobeIcon size={13} />}
                  label="site"
                  href={site}
                  displayText={p.website}
                  editingValue={editingSocial.website}
                  onStartEdit={() => startEditingSocial('website', p.website ?? '')}
                  onChange={(v) => updateEditingSocial('website', v)}
                  onCancelEdit={() => cancelEditingSocial('website')}
                />
              )}
              {p.facebook && (
                <SocialInfoRow
                  icon={<FacebookIcon size={13} />}
                  label="facebook"
                  href={fb}
                  displayText={facebookHandle(p.facebook) ?? p.facebook}
                  editingValue={editingSocial.facebook}
                  onStartEdit={() => startEditingSocial('facebook', facebookHandle(p.facebook) ?? p.facebook ?? '')}
                  onChange={(v) => updateEditingSocial('facebook', v)}
                  onCancelEdit={() => cancelEditingSocial('facebook')}
                />
              )}
              {p.link_bio && (
                <SocialInfoRow
                  icon={<LinkIcon size={13} />}
                  label="link"
                  href={bio}
                  displayText={p.link_bio}
                  editingValue={editingSocial.link_bio}
                  onStartEdit={() => startEditingSocial('link_bio', p.link_bio ?? '')}
                  onChange={(v) => updateEditingSocial('link_bio', v)}
                  onCancelEdit={() => cancelEditingSocial('link_bio')}
                />
              )}
              {!p.instagram && !p.website && !p.facebook && !p.link_bio && (
                <p className="text-muted">Nenhuma rede cadastrada.</p>
              )}
            </dl>

            {socialDrafts.map((draft, i) => (
              <div key={i} className="flex gap-2">
                <select
                  value={draft.field}
                  onChange={(e) => updateSocialDraftField(i, e.target.value as SocialFieldKey)}
                  className="w-32 shrink-0 rounded-sm border border-rule bg-card px-2 py-1.5 font-mono text-xs"
                >
                  {optionsForSocialRow(i).map((f) => (
                    <option key={f.key} value={f.key}>
                      {f.label}
                    </option>
                  ))}
                </select>
                <input
                  value={draft.value}
                  onChange={(e) => updateSocialDraftValue(i, e.target.value)}
                  placeholder={SOCIAL_FIELDS.find((f) => f.key === draft.field)?.placeholder}
                  className="min-w-0 flex-1 rounded-sm border border-rule bg-card px-2.5 py-1.5 font-mono text-xs placeholder:text-muted/70"
                />
                <button
                  type="button"
                  onClick={() => removeSocialDraft(i)}
                  aria-label="Remover"
                  className="shrink-0 rounded-sm border border-rule px-2 font-mono text-xs text-muted hover:bg-card"
                >
                  ×
                </button>
              </div>
            ))}

            <button
              type="button"
              onClick={addSocialDraft}
              disabled={remainingSocialFields.length === 0}
              className="rounded-sm border border-rule px-3 py-1.5 font-mono text-[11px] hover:bg-card disabled:opacity-40"
            >
              + Adicionar informações
            </button>
          </section>

          <section>
            <h3 className="eyebrow">Mensagem de abordagem</h3>
            <textarea
              value={approach}
              onChange={(e) => setApproach(e.target.value)}
              rows={7}
              className="mt-2 w-full resize-y rounded-sm border border-rule bg-card p-3 text-[13px] leading-relaxed"
            />
          </section>

          <section>
            <h3 className="eyebrow">Anotações</h3>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={4}
              placeholder="O que foi conversado, objeções, valores."
              className="mt-2 w-full resize-y rounded-sm border border-rule bg-card p-3 text-[13px] leading-relaxed placeholder:text-muted/70"
            />
          </section>

          <div className="flex items-center gap-3">
            <button
              onClick={saveText}
              disabled={!dirty}
              className="rounded-sm bg-ink px-4 py-2 font-display text-sm font-semibold text-paper transition-opacity hover:opacity-90 disabled:opacity-40"
            >
              Salvar alterações
            </button>
            {saved && <span className="font-mono text-[11px] text-deep">Salvo</span>}
          </div>

          <footer className="rule-top pt-4 font-mono text-[11px] text-muted">
            Prospectado em {formatDateBR(p.prospected_at)}
            {p.last_contacted_at && ` · último contato em ${formatDateBR(p.last_contacted_at)}`}
          </footer>
        </div>
      </div>
    </div>
  )
}

/** Linha de rede social já preenchida: link + lápis que troca a exibição por um input de edição. */
function SocialInfoRow({
  icon,
  label,
  href,
  displayText,
  editingValue,
  onStartEdit,
  onChange,
  onCancelEdit,
}: {
  icon: React.ReactNode
  label: string
  href: string | null
  displayText: string
  editingValue: string | undefined
  onStartEdit: () => void
  onChange: (value: string) => void
  onCancelEdit: () => void
}) {
  return (
    <div className="flex items-center gap-2">
      <dt className="flex w-20 shrink-0 items-center gap-1.5 text-muted">
        {icon}
        {label}
      </dt>
      {editingValue !== undefined ? (
        <>
          <input
            autoFocus
            value={editingValue}
            onChange={(e) => onChange(e.target.value)}
            className="min-w-0 flex-1 rounded-sm border border-rule bg-card px-2.5 py-1 font-mono text-xs"
          />
          <button
            type="button"
            onClick={onCancelEdit}
            aria-label="Cancelar edição"
            className="shrink-0 rounded-sm border border-rule px-2 font-mono text-xs text-muted hover:bg-card"
          >
            ×
          </button>
        </>
      ) : (
        <dd className="flex min-w-0 flex-1 items-center gap-1.5 break-all">
          {href ? (
            <a href={href} target="_blank" rel="noreferrer noopener" className="hover:underline">
              {truncate(displayText, 50)}
            </a>
          ) : (
            <span className="text-muted">{truncate(displayText, 50)}</span>
          )}
          <button
            type="button"
            onClick={onStartEdit}
            aria-label={`Editar ${label}`}
            className="shrink-0 text-muted hover:text-ink"
          >
            <PencilIcon size={11} />
          </button>
        </dd>
      )}
    </div>
  )
}

function PencilIcon({ size }: { size: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block min-w-0">
      <span className="eyebrow">{label}</span>
      <div className="mt-1.5">{children}</div>
    </label>
  )
}

const isIOS = typeof navigator !== 'undefined' && /iPad|iPhone|iPod/.test(navigator.userAgent)

/**
 * iOS Safari não desenha placeholder nem ícone num input[type=date] vazio
 * (só mostra algo depois que uma data é escolhida). Sobrepomos os dois aqui,
 * só nesse caso — no desktop o navegador já desenha "dd/mm/aaaa" sozinho, e
 * sobrepor de novo duplicava o texto. `pointer-events-none` deixa o toque
 * passar direto pro input, que abre o seletor nativo normalmente.
 */
function DateField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="relative min-w-0">
      <input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full min-w-0 rounded-sm border border-rule bg-card px-2.5 py-1.5 font-mono text-xs"
      />
      {isIOS && !value && (
        <span className="pointer-events-none absolute inset-y-0 left-2.5 flex items-center gap-1.5 font-mono text-xs text-muted">
          <CalendarIcon />
          dd/mm/aaaa
        </span>
      )}
    </div>
  )
}

function CalendarIcon() {
  return (
    <svg width={13} height={13} viewBox="0 0 24 24" aria-hidden fill="none" stroke="currentColor" strokeWidth={1.6}>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18M8 3v4M16 3v4" strokeLinecap="round" />
    </svg>
  )
}
