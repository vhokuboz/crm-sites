/// <reference types="node" />
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  addBusinessDaysISO,
  addDaysISO,
  addMonthsISO,
  canDiscard,
  closesHostedSite,
  buildQueue,
  daysBetweenISO,
  readyToSend,
  statusTransitionPatch,
  canEnterContatado,
  discardPatch,
  isCobrancaExpirada,
} from './domain.ts'
import type { Prospect } from './database.types.ts'

// 2026-09-04 é sexta-feira; 2026-09-05/06 são sábado/domingo.
test('addBusinessDaysISO - pula fim de semana indo de sexta pra segunda', () => {
  assert.equal(addBusinessDaysISO(1, '2026-09-04'), '2026-09-07')
})

// 2026-09-03 é quinta-feira: +3 dias úteis = sex, seg, ter.
test('addBusinessDaysISO - soma 3 dias úteis cruzando um fim de semana', () => {
  assert.equal(addBusinessDaysISO(3, '2026-09-03'), '2026-09-08')
})

test('addBusinessDaysISO - sem fim de semana no meio soma direto', () => {
  // 2026-09-01 é terça; +2 dias úteis = quarta, quinta.
  assert.equal(addBusinessDaysISO(2, '2026-09-01'), '2026-09-03')
})

function fakeProspect(
  status: string,
  revisionCount = 0,
  landingPageUrl: string | null = null,
): Prospect {
  return {
    status,
    revision_count: revisionCount,
    landing_page_url: landingPageUrl,
  } as unknown as Prospect
}

test('statusTransitionPatch - entrar em contatado agenda 3 dias úteis à frente', () => {
  const previous = fakeProspect('prototipado')
  const patch = statusTransitionPatch(previous, { status: 'contatado' })
  assert.equal(patch.next_action_at, addBusinessDaysISO(3))
})

test('statusTransitionPatch - entrar em aguardando_pendencias agenda 2 dias corridos à frente', () => {
  const previous = fakeProspect('briefing')
  const patch = statusTransitionPatch(previous, { status: 'aguardando_pendencias' })
  assert.equal(patch.next_action_at, addDaysISO(2))
})

test('statusTransitionPatch - voltar de em_analise pra refinamento soma revision_count', () => {
  const previous = fakeProspect('em_analise', 1)
  const patch = statusTransitionPatch(previous, { status: 'refinamento' })
  assert.equal(patch.revision_count, 2)
})

test('statusTransitionPatch - ir pra refinamento sem vir de em_analise nao mexe em revision_count', () => {
  const previous = fakeProspect('aguardando_pendencias', 0)
  const patch = statusTransitionPatch(previous, { status: 'refinamento' })
  assert.equal('revision_count' in patch, false)
})

test('statusTransitionPatch - mudanca sem regra associada nao adiciona nada ao patch', () => {
  const previous = fakeProspect('entrega')
  const patch = statusTransitionPatch(previous, { status: 'aguardando_pagamento', notes: 'x' })
  assert.deepEqual(patch, { status: 'aguardando_pagamento', notes: 'x' })
})

test('statusTransitionPatch - status igual ao atual nao aplica regra nenhuma', () => {
  const previous = fakeProspect('contatado')
  const patch = statusTransitionPatch(previous, { status: 'contatado', notes: 'y' })
  assert.deepEqual(patch, { status: 'contatado', notes: 'y' })
})

test('closesHostedSite - vira perdido com preview publicado: true', () => {
  const previous = fakeProspect('contatado', 0, 'https://preview.slug.pages.dev')
  assert.equal(closesHostedSite(previous, { status: 'perdido' }), true)
})

test('closesHostedSite - vira descartado com preview publicado: true', () => {
  const previous = fakeProspect('novo', 0, 'https://preview.slug.pages.dev')
  assert.equal(closesHostedSite(previous, { status: 'descartado' }), true)
})

test('closesHostedSite - sem landing_page_url: false', () => {
  const previous = fakeProspect('contatado', 0, null)
  assert.equal(closesHostedSite(previous, { status: 'perdido' }), false)
})

