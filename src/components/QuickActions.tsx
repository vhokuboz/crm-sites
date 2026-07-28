import { useState } from 'react'
import type { Prospect } from '../lib/database.types'
import {
  facebookUrl,
  instagramUrl,
  linkBioUrl,
  prototypeUrl,
  readEmail,
  sourceUrl,
  websiteUrl,
  whatsappUrl,
} from '../lib/domain'
import { ImagePreviewModal } from './ImagePreviewModal'

/*
  A fila do dia se resolve em cliques curtos: abrir o protótipo para conferir,
  puxar o WhatsApp com a abordagem pronta, espiar o Instagram, copiar o e-mail.
  Cada ação vira um ícone; o que não existe no registro simplesmente não aparece,
  para o card não mentir sobre dado que ainda não foi levantado.
*/

type Props = {
  prospect: Prospect
  /** `sm` no card da fila, `md` na ficha lateral. */
  size?: 'sm' | 'md'
  /** Sem caixa/outline: só o ícone como informação visual, ainda clicável. Usado no card do funil. */
  bare?: boolean
}

export function QuickActions({ prospect: p, size = 'sm', bare = false }: Props) {
  const [copied, setCopied] = useState(false)
  const [previewOpen, setPreviewOpen] = useState(false)

  const proto = prototypeUrl(p)
  const wa = whatsappUrl(p, p.approach_message)
  const ig = instagramUrl(p.instagram)
  const site = websiteUrl(p.website)
  const fb = facebookUrl(p.facebook)
  const bio = linkBioUrl(p.link_bio)
  const email = readEmail(p)
  const source = sourceUrl(p)
  const images = p.preview_images ?? []

  async function copyEmail() {
    if (!email) return
    await navigator.clipboard.writeText(email)
    setCopied(true)
    setTimeout(() => setCopied(false), 1800)
  }

  if (!proto && !wa && !ig && !site && !fb && !bio && !email && !source && images.length === 0)
    return null

  const box = bare ? 'h-5 w-5' : size === 'md' ? 'h-9 w-9' : 'h-8 w-8'
  const icon = bare ? 13 : size === 'md' ? 18 : 16

  return (
    <div className={`flex flex-wrap items-center ${bare ? 'justify-end gap-0.5' : 'gap-1'}`}>
      {images.length > 0 && (
        <button
          type="button"
          onClick={() => setPreviewOpen(true)}
          title="Ver previews do protótipo"
          aria-label="Ver previews do protótipo"
          className={
            bare
              ? `grid ${box} place-items-center text-ink/70 transition-colors hover:text-deep`
              : `grid ${box} place-items-center rounded-sm border border-rule text-ink transition-colors hover:bg-paper`
          }
        >
          <ImagesIcon size={icon} />
        </button>
      )}
      {previewOpen && (
        <ImagePreviewModal
          images={images}
          title={`Previews de ${p.name}`}
          onClose={() => setPreviewOpen(false)}
        />
      )}
      {proto && (
        <IconLink href={proto} label="Abrir o protótipo do site" box={box} bare={bare} highlight>
          <PrototypeIcon size={icon} />
        </IconLink>
      )}
      {wa && (
        <IconLink href={wa} label="Abrir WhatsApp com a abordagem" box={box} bare={bare}>
          <WhatsAppIcon size={icon} />
        </IconLink>
      )}
      {ig && (
        <IconLink href={ig} label="Abrir o Instagram" box={box} bare={bare}>
          <InstagramIcon size={icon} />
        </IconLink>
      )}
      {email && (
        <button
          type="button"
          onClick={copyEmail}
          title={copied ? 'E-mail copiado' : `Copiar e-mail (${email})`}
          aria-label={copied ? 'E-mail copiado' : `Copiar e-mail ${email}`}
          className={
            bare
              ? `grid ${box} place-items-center transition-colors ${copied ? 'text-deep' : 'text-ink/70 hover:text-deep'}`
              : `grid ${box} place-items-center rounded-sm border transition-colors ${
                  copied ? 'border-deep bg-deep text-card' : 'border-rule text-ink hover:bg-paper'
                }`
          }
        >
          {copied ? <CheckIcon size={icon} /> : <MailIcon size={icon} />}
        </button>
      )}
      {site && (
        <IconLink href={site} label="Abrir o site atual do cliente" box={box} bare={bare}>
          <GlobeIcon size={icon} />
        </IconLink>
      )}
      {fb && (
        <IconLink href={fb} label="Abrir o Facebook" box={box} bare={bare}>
          <FacebookIcon size={icon} />
        </IconLink>
      )}
      {bio && (
        <IconLink href={bio} label="Abrir o link na bio" box={box} bare={bare}>
          <LinkIcon size={icon} />
        </IconLink>
      )}
      {/* Sempre por último: posição fixa na lista, já que esse link vai existir em todo registro. */}
      {source && (
        <IconLink href={source} label="Abrir a origem do lead" box={box} bare={bare}>
          <PinIcon size={icon} />
        </IconLink>
      )}
    </div>
  )
}

