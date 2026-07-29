import type { Prospect, ProspectStatus } from './database.types'

/* ---------------------------------------------------------------- datas ---
   next_action_at e prospected_at sao `date` no Postgres: chegam como
   "AAAA-MM-DD". Comparar via new Date(string) interpretaria UTC e erraria o dia
   no nosso fuso, entao tudo aqui e comparacao de string no formato ISO.
*/

export function todayISO(): string {
  const d = new Date()
  const mes = String(d.getMonth() + 1).padStart(2, '0')
  const dia = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mes}-${dia}`
}

export function addDaysISO(days: number, from = todayISO()): string {
  const [a, m, d] = from.split('-').map(Number)
  const date = new Date(a, m - 1, d + days)
  const mes = String(date.getMonth() + 1).padStart(2, '0')
  const dia = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${mes}-${dia}`
}

/** Dias entre hoje e uma data ISO. Negativo = passado. */
export function daysFromToday(iso: string): number {
  const [a1, m1, d1] = todayISO().split('-').map(Number)
  const [a2, m2, d2] = iso.split('-').map(Number)
  const ms = Date.UTC(a2, m2 - 1, d2) - Date.UTC(a1, m1 - 1, d1)
  return Math.round(ms / 86_400_000)
}

export function formatDateBR(iso: string | null): string {
  if (!iso) return '—'
  const [a, m, d] = iso.slice(0, 10).split('-')
  return `${d}/${m}/${a.slice(2)}`
}

/** "hoje", "ontem", "em 3 dias", "há 2 dias" — o texto que a fila do dia usa. */
export function relativeDay(iso: string): string {
  const diff = daysFromToday(iso)
  if (diff === 0) return 'hoje'
  if (diff === 1) return 'amanhã'
  if (diff === -1) return 'ontem'
  if (diff > 1) return `em ${diff} dias`
  return `há ${Math.abs(diff)} dias`
}

/**
 * Maior data entre o último post do Instagram e a última review no Google —
 * sinal de atividade mais recente, venha de onde vier. `google_last_review_at`
 * complementa quando o lead não tem Instagram.
 */
function lastSocialActivityAt(p: Prospect): string | null {
  const ig = p.instagram_last_post_at
  const gr = p.google_last_review_at
  if (ig && gr) return ig > gr ? ig : gr
  return ig ?? gr
}

/**
 * "21d" / "6m" / "3y" — tempo desde a ultima atividade social (Instagram ou
 * Google), em formato compacto pro card.
 */
export function lastSocialActivityLabel(p: Prospect): string | null {
  const value = lastSocialActivityAt(p)
  if (!value) return null
  const then = new Date(value).getTime()
  if (Number.isNaN(then)) return null
  const days = Math.max(0, Math.floor((Date.now() - then) / 86_400_000))
  if (days < 30) return `${days}d`
  const months = Math.floor(days / 30)
  if (months < 12) return `${months}m`
  return `${Math.floor(days / 365)}y`
}

/* ------------------------------------------------------- presenca digital ---
   O argumento de venda deste negocio e a distancia entre o quanto o cliente e
   bem avaliado e o quao fraca e a presenca digital dele. Para medir isso a
   interface precisa transformar `website_quality` -- que e texto livre escrito
   na prospeccao -- em uma nota comparavel com a do Google.
*/

export type Presence = {
  /** 0 a 5, na mesma escala da nota do Google. null = nao avaliado. */
  score: number | null
  label: string
}

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

/** Campos que bastam pra calcular a lacuna de oportunidade, sem precisar do registro inteiro. */
export type OpportunityInput = Pick<Prospect, 'google_rating' | 'website_quality' | 'website'>