test('closesHostedSite - status igual ao atual nao fecha nada: false', () => {
  const previous = fakeProspect('perdido', 0, 'https://preview.slug.pages.dev')
  assert.equal(closesHostedSite(previous, { status: 'perdido' }), false)
})

test('closesHostedSite - vira status que nao encerra (ex: finalizado): false', () => {
  const previous = fakeProspect('entrega', 0, 'https://preview.slug.pages.dev')
  assert.equal(closesHostedSite(previous, { status: 'finalizado' }), false)
})

test('closesHostedSite - patch sem status: false', () => {
  const previous = fakeProspect('contatado', 0, 'https://preview.slug.pages.dev')
  assert.equal(closesHostedSite(previous, { notes: 'x' }), false)
})

test('canDiscard - false para novo, triagem, prototipado, perdido e descartado', () => {
  for (const status of ['novo', 'triagem', 'prototipado', 'perdido', 'descartado']) {
    assert.equal(canDiscard(fakeProspect(status)), false)
  }
})

test('canDiscard - true a partir de contatado em diante', () => {
  assert.equal(canDiscard(fakeProspect('contatado')), true)
  assert.equal(canDiscard(fakeProspect('finalizado')), true)
})

test('statusTransitionPatch - patch reenvia a mesma next_action_at que ja estava salva: regra automatica vence', () => {
  const previous = { ...fakeProspect('prototipado'), next_action_at: null } as Prospect
  const patch = statusTransitionPatch(previous, { status: 'contatado', next_action_at: null })
  assert.equal(patch.next_action_at, addBusinessDaysISO(3))
})

test('statusTransitionPatch - patch traz uma next_action_at diferente da que ja estava salva: valor do patch vence', () => {
  const previous = { ...fakeProspect('prototipado'), next_action_at: null } as Prospect
  const patch = statusTransitionPatch(previous, { status: 'contatado', next_action_at: '2099-01-01' })
  assert.equal(patch.next_action_at, '2099-01-01')
})

test('addMonthsISO - soma 6 meses mantendo o dia', () => {
  assert.equal(addMonthsISO(6, '2026-09-12'), '2027-03-12')
})

test('addMonthsISO - dia 31 cai no último dia do mês mais curto', () => {
  assert.equal(addMonthsISO(1, '2026-01-31'), '2026-02-28')
})

test('addMonthsISO - ano bissexto', () => {
  assert.equal(addMonthsISO(1, '2028-01-31'), '2028-02-29')
})

test('addMonthsISO - vira o ano', () => {
  assert.equal(addMonthsISO(1, '2026-12-15'), '2027-01-15')
})

test('daysBetweenISO - positivo quando "to" é depois, negativo quando antes', () => {
  assert.equal(daysBetweenISO('2027-02-10', '2027-03-12'), 30)
  assert.equal(daysBetweenISO('2026-09-05', '2026-09-01'), -4)
})

function fakeService(patch: Record<string, unknown>): Prospect {
  return { status: 'finalizado', landing_page_url: 'https://x.pages.dev', ...patch } as unknown as Prospect
}

test('closesHostedSite - suspender serviço com site publicado: true', () => {
  assert.equal(closesHostedSite(fakeService({}), { suspended_at: '2027-04-20' }), true)
})

test('closesHostedSite - encerrar serviço com site publicado: true', () => {
  assert.equal(closesHostedSite(fakeService({}), { service_ended_at: '2027-04-20' }), true)
})

test('closesHostedSite - encerrar depois de suspenso: false (site já foi derrubado)', () => {
  const previous = fakeService({ suspended_at: '2027-04-20' })
  assert.equal(closesHostedSite(previous, { service_ended_at: '2027-05-01' }), false)
})

test('closesHostedSite - reativar (suspended_at null): false', () => {
  const previous = fakeService({ suspended_at: '2027-04-20' })
  assert.equal(closesHostedSite(previous, { suspended_at: null }), false)
})

