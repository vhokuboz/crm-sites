import { useEffect, useRef, useState } from 'react'
import type { Prospect, ProspectStatus, ProspectUpdate } from '../lib/database.types'
import {
  ALL_STATUS,
  RISK_LABEL,
  RISK_TONE,
  STATUS_LABEL,
  facebookUrl,
  formatDateBR,
  inactivityRisk,
  instagramUrl,
  lastSocialActivityLabel,
  linkBioUrl,
  parsePhones,
  prototypeUrl,
  readEmail,
  websiteUrl,
  whatsappUrl,
} from '../lib/domain'
import { BusinessStatusBadge } from './BusinessStatusBadge'
import { GapMeter } from './GapMeter'
import { ImagePreviewModal } from './ImagePreviewModal'
import { QuickActions } from './QuickActions'

type Props = {
  prospect: Prospect
  onUpdate: (id: string, patch: ProspectUpdate) => Promise<boolean>
  onClose: () => void
}

export function Drawer({ prospect: p, onUpdate, onClose }: Props) {
  const panel = useRef<HTMLDivElement>(null)
  const [notes, setNotes] = useState(p.notes ?? '')
  const [approach, setApproach] = useState(p.approach_message ?? '')
  const [email, setEmail] = useState(p.email ?? '')
  const [landing, setLanding] = useState(p.landing_page_url ?? '')
  const [status, setStatus] = useState(p.status)
  const [nextAction, setNextAction] = useState(p.next_action_at ?? '')
  const [saved, setSaved] = useState(false)
  const [previewIndex, setPreviewIndex] = useState<number | null>(null)

  useEffect(() => {
    setNotes(p.notes ?? '')
    setApproach(p.approach_message ?? '')
    setEmail(p.email ?? '')
    setLanding(p.landing_page_url ?? '')
    setStatus(p.status)
    setNextAction(p.next_action_at ?? '')
  }, [p.id, p.notes, p.approach_message, p.email, p.landing_page_url, p.status, p.next_action_at])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    panel.current?.focus()
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const dirty =
    notes !== (p.notes ?? '') ||
    approach !== (p.approach_message ?? '') ||
    email !== (p.email ?? '') ||
    landing !== (p.landing_page_url ?? '') ||
    status !== p.status ||
    nextAction !== (p.next_action_at ?? '')

  async function saveText() {
    const patch: ProspectUpdate = {
      notes: notes || null,
      approach_message: approach || null,
      email: email.trim() || null,
      landing_page_url: landing.trim() || null,
      status,
      next_action_at: nextAction || null,
    }
    // Registrar o protótipo é o próprio ato de sair de "novo": quem tem página
    // publicada já está pronto para a abordagem, e reclassificar na mão seria
    // uma segunda etapa fácil de esquecer.
    if (patch.landing_page_url && status === 'novo') patch.status = 'prototipado'

    const ok = await onUpdate(p.id, patch)
    if (ok) {
      setSaved(true)
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
  const phones = parsePhones(p.contact)
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
                <p className="text-muted">Sem telefone cadastrado.</p>
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
              {p.instagram && (
                <div className="flex gap-2">
                  <dt className="w-20 text-muted">instagram</dt>
                  <dd>
                    {ig ? (
                      <a href={ig} target="_blank" rel="noreferrer noopener" className="hover:underline">
                        {p.instagram}
                      </a>
                    ) : (
                      <span className="text-muted">{p.instagram}</span>
                    )}
                  </dd>
                </div>
              )}
              {p.website && (
                <div className="flex gap-2">
                  <dt className="w-20 text-muted">site</dt>
                  <dd className="min-w-0 break-all">
                    {site ? (
                      <a href={site} target="_blank" rel="noreferrer noopener" className="hover:underline">
                        {p.website}
                      </a>
                    ) : (
                      <span className="text-muted">{p.website}</span>
                    )}
                  </dd>
                </div>
              )}
              {p.facebook && (
                <div className="flex gap-2">
                  <dt className="w-20 text-muted">facebook</dt>
                  <dd className="min-w-0 break-all">
                    {fb ? (
                      <a href={fb} target="_blank" rel="noreferrer noopener" className="hover:underline">
                        {p.facebook}
                      </a>
                    ) : (
                      <span className="text-muted">{p.facebook}</span>
                    )}
                  </dd>
                </div>
              )}
              {p.link_bio && (
                <div className="flex gap-2">
                  <dt className="w-20 text-muted">link na bio</dt>
                  <dd className="min-w-0 break-all">
                    {bio ? (
                      <a href={bio} target="_blank" rel="noreferrer noopener" className="hover:underline">
                        {p.link_bio}
                      </a>
                    ) : (
                      <span className="text-muted">{p.link_bio}</span>
                    )}
                  </dd>
                </div>
              )}
            </dl>

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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block min-w-0">
      <span className="eyebrow">{label}</span>
      <div className="mt-1.5">{children}</div>
    </label>
  )
}

/**
 * iOS Safari não desenha placeholder nem ícone num input[type=date] vazio
 * (só mostra algo depois que uma data é escolhida). Sobrepomos os dois aqui;
 * `pointer-events-none` deixa o toque passar direto pro input, que abre o
 * seletor nativo normalmente.
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
      {!value && (
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
