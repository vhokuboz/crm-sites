import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { extractInstagramHandle, extractNameAndLocation, extractPlaceId } from './parsing.ts'

Deno.test('extractPlaceId - permalink com place_id', () => {
  assertEquals(
    extractPlaceId('https://www.google.com/maps/place/?q=place_id:ChIJN1t_tDeuEmsRUsoyG83frY4'),
    'ChIJN1t_tDeuEmsRUsoyG83frY4',
  )
})

Deno.test('extractPlaceId - sem place_id devolve null', () => {
  assertEquals(
    extractPlaceId('https://www.google.com/maps/place/Dentista+Bauru/@-22.31,-49.06,15z'),
    null,
  )
})

Deno.test('extractNameAndLocation - URL padrão de place', () => {
  assertEquals(
    extractNameAndLocation(
      'https://www.google.com/maps/place/Dentista+Bauru/@-22.3154,-49.0615,15z/data=xyz',
    ),
    { name: 'Dentista Bauru', lat: -22.3154, lng: -49.0615 },
  )
})

Deno.test('extractNameAndLocation - link curto ainda não resolvido devolve null', () => {
  assertEquals(extractNameAndLocation('https://maps.app.goo.gl/abc123'), null)
})

Deno.test('extractInstagramHandle - URL completa', () => {
  assertEquals(
    extractInstagramHandle('https://www.instagram.com/dra.laura.ribeiro/'),
    'dra.laura.ribeiro',
  )
})

Deno.test('extractInstagramHandle - sem instagram devolve null', () => {
  assertEquals(extractInstagramHandle('https://example.com'), null)
})
