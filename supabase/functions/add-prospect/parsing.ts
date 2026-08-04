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
