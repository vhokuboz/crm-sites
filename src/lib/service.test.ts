/// <reference types="node" />
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  continuePatch,
  pixReceivedPatch,
  reminderLabel,
  serviceDateLabel,
  serviceGroups,
  serviceQueue,
  serviceStartPatch,
  serviceState,
  serviceSummary,
  type ServiceInput,
} from './service.ts'
import { addMonthsISO, todayISO } from './domain.ts'
import type { Prospect } from './database.types.ts'

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

function prev(over: Record<string, unknown>): Prospect {
  return { status: 'aguardando_pagamento', service_started_at: null, ...over } as unknown as Prospect
}

test('serviceStartPatch - virar finalizado pela primeira vez abre o ciclo de 6 meses', () => {
  const patch = serviceStartPatch(prev({}), { status: 'finalizado' })
  assert.equal(patch.service_started_at, todayISO())
  assert.equal(patch.free_until, addMonthsISO(6, todayISO()))
  assert.equal(patch.status, 'finalizado')
})

test('serviceStartPatch - não sobrescreve ciclo já aberto nem refaz quando já era finalizado', () => {
  const aberto = prev({ service_started_at: '2026-09-12' })
  assert.deepEqual(serviceStartPatch(aberto, { status: 'finalizado' }), { status: 'finalizado' })
  const jaFinal = prev({ status: 'finalizado' })
  assert.deepEqual(serviceStartPatch(jaFinal, { status: 'finalizado' }), { status: 'finalizado' })
})

test('serviceStartPatch - patch sem status ou para outro status: intacto', () => {
  assert.deepEqual(serviceStartPatch(prev({}), { notes: 'x' }), { notes: 'x' })
  assert.deepEqual(serviceStartPatch(prev({}), { status: 'entrega' }), { status: 'entrega' })
})

test('serviceStartPatch - free_until explícito no patch vence', () => {
  const patch = serviceStartPatch(prev({}), { status: 'finalizado', free_until: '2030-01-01' })
  assert.equal(patch.free_until, '2030-01-01')
})

test('continuePatch - grava a mensalidade e cobra a partir do fim da isenção', () => {
  assert.deepEqual(continuePatch({ free_until: '2027-03-12' }, 89.9), {
    monthly_fee: 89.9,
    paid_until: '2027-03-12',
  })
})

test('pixReceivedPatch - soma 1 mês a partir do vencimento anterior, não de hoje', () => {
  assert.deepEqual(pixReceivedPatch({ paid_until: '2027-04-12', free_until: '2027-03-12' }), {
    paid_until: '2027-05-12',
  })
})

test('pixReceivedPatch - sem paid_until parte do fim da isenção', () => {
  assert.deepEqual(pixReceivedPatch({ paid_until: null, free_until: '2027-03-12' }), {
    paid_until: '2027-04-12',
  })
})

test('serviceDateLabel - cada estado diz a data que importa', () => {
  assert.equal(serviceDateLabel(svc(), '2026-12-01'), 'isento até 12/03/27')
  const pago = svc({ paid_until: '2027-04-12' })
  assert.equal(serviceDateLabel(pago, '2027-04-07'), 'vence em 5 dias')
  assert.equal(serviceDateLabel(pago, '2027-04-12'), 'vence hoje')
  assert.equal(serviceDateLabel(pago, '2027-04-13'), 'venceu há 1 dia')
  assert.equal(serviceDateLabel(pago, '2027-04-15'), 'venceu há 3 dias')
  assert.equal(serviceDateLabel(svc({ suspended_at: '2027-04-20' }), '2027-05-01'), 'suspenso em 20/04/27')
  assert.equal(serviceDateLabel(svc({ service_ended_at: '2027-05-01' }), '2027-06-01'), 'encerrado em 01/05/27')
})

test('reminderLabel - hoje, há N dias e sem lembrete', () => {
  assert.equal(reminderLabel({ last_reminded_at: null }, '2027-04-15'), null)
  assert.equal(reminderLabel({ last_reminded_at: '2027-04-15' }, '2027-04-15'), 'lembrado hoje')
  assert.equal(reminderLabel({ last_reminded_at: '2027-04-13' }, '2027-04-15'), 'lembrado há 2 dias')
})

function cli(id: string, over: Partial<ServiceInput> & { monthly_fee?: number | null } = {}): Prospect {
  return { id, name: id, monthly_fee: null, last_reminded_at: null, ...svc(over) } as unknown as Prospect
}

// Em 2027-04-20: a (pago até 12/04, 8 dias de atraso) = suspender; b (paga até 15/04) = a_cobrar;
// c (isento sem decisão, longe do fim) = isento; d (pago até 12/05) = ativo; e suspenso; f encerrado.
const HOJE = '2027-04-20'
const base = () => [
  cli('a', { paid_until: '2027-04-12' }),
  cli('b', { paid_until: '2027-04-15' }),
  cli('c', { free_until: '2027-10-01' }),
  cli('d', { paid_until: '2027-05-12', monthly_fee: 90 }),
  cli('e', { suspended_at: '2027-04-18' }),
  cli('f', { service_ended_at: '2027-04-10' }),
]

test('serviceGroups - agrupa por urgência e ordena pelo vencimento mais antigo', () => {
  const groups = serviceGroups(base(), HOJE)
  assert.deepEqual(
    groups.map((g) => [g.key, g.items.map((p) => p.id)]),
    [
      ['suspender', ['a']],
      ['a_cobrar', ['b']],
      ['ativos', ['d', 'c']],
      ['inativos', ['e', 'f']],
    ],
  )
})

test('serviceGroups - ignora quem não é cliente', () => {
  const naoCliente = { id: 'x', name: 'x', status: 'entrega' } as unknown as Prospect
  assert.deepEqual(serviceGroups([naoCliente], HOJE), [])
})

test('serviceSummary - ativos exclui suspenso/encerrado; mrr soma só pagantes em dia', () => {
  assert.deepEqual(serviceSummary(base(), HOJE), { ativos: 4, isentos: 1, pagantes: 1, mrr: 90 })
})

test('serviceQueue - suspender, depois a_cobrar, depois renovacao', () => {
  const lista = [...base(), cli('g', { free_until: '2027-05-01' })]
  assert.deepEqual(serviceQueue(lista, HOJE).map((p) => p.id), ['a', 'b', 'g'])
})
