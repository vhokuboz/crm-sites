// Recebe link do Google Maps + link do Instagram, resolve os dados
// determinísticos (nome, endereço, nota, avaliações, telefone, site) via
// Places API e grava um prospect novo em public.prospects.
//
// O que fica de fora de propósito: website_quality e problem, que exigem
// olhar o site/Instagram e julgar — isso continua sendo trabalho de um
// agente depois, não desta function.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  extractCity,
  extractMapsTitle,
  nameMatches,
  placeIdFromFtid,
  extractInstagramHandle,
  extractNameAndLocation,
  extractPlaceId,
  resolveSegment,
} from './parsing.ts'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const PLACES_API_KEY = Deno.env.get('GOOGLE_PLACES_API_KEY')

const FIELD_MASK = [
  'places.id',
  'places.displayName',
  'places.formattedAddress',
  'places.addressComponents',
  'places.location',
  'places.rating',
  'places.userRatingCount',
  'places.internationalPhoneNumber',
  'places.websiteUri',
  'places.businessStatus',
  'places.primaryType',
  'places.primaryTypeDisplayName',
].join(',')

const DETAILS_FIELD_MASK = FIELD_MASK.replace(/places\./g, '')

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  })
}

/** Segue o redirect de link curto (maps.app.goo.gl) e devolve a URL final. */
async function resolveMapsUrl(url: string): Promise<string> {
  const res = await fetch(url, { redirect: 'follow' })
  return res.url
}

async function findPlace(googleMapsUrl: string) {
  const resolved = await resolveMapsUrl(googleMapsUrl)

  // Place ID explícito na URL; senão o derivado do código 0x..:0x.. do Maps. O derivado
  // pode não existir no Places (404): aí segue pra busca por nome em vez de falhar.
  const explicitId = extractPlaceId(resolved)
  for (const placeId of [explicitId, placeIdFromFtid(resolved)]) {
    if (!placeId) continue
    const res = await fetch(
      `https://places.googleapis.com/v1/places/${placeId}?languageCode=pt-BR`,
      { headers: { 'X-Goog-Api-Key': PLACES_API_KEY!, 'X-Goog-FieldMask': DETAILS_FIELD_MASK } },
    )
    if (res.ok) return res.json()
    if (placeId === explicitId || res.status !== 404) {
      throw new Error(`Places API (details) falhou: ${res.status} ${await res.text()}`)
    }
  }

  const loc = extractNameAndLocation(resolved)
  if (!loc) {
    throw new Error(
      'Não reconheci esse link do Google Maps. Abra o local no app/site do Maps e copie o ' +
        'link da barra de endereço (não um link encurtado de compartilhamento).',
    )
  }

  // 1) pino do local, 2) centro do mapa (`@`), 3) só pelo nome, aceitando apenas
  // resultado a até 30 km do pino e cujo nome contenha todas as palavras buscadas.
  // Cada tentativa vale para o nome do caminho e para o título real do perfil.
  const titles = [...new Set([loc.name, extractMapsTitle(resolved)].filter((t): t is string => !!t))]
  const attempts = [{ lat: loc.lat, lng: loc.lng }, loc.center, null].flatMap((p) =>
    titles.map((title) => ({ p, title })),
  )
  for (const { p, title } of attempts) {
    const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': PLACES_API_KEY!,
        'X-Goog-FieldMask': FIELD_MASK,
      },
      body: JSON.stringify({
        textQuery: title,
        languageCode: 'pt-BR',
        ...(p && {
          locationBias: { circle: { center: { latitude: p.lat, longitude: p.lng }, radius: 200 } },
        }),
      }),
    })
    if (!res.ok) throw new Error(`Places API (busca) falhou: ${res.status} ${await res.text()}`)
    const places: {
      displayName?: { text?: string }
      location?: { latitude: number; longitude: number }
    }[] = (await res.json()).places ?? []
    // locationBias é só preferência: valida a distância e o nome pra não aceitar outro local.
    const place = places.find(
      (x) =>
        x.location &&
        kmBetween(x.location, loc) <= 30 &&
        titles.some((t) => nameMatches(t, x.displayName?.text ?? '')),
    )
    if (place) return place
  }
  throw new Error(
    `Nenhum resultado do Places API para ${titles.map((t) => `"${t}"`).join(' / ')} (pino ${loc.lat},${loc.lng}; ` +
      `centro ${loc.center.lat},${loc.center.lng}).`,
  )
}

function kmBetween(a: { latitude: number; longitude: number }, b: { lat: number; lng: number }) {
  const rad = Math.PI / 180
  const h =
    Math.sin(((b.lat - a.latitude) * rad) / 2) ** 2 +
    Math.cos(a.latitude * rad) * Math.cos(b.lat * rad) * Math.sin(((b.lng - a.longitude) * rad) / 2) ** 2
  return 12742 * Math.asin(Math.sqrt(h))
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS })

  if (!PLACES_API_KEY) {
    return jsonResponse({ error: 'GOOGLE_PLACES_API_KEY não configurada nos secrets da function.' }, 500)
  }

  let googleMapsUrl: string | undefined, instagramUrl: string | undefined
  try {
    ;({ googleMapsUrl, instagramUrl } = await req.json())
  } catch {
    return jsonResponse({ error: 'Corpo inválido, esperado JSON.' }, 400)
  }
  if (!googleMapsUrl && !instagramUrl) {
    return jsonResponse({ error: 'Informe ao menos um link: Google Maps ou Instagram.' }, 400)
  }

  try {
    // Cliente com o JWT de quem chamou (não service_role): o INSERT passa
    // pelo mesmo RLS "owner_insert_prospects" que o resto do CRM usa.
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } },
    )

    const place = googleMapsUrl ? await findPlace(googleMapsUrl) : null
    const handle = instagramUrl ? extractInstagramHandle(instagramUrl) : null

    const insert = {
      name: place?.displayName?.text ?? (handle ? `@${handle}` : '[PREENCHER]'),
      segment: resolveSegment(place?.primaryType ?? null, place?.primaryTypeDisplayName?.text ?? null),
      address: place?.formattedAddress ?? null,
      // sem cidade detectada, omite o campo e vale o default do banco
      ...(extractCity(place?.addressComponents) && { city: extractCity(place.addressComponents)! }),
      contact: place?.internationalPhoneNumber ?? null,
      website: place?.websiteUri ?? null,
      google_rating: place?.rating ?? null,
      google_reviews_count: place?.userRatingCount ?? null,
      google_place_id: place?.id ?? null,
      business_status: place?.businessStatus ?? null,
      instagram: handle ? `https://instagram.com/${handle}/` : null,
      source_url: googleMapsUrl ?? null,
    }

    const { data, error } = await supabase.from('prospects').insert(insert).select().single()
    if (error) return jsonResponse({ error: error.message }, 400)

    return jsonResponse({ prospect: data })
  } catch (err) {
    return jsonResponse({ error: err instanceof Error ? err.message : String(err) }, 500)
  }
})