export function readPresence(p: OpportunityInput): Presence {
  const q = p.website_quality ? normalize(p.website_quality) : ''

  if (q.includes('sem site')) return { score: 0, label: 'sem site' }
  if (q.includes('facebook')) return { score: 1, label: 'só rede social' }
  if (q.includes('pagina em branco')) return { score: 1, label: 'site quebrado' }
  if (q.includes('problematic')) return { score: 1, label: 'site problemático' }
  if (q.includes('datado') || q.includes('fraco')) return { score: 2, label: 'site datado' }
  if (q.includes('generico') || q.includes('basico')) return { score: 2, label: 'site genérico' }
  if (q) return { score: 3, label: p.website_quality as string }
  if (p.website) return { score: 4, label: 'site ativo' }
  return { score: null, label: 'presença não avaliada' }
}

export type Gap = {
  reputation: number | null
  presence: number | null
  /** reputacao - presenca. Quanto maior, mais forte o argumento de venda. */
  size: number | null
  presenceLabel: string
}

export function readGap(p: OpportunityInput): Gap {
  const presence = readPresence(p)
  const reputation = p.google_rating
  return {
    reputation,
    presence: presence.score,
    presenceLabel: presence.label,
    size:
      reputation !== null && presence.score !== null ? reputation - presence.score : null,
  }
}

/**
 * Segmentos que vivem de venda direta/recorrente e prova social constante
 * (doceria, salao, loja) sentem o silencio no Instagram rapido -- parar de
 * postar e sinal real de negocio esfriando. Ja profissao liberal de baixa
 * recorrencia (advogado, dentista, fisio) pode nao postar por anos e seguir
 * a todo vapor, entao silencio la e evidencia fraca, nunca risco "alto".
 */
const HIGH_DIGITAL_DEPENDENCY_KEYWORDS = [
  'doceria',
  'confeitaria',
  'salao',
  'estetica',
  'brecho',
  'boutique',
  'restaurante',
  'cafeteria',
  'loja',
  'padaria',
]

function isHighDigitalDependency(segment: string): boolean {
  const s = normalize(segment)
  return HIGH_DIGITAL_DEPENDENCY_KEYWORDS.some((k) => s.includes(k))
}

export type InactivityRisk = 'alto' | 'medio' | 'baixo'

export const RISK_LABEL: Record<InactivityRisk, string> = {
  alto: 'risco alto',
  medio: 'risco médio',
  baixo: 'risco baixo',
}

/** Classe de cor pro mesmo tom usado em `STATUS_TONE` (seal = alerta, gold = atencao). */
export const RISK_TONE: Record<InactivityRisk, string> = {
  alto: 'text-seal',
  medio: 'text-gold',
  baixo: 'text-muted',
}

/**
 * `null` quando nao ha Instagram nem review do Google pra avaliar -- sem
 * dado, sem risco calculado, em vez de assumir o pior.
 */
export function inactivityRisk(p: Prospect): InactivityRisk | null {
  const value = lastSocialActivityAt(p)
  if (!value) return null
  const then = new Date(value).getTime()
  if (Number.isNaN(then)) return null
  const days = Math.max(0, Math.floor((Date.now() - then) / 86_400_000))

  if (isHighDigitalDependency(p.segment)) {
    if (days >= 365) return 'alto'
    if (days >= 150) return 'medio'
    return 'baixo'
  }
  return days >= 730 ? 'medio' : 'baixo'
}

/**
 * Ordena por forca do argumento. Quem tem nota do Google e presenca fraca vem
 * primeiro; quem ainda nao tem nota entra depois, ordenado pela presenca, porque
 * inventar uma reputacao media para eles seria fabricar dado que nao existe.
 */
export function byOpportunity(a: OpportunityInput, b: OpportunityInput): number {
  const ga = readGap(a)
  const gb = readGap(b)
  if (ga.size !== null && gb.size !== null) return gb.size - ga.size
  if (ga.size !== null) return -1
  if (gb.size !== null) return 1
  return (ga.presence ?? 9) - (gb.presence ?? 9)
}

/* ------------------------------------------------------------- contatos ---
   `contact` e texto livre e as vezes traz dois numeros separados por barra.
*/

export type Phone = { raw: string; digits: string; isMobile: boolean }

