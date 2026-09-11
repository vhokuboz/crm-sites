/// <reference types="node" />
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  addBusinessDaysISO,
  addDaysISO,
  canDiscard,
  closesHostedSite,
  statusTransitionPatch,
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
