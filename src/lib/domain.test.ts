/// <reference types="node" />
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { addBusinessDaysISO, addDaysISO, statusTransitionPatch } from './domain.ts'
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

function fakeProspect(status: string, revisionCount = 0): Prospect {
  return { status, revision_count: revisionCount } as unknown as Prospect
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
