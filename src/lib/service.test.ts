/// <reference types="node" />
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { serviceState, type ServiceInput } from './service.ts'

// Isenção de 6 meses: serviço começou em 12/09/2026, isento até 12/03/2027.
function svc(over: Partial<ServiceInput> = {}): ServiceInput {
  return {
    status: 'finalizado',
    service_started_at: '2026-09-12',
    free_until: '2027-03-12',
    paid_until: null,
    suspended_at: null,
    service_ended_at: null,
    ...over,
  }
}

test('serviceState - fora de finalizado ou sem início do serviço: null', () => {
  assert.equal(serviceState(svc({ status: 'entrega' }), '2026-12-01'), null)
  assert.equal(serviceState(svc({ service_started_at: null }), '2026-12-01'), null)
})

test('serviceState - dentro da isenção e longe do fim: isento', () => {
  assert.equal(serviceState(svc(), '2026-12-01'), 'isento')
})

test('serviceState - 31 dias antes do fim da isenção ainda é isento, 30 vira renovacao', () => {
  assert.equal(serviceState(svc(), '2027-02-09'), 'isento')
  assert.equal(serviceState(svc(), '2027-02-10'), 'renovacao')
})

test('serviceState - último dia da isenção sem decisão: renovacao', () => {
  assert.equal(serviceState(svc(), '2027-03-12'), 'renovacao')
})

test('serviceState - quem já optou por continuar segue isento até o fim da isenção', () => {
  assert.equal(serviceState(svc({ paid_until: '2027-03-12' }), '2027-02-20'), 'isento')
})

test('serviceState - isenção acabou sem decisão: vence em free_until, a_cobrar no dia seguinte', () => {
  assert.equal(serviceState(svc(), '2027-03-13'), 'a_cobrar')
})

test('serviceState - optou por continuar e a isenção acabou: a_cobrar até o primeiro Pix', () => {
  assert.equal(serviceState(svc({ paid_until: '2027-03-12' }), '2027-03-13'), 'a_cobrar')
})

test('serviceState - pago até o futuro ou até hoje: ativo', () => {
  assert.equal(serviceState(svc({ paid_until: '2027-04-12' }), '2027-03-13'), 'ativo')
  assert.equal(serviceState(svc({ paid_until: '2027-04-12' }), '2027-04-12'), 'ativo')
})

test('serviceState - atraso de 1 a 7 dias: a_cobrar; 8 em diante: suspender', () => {
  const p = svc({ paid_until: '2027-04-12' })
  assert.equal(serviceState(p, '2027-04-13'), 'a_cobrar')
  assert.equal(serviceState(p, '2027-04-19'), 'a_cobrar')
  assert.equal(serviceState(p, '2027-04-20'), 'suspender')
})

test('serviceState - suspenso e encerrado vencem qualquer data; encerrado vence suspenso', () => {
  assert.equal(serviceState(svc({ suspended_at: '2027-04-20' }), '2026-12-01'), 'suspenso')
  assert.equal(serviceState(svc({ service_ended_at: '2027-05-01' }), '2026-12-01'), 'encerrado')
  assert.equal(
    serviceState(svc({ suspended_at: '2027-04-20', service_ended_at: '2027-05-01' }), '2027-06-01'),
    'encerrado',
  )
})