test('closesHostedSite - suspender sem landing_page_url: false', () => {
  assert.equal(closesHostedSite(fakeService({ landing_page_url: null }), { suspended_at: '2027-04-20' }), false)
})

test('statusTransitionPatch - perdido e descartado zeram next_action_at e last_reminded_at', () => {
  for (const status of ['perdido', 'descartado'] as const) {
    const previous = fakeProspect('contatado')
    const patch = statusTransitionPatch(previous, { status, next_action_at: '2026-12-01' })
    assert.equal(patch.next_action_at, null)
    assert.equal(patch.last_reminded_at, null)
  }
})

function ready(over: Partial<Prospect> = {}): Prospect {
  return {
    id: 'x', status: 'prototipado', approach_message: 'Oi!', landing_page_url: 'https://cliente.pages.dev',
    next_action_at: null, google_rating: null, website_quality: null, website: null,
    ...over,
  } as unknown as Prospect
}

test('readyToSend - exige prototipado, mensagem escrita e URL do preview', () => {
  assert.equal(readyToSend(ready()), true)
  assert.equal(readyToSend(ready({ status: 'triagem' })), false)
  assert.equal(readyToSend(ready({ approach_message: '   ' })), false)
  assert.equal(readyToSend(ready({ approach_message: null })), false)
  assert.equal(readyToSend(ready({ landing_page_url: null })), false)
})

test('buildQueue - pronto para enviar sai das outras listas, mesmo atrasado', () => {
  const atrasado = ready({ id: 'a', next_action_at: addDaysISO(-2) })
  const semDataSemMensagem = ready({ id: 'b', approach_message: null })
  const q = buildQueue([atrasado, semDataSemMensagem])
  assert.deepEqual(q.proposal.map((p) => p.id), ['a'])
  assert.deepEqual(q.overdue.map((p) => p.id), [])
  assert.deepEqual(q.unscheduled.map((p) => p.id), ['b'])
})

test('buildQueue - proposta ordena por data de retorno, sem data por último', () => {
  const q = buildQueue([
    ready({ id: 'sem' }),
    ready({ id: 'hoje', next_action_at: addDaysISO(0) }),
    ready({ id: 'velho', next_action_at: addDaysISO(-5) }),
  ])
  assert.deepEqual(q.proposal.map((p) => p.id), ['velho', 'hoje', 'sem'])
})

test('statusTransitionPatch - entrar em contatado zera as cobranças', () => {
  const previous = { ...fakeProspect('prototipado'), contact_attempts: 1 } as Prospect
  assert.equal(statusTransitionPatch(previous, { status: 'contatado' }).contact_attempts, 0)
})

test('canEnterContatado - só quem ainda não passou de contatado', () => {
  for (const s of ['novo', 'triagem', 'prototipado', 'contatado']) assert.equal(canEnterContatado({ status: s as Prospect['status'] }), true, s)
  for (const s of ['briefing', 'finalizado', 'perdido', 'descartado']) assert.equal(canEnterContatado({ status: s as Prospect['status'] }), false, s)
})

test('isCobrancaExpirada - 2 cobranças e retorno já passado', () => {
  const base = { status: 'contatado', contact_attempts: 2, next_action_at: addDaysISO(-1) } as const
  assert.equal(isCobrancaExpirada(base), true)
  assert.equal(isCobrancaExpirada({ ...base, next_action_at: addDaysISO(0) }), false)
  assert.equal(isCobrancaExpirada({ ...base, contact_attempts: 1 }), false)
  assert.equal(isCobrancaExpirada({ ...base, status: 'briefing' }), false)
  assert.equal(isCobrancaExpirada({ ...base, next_action_at: null }), false)
})

test('discardPatch - anexa a nota às notas existentes', () => {
  assert.deepEqual(discardPatch({ notes: 'a' }, 'b'), { status: 'descartado', next_action_at: null, notes: 'a\n\nb' })
  assert.equal(discardPatch({ notes: null }, '').notes, null)
})
