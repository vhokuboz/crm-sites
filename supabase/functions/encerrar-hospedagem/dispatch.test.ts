import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { buildDispatchRequest } from './dispatch.ts'

Deno.test('buildDispatchRequest - monta URL do repo e workflow corretos', () => {
  const { url } = buildDispatchRequest('advogada-jessica-juliao', 'tok')
  assertEquals(
    url,
    'https://api.github.com/repos/vhokuboz/agent-okaisites/actions/workflows/encerrar-cliente.yml/dispatches',
  )
})

Deno.test('buildDispatchRequest - body leva o slug como input e ref main', () => {
  const { init } = buildDispatchRequest('advogada-jessica-juliao', 'tok')
  assertEquals(JSON.parse(init.body as string), {
    ref: 'main',
    inputs: { slug: 'advogada-jessica-juliao' },
  })
})

Deno.test('buildDispatchRequest - usa o token no header Authorization', () => {
  const { init } = buildDispatchRequest('slug-x', 'meu-token')
  const headers = init.headers as Record<string, string>
  assertEquals(headers.Authorization, 'Bearer meu-token')
})
