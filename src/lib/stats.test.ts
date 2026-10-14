/// <reference types="node" />
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { conversionBy, dimensionKey, wasContacted, weekStartISO, weeklyCounts, toLocalISO } from './stats.ts'
import type { Prospect } from './database.types.ts'

const fake = (o: Partial<Prospect>): Prospect =>
  ({
    status: 'novo', segment: 'Dentistas', city: 'Bauru/SP', contact_attempts: 0,
    last_contacted_at: null, prospected_at: '2020-01-01', contract_generated_at: null,
    service_started_at: null, website: null, website_quality: null, google_rating: null, ...o,
  }) as Prospect

test('weekStartISO - volta para a segunda-feira', () => {
  assert.equal(weekStartISO('2026-10-14'), '2026-10-12') // quarta
  assert.equal(weekStartISO('2026-10-12'), '2026-10-12') // segunda
  assert.equal(weekStartISO('2026-10-18'), '2026-10-12') // domingo
})

test('toLocalISO - data pura passa direto', () => {
  assert.equal(toLocalISO('2026-10-14'), '2026-10-14')
})

test('weeklyCounts - conta por semana e so a atual traz contatados', () => {
  const ps = [
    fake({ prospected_at: '2026-10-13', last_contacted_at: '2026-10-14T15:00:00' }),
    fake({ prospected_at: '2026-10-06', service_started_at: '2026-10-07' }),
    fake({ prospected_at: '2026-09-01' }), // fora das 4 semanas
  ]
  const w = weeklyCounts(ps, '2026-10-14')
  assert.equal(w.length, 4)
  assert.equal(w[3].start, '2026-10-12')
  assert.equal(w[3].novos, 1)
  assert.equal(w[3].contatados, 1)
  assert.equal(w[2].novos, 1)
  assert.equal(w[2].fechamentos, 1)
  assert.equal(w[2].contatados, null)
})

test('wasContacted - registro de contato ou etapa posterior', () => {
  assert.equal(wasContacted(fake({})), false)
  assert.equal(wasContacted(fake({ contact_attempts: 1 })), true)
  assert.equal(wasContacted(fake({ status: 'briefing' })), true)
})

test('conversionBy - taxas sobre contatados e amostra pequena', () => {
  const ps = [
    fake({ status: 'finalizado', last_contacted_at: '2026-01-01' }),
    fake({ status: 'contatado', last_contacted_at: '2026-01-01' }),
    fake({ status: 'perdido', last_contacted_at: '2026-01-01' }),
    fake({ status: 'novo' }),
  ]
  const [row] = conversionBy(ps, (p) => p.segment)
  assert.equal(row.total, 4)
  assert.equal(row.contacted, 3)
  assert.equal(row.responded, 1)
  assert.equal(row.won, 1)
  assert.equal(row.respRate, 1 / 3)
  assert.equal(row.small, true)
})

test('dimensionKey - presenca e lacuna em faixas', () => {
  assert.equal(dimensionKey('presenca', fake({ website_quality: 'sem site' })), 'Sem site')
  assert.equal(dimensionKey('presenca', fake({})), 'Não avaliado')
  assert.equal(dimensionKey('lacuna', fake({ google_rating: 4.8, website_quality: 'sem site' })), 'Grande (3 pontos ou mais)')
  assert.equal(dimensionKey('lacuna', fake({})), 'Sem nota ou presença')
})