export function parsePhones(contact: string | null): Phone[] {
  if (!contact) return []
  const matches = contact.match(/\(?\d{2}\)?[\s-]?\d{4,5}-?\d{4}/g) ?? []
  return matches.map((raw) => {
    const digits = raw.replace(/\D/g, '')
    return { raw: raw.trim(), digits, isMobile: digits.length === 11 }
  })
}

/**
 * `whatsapp` e o numero ja confirmado como canal real (extraido de link
 * wa.me/api.whatsapp), com DDI incluso. Na ausencia dele, o celular achado em
 * `contact` -- texto livre do Maps -- serve de fallback, mas precisa do 55.
 */
export function whatsappDigits(p: Prospect): string | null {
  const direct = p.whatsapp?.replace(/\D/g, '')
  if (direct) return direct
  const mobile = parsePhones(p.contact).find((ph) => ph.isMobile)
  return mobile ? `55${mobile.digits}` : null
}

export function whatsappUrl(p: Prospect, message?: string | null): string | null {
  const digits = whatsappDigits(p)
  if (!digits) return null
  const base = `https://wa.me/${digits}`
  return message ? `${base}?text=${encodeURIComponent(message)}` : base
}

/**
 * `facebook` e texto livre: pode chegar como handle, URL sem esquema ou URL
 * completa. O perfil exige login pra leitura, entao aqui so normalizamos o
 * link -- nao ha o que raspar como no Instagram.
 */
