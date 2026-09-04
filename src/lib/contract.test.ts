/// <reference types="node" />
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildContractFieldMap, missingContractFields } from './contract.ts'
import type { Prospect } from './database.types.ts'

function fakeProspect(overrides: Partial<Prospect> = {}): Prospect {
  return {
    address: 'Rua Tal, 123',
    city: 'Bauru',
    deal_value: 1500,
    deposit_paid_amount: 375,
    final_paid_amount: null,
    legal_name: null,
    cpf_cnpj: null,
    rg: null,
    cep: null,
    ...overrides,
  } as unknown as Prospect
}

test('missingContractFields - devolve só os campos ainda vazios na ficha', () => {
  const p = fakeProspect({ legal_name: 'Fulano de Tal Ltda' })
  assert.deepEqual(missingContractFields(p), ['cpf_cnpj', 'rg', 'cep'])
})

test('missingContractFields - nenhum campo faltando devolve lista vazia', () => {
  const p = fakeProspect({ legal_name: 'x', cpf_cnpj: 'x', rg: 'x', cep: 'x' })
  assert.deepEqual(missingContractFields(p), [])
})

test('buildContractFieldMap - formulário tem prioridade sobre o que já está salvo', () => {
  const p = fakeProspect({ cpf_cnpj: '000.000.000-00' })
  const map = buildContractFieldMap(p, { cpf_cnpj: '111.111.111-11' })
  assert.equal(map.cpf_cnpj, '111.111.111-11')
})

test('buildContractFieldMap - usa o que já está salvo quando o formulário não traz o campo', () => {
  const p = fakeProspect({ legal_name: 'Fulano de Tal Ltda' })
  const map = buildContractFieldMap(p, {})
  assert.equal(map.nome_completo, 'Fulano de Tal Ltda')
})

test('buildContractFieldMap - campo ausente (form vazio e não salvo) vira string vazia', () => {
  const p = fakeProspect()
  const map = buildContractFieldMap(p, {})
  assert.equal(map.rg, '')
})

test('buildContractFieldMap - valores monetários em formato brasileiro', () => {
  const p = fakeProspect({ deal_value: 1500, deposit_paid_amount: 375, final_paid_amount: null })
  const map = buildContractFieldMap(p, {})
  assert.equal(map.valor_total, '1.500,00')
  assert.equal(map.valor_sinal, '375,00')
  assert.equal(map.valor_final, '')
})

test('buildContractFieldMap - data_hoje no formato dd/mm/aaaa com ano completo', () => {
  const p = fakeProspect()
  const map = buildContractFieldMap(p, {})
  assert.match(map.data_hoje, /^\d{2}\/\d{2}\/\d{4}$/)
})

test('buildContractFieldMap - valores do formulário vêm com espaços cortados', () => {
  const p = fakeProspect({ legal_name: 'Salvo Antes' })
  const map = buildContractFieldMap(p, {
    cpf_cnpj: '  000.000.000-00  ',
    rg: '  1234567  ',
    cep: '  17000-000  ',
    legal_name: '   ',
  })
  assert.equal(map.cpf_cnpj, '000.000.000-00')
  assert.equal(map.rg, '1234567')
  assert.equal(map.cep, '17000-000')
  // Formulário só espaços conta como "não preenchido" -- cai pro que já está salvo.
  assert.equal(map.nome_completo, 'Salvo Antes')
})
