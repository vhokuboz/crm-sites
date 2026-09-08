// Recebe o slug de um prospect encerrado (perdido/descartado) e dispara o
// workflow do agent-okaisites que remove o projeto Cloudflare Pages
// correspondente.
import { buildDispatchRequest } from './dispatch.ts'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const GH_DISPATCH_TOKEN = Deno.env.get('GH_DISPATCH_TOKEN')

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS })

  if (!GH_DISPATCH_TOKEN) {
    return jsonResponse({ error: 'GH_DISPATCH_TOKEN não configurada nos secrets da function.' }, 500)
  }

  let slug: string | undefined
  try {
    ;({ slug } = await req.json())
  } catch {
    return jsonResponse({ error: 'Corpo inválido, esperado JSON.' }, 400)
  }
  if (!slug) {
    return jsonResponse({ error: 'Informe o slug do prospect.' }, 400)
  }

  const { url, init } = buildDispatchRequest(slug, GH_DISPATCH_TOKEN)
  const res = await fetch(url, init)

  if (!res.ok) {
    return jsonResponse({ error: `GitHub API respondeu ${res.status}: ${await res.text()}` }, 502)
  }

  return jsonResponse({ dispatched: true })
})