export function facebookUrl(value: string | null): string | null {
  if (!value) return null
  const v = value.trim()
  if (!v) return null
  // Case-insensitive: teclado de celular às vezes maiúsculiza a primeira letra
  // colada/digitada ("Https://...", "Facebook.com/...").
  if (/^https?:\/\//i.test(v)) return v
  if (/facebook\.com/i.test(v)) return `https://${v}`
  return `https://facebook.com/${v.replace(/^@/, '')}`
}

/** Mesmo parsing do facebookUrl, mas devolve só o identificador da página -- a URL completa é ilegível no card. */
export function facebookHandle(value: string | null): string | null {
  if (!value) return null
  const v = value.trim()
  if (!v) return null
  const url = v.match(/facebook\.com\/([^/?#]+)/i)
  if (url) return url[1]
  return v.replace(/^@/, '').replace(/^https?:\/\//i, '')
}

/** `link_bio` (Linktree e afins) as vezes chega sem esquema. */
export function linkBioUrl(value: string | null): string | null {
  if (!value) return null
  const v = value.trim()
  if (!v) return null
  return v.startsWith('http') ? v : `https://${v}`
}

/**
 * O campo `instagram` e texto livre da prospeccao: as vezes traz um perfil, as
 * vezes uma observacao ("Não vinculado"), as vezes o perfil com um comentario
 * junto ("@dr.rodrigocatto (ativo, ~2,4 mil seguidores)"). So o handle entra na
 * URL -- o resto seria colado no link e levaria a um perfil inexistente.
 */
export function instagramUrl(value: string | null): string | null {
  if (!value) return null
  const v = value.trim()
  const handle = v.match(/^@([A-Za-z0-9._]+)/)
  if (handle) return `https://instagram.com/${handle[1]}`
  const url = v.match(/instagram\.com\/([A-Za-z0-9._]+)/i)
  if (url) return `https://instagram.com/${url[1]}`
  return null
}

/** Mesmo parsing do instagramUrl, mas devolve "@handle" para exibição -- a URL completa é ilegível no card. */
export function instagramHandle(value: string | null): string | null {
  if (!value) return null
  const v = value.trim()
  const handle = v.match(/^@([A-Za-z0-9._]+)/)
  if (handle) return `@${handle[1]}`
  const url = v.match(/instagram\.com\/([A-Za-z0-9._]+)/i)
  if (url) return `@${url[1]}`
  return null
}

export function websiteUrl(value: string | null): string | null {
  if (!value) return null
  const v = value.trim()
  if (!v || v.toLowerCase() === 'sem site') return null
  return v.startsWith('http') ? v : `https://${v}`
}

/**
 * O protótipo gerado pelo agente. Mesma normalizacao do site do cliente, porque
 * `landing_page_url` as vezes chega sem esquema ("fulano.pages.dev").
 */
export function prototypeUrl(p: Prospect): string | null {
  return websiteUrl(p.landing_page_url)
}

/** `source_url` já chega como link completo (Maps): só cai fora string vazia. */
export function sourceUrl(p: Prospect): string | null {
  return p.source_url?.trim() || null
}

/**
 * `null` quando o negócio está `OPERATIONAL` ou ainda não foi checado -- só
 * interessa o alerta de fechado, o resto é ruído no card.
 */
export function businessClosedLabel(p: Prospect): string | null {
  if (p.business_status === 'CLOSED_PERMANENTLY') return 'fechado permanentemente'
  if (p.business_status === 'CLOSED_TEMPORARILY') return 'fechado temporariamente'
  return null
}

/**
 * E-mail tem coluna propria, mas registros antigos as vezes trazem o endereco
 * dentro de `contact`, que e texto livre. A coluna manda; o texto livre e so o
 * ultimo recurso para nao perder o que ja foi anotado.
 */
export function readEmail(p: Prospect): string | null {
  const direct = p.email?.trim()
  if (direct) return direct
  const found = p.contact?.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/)
  return found ? found[0] : null
}

/* --------------------------------------------------------------- status ---- */

export const FUNNEL: ProspectStatus[] = [
  'novo',
  'prototipado',
  'contatado',
  'respondeu',
  'negociando',
  'fechado',
]

export const CLOSED: ProspectStatus[] = ['perdido', 'descartado']

export const ALL_STATUS: ProspectStatus[] = [...FUNNEL, ...CLOSED]

export const STATUS_LABEL: Record<ProspectStatus, string> = {
  novo: 'Novo',
  prototipado: 'Prototipado',
  contatado: 'Contatado',
  respondeu: 'Respondeu',
  negociando: 'Negociando',
  fechado: 'Fechado',
  perdido: 'Perdido',
  descartado: 'Descartado',
}

/** Peso visual crescente ao longo do funil; encerrados ficam apagados. */
export const STATUS_TONE: Record<ProspectStatus, string> = {
  novo: 'bg-rule/60 text-ink',
  prototipado: 'bg-deep/8 text-deep',
  contatado: 'bg-deep/15 text-deep',
  respondeu: 'bg-deep/30 text-deep',
  negociando: 'bg-gold/25 text-gold',
  fechado: 'bg-deep text-card',
  perdido: 'bg-seal/12 text-seal',
  descartado: 'bg-rule/40 text-muted',
}

export function isOpen(p: Prospect): boolean {
  return !['fechado', 'perdido', 'descartado'].includes(p.status)
}

/* ----------------------------------------------------------- fila do dia --- */

export type Queue = {
  overdue: Prospect[]
  today: Prospect[]
  unscheduled: Prospect[]
}

export function buildQueue(prospects: Prospect[]): Queue {
  const open = prospects.filter(isOpen)
  const hoje = todayISO()
  return {
    overdue: open
      .filter((p) => p.next_action_at !== null && p.next_action_at < hoje)
      .sort((a, b) => (a.next_action_at ?? '').localeCompare(b.next_action_at ?? '')),
    today: open.filter((p) => p.next_action_at === hoje),
    // Quem ja tem protótipo pronto encabeça a fila sem data: o trabalho caro ja
    // foi feito e so falta a abordagem. Dentro de cada grupo vale a lacuna.
    unscheduled: open
      .filter((p) => p.next_action_at === null)
      .sort((a, b) => {
        const pa = a.status === 'prototipado' ? 0 : 1
        const pb = b.status === 'prototipado' ? 0 : 1
        return pa !== pb ? pa - pb : byOpportunity(a, b)
      }),
  }
}