function IconLink({
  href,
  label,
  box,
  highlight = false,
  bare = false,
  children,
}: {
  href: string
  label: string
  box: string
  highlight?: boolean
  bare?: boolean
  children: React.ReactNode
}) {
  const className = bare
    ? `grid ${box} place-items-center transition-colors ${
        highlight ? 'text-deep' : 'text-ink/70 hover:text-deep'
      }`
    : `grid ${box} place-items-center rounded-sm border transition-colors ${
        highlight
          ? 'border-deep/40 bg-deep/10 text-deep hover:bg-deep hover:text-card'
          : 'border-rule text-ink hover:bg-paper'
      }`

  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      /* Sem isto, arrastar o icone dentro de um card do funil arrastaria a URL. */
      draggable={false}
      title={label}
      aria-label={label}
      className={className}
    >
      {children}
    </a>
  )
}

/* ------------------------------------------------------------------ icones ---
   Desenhados aqui em vez de virem de um pacote: sao cinco, e uma dependencia de
   biblioteca de icones custaria mais no bundle do que o SVG inteiro deles.
*/

type IconProps = { size: number }

const stroke = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
}

/** Janela de navegador: o protótipo publicado. */
function PrototypeIcon({ size }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden {...stroke}>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M3 9h18" />
      <path d="M6.5 6.5h.01M9 6.5h.01" />
      <path d="M8 13.5h8M8 16.5h5" />
    </svg>
  )
}

function WhatsAppIcon({ size }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden fill="currentColor">
      <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2 22l5.28-1.38a9.9 9.9 0 0 0 4.76 1.21h.01c5.46 0 9.9-4.45 9.9-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2Zm0 1.82c2.16 0 4.19.84 5.72 2.37a8.03 8.03 0 0 1 2.37 5.72c0 4.46-3.63 8.09-8.09 8.09a8.2 8.2 0 0 1-4.18-1.15l-.3-.18-3.1.81.83-3.02-.2-.31a8.16 8.16 0 0 1-1.25-4.34c0-4.46 3.63-8.09 8.2-8.09Zm-3.6 4.1c-.17 0-.44.06-.67.31-.23.25-.88.86-.88 2.1 0 1.24.9 2.44 1.03 2.6.13.17 1.76 2.68 4.26 3.76.6.26 1.06.41 1.42.53.6.19 1.14.16 1.57.1.48-.07 1.48-.6 1.68-1.19.21-.58.21-1.08.15-1.19-.06-.1-.23-.16-.48-.29-.25-.12-1.48-.73-1.71-.81-.23-.09-.4-.13-.56.12-.17.25-.64.81-.79.98-.14.16-.29.19-.54.06-.25-.12-1.05-.39-2-1.23-.74-.66-1.24-1.47-1.38-1.72-.15-.25-.02-.38.11-.51.11-.11.25-.29.37-.43.13-.15.17-.25.25-.41.08-.17.04-.31-.02-.44-.06-.12-.55-1.36-.77-1.86-.2-.48-.4-.42-.55-.42l-.47-.01Z" />
    </svg>
  )
}

function InstagramIcon({ size }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden {...stroke}>
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <path d="M17.2 6.8h.01" />
    </svg>
  )
}

function MailIcon({ size }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden {...stroke}>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3.5 7 8.5 6 8.5-6" />
    </svg>
  )
}

function GlobeIcon({ size }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden {...stroke}>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18" />
      <path d="M12 3a14 14 0 0 1 0 18a14 14 0 0 1 0-18Z" />
    </svg>
  )
}

/** Pilha de imagens: previews do protótipo. */
function ImagesIcon({ size }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden {...stroke}>
      <rect x="3" y="7" width="14" height="14" rx="2" />
      <path d="M7 7V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-2" />
      <circle cx="8" cy="12" r="1.5" />
      <path d="m5 19 3.5-4 3 3L15 14l2 3" />
    </svg>
  )
}

function FacebookIcon({ size }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden fill="currentColor">
      <path d="M14.5 22v-8.4h2.8l.42-3.27H14.5V8.2c0-.95.26-1.6 1.62-1.6h1.74V3.7c-.3-.04-1.33-.13-2.53-.13-2.5 0-4.22 1.53-4.22 4.34v2.42H8.3v3.27h2.8V22h3.4Z" />
    </svg>
  )
}

/** Elo de corrente: agregador de links (Linktree e afins). */
function LinkIcon({ size }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden {...stroke}>
      <path d="M9.5 14.5 14.5 9.5" />
      <path d="M11 6.5 12.4 5.1a3.5 3.5 0 0 1 4.95 4.95L15.9 11.5" />
      <path d="M13 17.5 11.6 18.9a3.5 3.5 0 0 1-4.95-4.95L8.1 12.5" />
    </svg>
  )
}

/** Pin de mapa: origem do lead (Google Maps). */
function PinIcon({ size }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden {...stroke}>
      <path d="M12 21s7-6.3 7-11.5a7 7 0 1 0-14 0C5 14.7 12 21 12 21Z" />
      <circle cx="12" cy="9.5" r="2.3" />
    </svg>
  )
}

function CheckIcon({ size }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden {...stroke}>
      <path d="m5 12.5 4.5 4.5L19 7" />
    </svg>
  )
}
