// Recebe link do Google Maps + link do Instagram, resolve os dados
// determinísticos (nome, endereço, nota, avaliações, telefone, site) via
// Places API e grava um prospect novo em public.prospects.
//
// O que fica de fora de propósito: website_quality e problem, que exigem
// olhar o site/Instagram e julgar — isso continua sendo trabalho de um
// agente depois, não desta function.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
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

  const placeId = extractPlaceId(resolved)
  if (placeId) {
    const res = await fetch(
      `https://places.googleapis.com/v1/places/${placeId}?languageCode=pt-BR`,
      { headers: { 'X-Goog-Api-Key': PLACES_API_KEY!, 'X-Goog-FieldMask': DETAILS_FIELD_MASK } },
    )
    if (!res.ok) throw new Error(`Places API (details) falhou: ${res.status} ${await res.text()}`)
    return res.json()
  }

  const loc = extractNameAndLocation(resolved)
  if (!loc) {
    throw new Error(
      'Não reconheci esse link do Google Maps. Abra o local no app/site do Maps e copie o ' +
        'link da barra de endereço (não um link encurtado de compartilhamento).',
    )
  }

  const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': PLACES_API_KEY!,
      'X-Goog-FieldMask': FIELD_MASK,
    },
    body: JSON.stringify({
      textQuery: loc.name,
      languageCode: 'pt-BR',
      locationBias: { circle: { center: { latitude: loc.lat, longitude: loc.lng }, radius: 200 } },
    }),
  })
  if (!res.ok) throw new Error(`Places API (busca) falhou: ${res.status} ${await res.text()}`)
  const data = await res.json()
  const place = data.places?.[0]
  if (!place) throw new Error(`Nenhum resultado do Places API para "${loc.name}".`)
  return place
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
