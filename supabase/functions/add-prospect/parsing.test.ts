import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import {
  extractCity,
  extractMapsTitle,
  nameMatches,
  placeIdFromFtid,
  extractInstagramHandle,
  extractNameAndLocation,
  extractPlaceId,
  resolveSegment,
} from './parsing.ts'

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
    { name: 'Dentista Bauru', lat: -22.3154, lng: -49.0615, center: { lat: -22.3154, lng: -49.0615 } },
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

Deno.test('resolveSegment - tipo mapeado tem prioridade sobre o nome legível', () => {
  assertEquals(resolveSegment('dentist', 'Dentista'), 'Dentistas')
})

Deno.test('resolveSegment - tipo sem mapeamento cai no nome legível do Places API', () => {
  assertEquals(resolveSegment('legal_services', 'Consultoria'), 'Consultoria')
})

Deno.test('resolveSegment - sem tipo nem nome usa placeholder', () => {
  assertEquals(resolveSegment(null, null), '[PREENCHER]')
})

Deno.test('extractCity - monta Cidade/UF', () => {
  assertEquals(
    extractCity([
      { longText: 'Marília', shortText: 'Marília', types: ['administrative_area_level_2', 'political'] },
      { longText: 'São Paulo', shortText: 'SP', types: ['administrative_area_level_1', 'political'] },
    ]),
    'Marília/SP',
  )
  assertEquals(extractCity(undefined), null)
})

Deno.test('extractNameAndLocation - prefere a posição do pino (!3d!4d) ao centro do mapa (@)', () => {
  assertEquals(
    extractNameAndLocation(
      'https://www.google.com/maps/place/Nutricionista+Giovanna+Milani/@-23.7837918,-46.5410921,13z/data=!4m7!3m6!1s0x94ce43b5d02323e1:0xebd55f8208f22fc!8m2!3d-23.7837918!4d-46.4648744?entry=tts',
    ),
    {
      name: 'Nutricionista Giovanna Milani',
      lat: -23.7837918,
      lng: -46.4648744,
      center: { lat: -23.7837918, lng: -46.5410921 },
    },
  )
})

Deno.test('extractMapsTitle - título real do perfil no parâmetro !15s', () => {
  assertEquals(
    extractMapsTitle(
      'https://www.google.com/maps/place/Nutricionista+Giovanna+Milani/@-23.78,-46.54,13z/data=!4m7!3m6!8m2!3d-23.78!4d-46.46!15sCh9HaW92YW5uYSBNaWxhbmkgfCBOdXRyaWNpb25pc3RhWh8iHWdpb3Zhbm5hIG1pbGFuaSBudXRyaWNpb25pc3Rh!16s%2Fg%2F11kk16_126',
    ),
    'Giovanna Milani | Nutricionista',
  )
  assertEquals(extractMapsTitle('https://www.google.com/maps/place/X/@1.0,2.0,15z'), null)
})

Deno.test('nameMatches - exige todas as palavras, ignora ordem, acento e caixa', () => {
  assertEquals(nameMatches('Nutricionista Giovanna Milani', 'Giovanna Milani | Nutricionista'), true)
  assertEquals(nameMatches('Clínica Fisicom', 'clinica FISICOM'), true)
  assertEquals(
    nameMatches('Nutricionista Giovanna Milani', 'Nutricionista clínica e esportiva - Giovanna Drudi'),
    false,
  )
})

Deno.test('placeIdFromFtid - converte o código 0x..:0x.. do Maps em Place ID', () => {
  assertEquals(
    placeIdFromFtid('https://www.google.com/maps/place/X/@1,2,11z/data=!4m6!3m5!1s0x94ce43b5d02323e1:0xebd55f8208f22fc!8m2'),
    'ChIJ4SMj0LVDzpQR_CKPIPhVvQ4',
  )
  assertEquals(placeIdFromFtid('https://www.google.com/maps/place/X/@1,2,11z'), null)
})
