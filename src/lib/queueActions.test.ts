/// <reference types="node" />
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { addBusinessDaysISO, addDaysISO } from './domain.ts'
import { canRepeat, contactPatch, matchesFilters, repeatPatch, snoozePatch } from './queueActions.ts'

test('snoozePatch - agenda a partir de hoje', () => {
  assert.equal(snoozePatch(3).next_action_at, addDaysISO(3))
})

test('contactPatch - antes do contato vira contatado, sem data (a transição agenda)', () => {
  const patch = contactPatch({ status: 'prototipado' })
  assert.equal(patch.status, 'contatado')
  assert.equal(patch.next_action_at, undefined)
  assert.ok(patch.last_contacted_at)
})

test('contactPatch - depois do contato soma 3 dias e mantém o status', () => {
  const patch = contactPatch({ status: 'contatado' })
  assert.equal(patch.status, undefined)
  assert.equal(patch.next_action_at, addDaysISO(3))
})

test('canRepeat - só contatado com retorno vencido ou de hoje', () => {
  assert.equal(canRepeat({ status: 'contatado', next_action_at: addDaysISO(-1) }), true)
  assert.equal(canRepeat({ status: 'contatado', next_action_at: addDaysISO(2) }), false)
  assert.equal(canRepeat({ status: 'prototipado', next_action_at: addDaysISO(-1) }), false)
  assert.equal(canRepeat({ status: 'contatado', next_action_at: null }), false)
})

test('repeatPatch - soma tentativa e agenda 3 dias úteis', () => {
  const patch = repeatPatch({ contact_attempts: 2 })
  assert.equal(patch.contact_attempts, 3)
  assert.equal(patch.next_action_at, addBusinessDaysISO(3))
})

test('matchesFilters - ignora acento e caixa, e combina segmento e status', () => {
  const p = { name: 'Clínica São José', segment: 'Dentista', city: 'Bauru', status: 'novo' } as const
  const none = { query: '', segment: '', status: '' }
  assert.equal(matchesFilters(p, { ...none, query: 'clinica sao jose' }), true)
  assert.equal(matchesFilters(p, { ...none, query: 'BAURU' }), true)
  assert.equal(matchesFilters(p, { ...none, query: 'advogado' }), false)
  assert.equal(matchesFilters(p, { ...none, segment: 'Dentista', status: 'novo' }), true)
  assert.equal(matchesFilters(p, { ...none, status: 'triagem' }), false)
})
