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
): { name: string; lat: number; lng: number } | null {
  const m = url.match(/\/maps\/place\/([^/]+)\/@(-?\d+\.\d+),(-?\d+\.\d+)/)
  if (!m) return null
  return {
    name: decodeURIComponent(m[1].replace(/\+/g, ' ')),
    lat: Number(m[2]),
    lng: Number(m[3]),
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
