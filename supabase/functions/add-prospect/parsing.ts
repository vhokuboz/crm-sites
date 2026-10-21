/** Extrai place_id de uma URL de permalink no formato `?q=place_id:...`. */
export function extractPlaceId(url: string): string | null {
  const m = url.match(/place_id:([\w-]+)/)
  return m ? m[1] : null
}

/**
 * Extrai nome + lat/lng de uma URL padrão do Maps
 * (`/maps/place/<nome>/@<lat>,<lng>,<zoom>z/...`) — o formato que sai da barra
 * de endereço ao abrir um local. Link curto de compartilhamento
 * (`maps.app.goo.gl/...`) só chega nesse formato depois de seguir o redirect.
 */
export function extractNameAndLocation(
  url: string,
): { name: string; lat: number; lng: number; center: { lat: number; lng: number } } | null {
  const m = url.match(/\/maps\/place\/([^/]+)\/@(-?\d+\.\d+),(-?\d+\.\d+)/)
  if (!m) return null
  // O `@lat,lng` é o centro do mapa na tela (pode estar a km do local, conforme
  // o zoom); a posição real do local vem em `!3d<lat>!4d<lng>`.
  const pin = url.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/)
  return {
    name: decodeURIComponent(m[1].replace(/\+/g, ' ')),
    lat: Number(pin ? pin[1] : m[2]),
    lng: Number(pin ? pin[2] : m[3]),
    // centro do mapa (`@`), mantido como segunda tentativa de busca
    center: { lat: Number(m[2]), lng: Number(m[3]) },
  }
}

/** Extrai o handle de uma URL de perfil do Instagram. */
export function extractInstagramHandle(url: string): string | null {
  const m = url.match(/instagram\.com\/([A-Za-z0-9._]+)/i)
  return m ? m[1] : null
}

/**
 * Mapeia o `primaryType` do Places API (taxonomia do Google, em inglês) pro
 * vocabulário de segmento do funil de prospecção (ver prospeccao-bauru:
 * Docerias/Confeitarias, Artesanato, Nutricionistas, Psicólogos, Advogados,
 * Fisioterapeutas, Dentistas). Cobre só os tipos com correspondência clara e
 * unívoca -- tipo sem entrada aqui cai no nome legível que o próprio Places
 * API devolve (`primaryTypeDisplayName`), que continua editável na ficha em
 * vez de arriscar categorizar errado.
 */
const SEGMENT_BY_PLACE_TYPE: Record<string, string> = {
  dentist: 'Dentistas',
  lawyer: 'Advogados',
  physiotherapist: 'Fisioterapeutas',
  psychotherapist: 'Psicólogos',
  bakery: 'Docerias/Confeitarias',
}

export function resolveSegment(primaryType: string | null, fallbackLabel: string | null): string {
  if (primaryType && SEGMENT_BY_PLACE_TYPE[primaryType]) return SEGMENT_BY_PLACE_TYPE[primaryType]
  return fallbackLabel ?? '[PREENCHER]'
}

type AddressComponent = { longText?: string; shortText?: string; types?: string[] }

/** Monta "Cidade/UF" a partir do `addressComponents` do Places API; null se faltar algum. */
export function extractCity(components: AddressComponent[] | undefined): string | null {
  const find = (type: string) => components?.find((c) => c.types?.includes(type))
  const city = (find('locality') ?? find('administrative_area_level_2'))?.longText
  const uf = find('administrative_area_level_1')?.shortText
  return city && uf ? `${city}/${uf}` : null
}

/**
 * Título do local gravado no parâmetro `!15s<base64>` da URL do Maps (um protobuf
 * cujo 1º campo é o título). Pode diferir do slug do caminho, ex.:
 * "Giovanna Milani | Nutricionista" vs `/place/Nutricionista+Giovanna+Milani/`.
 */
export function extractMapsTitle(url: string): string | null {
  const m = url.match(/!15s([A-Za-z0-9_%-]+)/)
  if (!m) return null
  try {
    const b64 = decodeURIComponent(m[1]).replace(/-/g, '+').replace(/_/g, '/')
    const bytes = Uint8Array.from(atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4)), (c) => c.charCodeAt(0))
    // campo 1 (tag 0x0a) com tamanho < 128
    if (bytes[0] !== 0x0a || bytes[1] >= 128) return null
    return new TextDecoder().decode(bytes.slice(2, 2 + bytes[1])) || null
  } catch {
    return null
  }
}

const plainTokens = (s: string) =>
  s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)

/** O nome devolvido pelo Places contém todas as palavras do que foi buscado (sem acento/caixa/ordem). */
export function nameMatches(searched: string, found: string): boolean {
  const have = new Set(plainTokens(found))
  return plainTokens(searched).every((t) => have.has(t))
}
