import test from 'node:test'
import assert from 'node:assert/strict'
import { parseOrcid, mapOrcidPerson, mapOrcidEmployments, fetchOrcidPerson, initialOrcidSelection, applyOrcidSelection } from './orcid.js'

const id = '0000-0001-6661-8469'
const sparsePerson = {
  path: `/${id}/person`,
  name: { 'given-names': { value: 'Sherzod' }, 'family-name': { value: 'Turaev' } },
  biography: null,
  keywords: { keyword: [] },
}
const personWithBio = {
  ...sparsePerson,
  biography: { content: 'My actual biography.', 'last-modified-date': { value: 1700000000000 } },
  keywords: { keyword: [{ content: 'Automata; Logic' }, { content: 'logic, Theory' }] },
}
const affiliation = (overrides = {}) => ({
  visibility: 'public',
  organization: { name: 'Example University' },
  'role-title': 'Professor',
  'department-name': 'Computer Science',
  'start-date': { year: { value: '2020' }, month: { value: '09' }, day: null },
  'end-date': null,
  ...overrides,
})
const employments = (...items) => ({
  path: `/${id}/employments`,
  'affiliation-group': items.map(item => ({ summaries: [{ 'employment-summary': item }] })),
})
const ok = body => ({ ok: true, json: async () => body })
const abortError = () => Object.assign(new Error('aborted'), { name: 'AbortError' })

// Fixtures model the sparse /person response and v3 public grouped affiliation shape;
// these tests never contact ORCID or infer research interests from employment.
test('parses the supplied ORCID and validates checksums and profile hosts', () => {
  assert.equal(parseOrcid(id), id)
  assert.equal(parseOrcid('  https://orcid.org/0000-0001-6661-8469/  '), id)
  assert.equal(parseOrcid('0000000166618469'), id)
  assert.equal(parseOrcid('0000-0002-1694-233x'), '0000-0002-1694-233X')
  assert.throws(() => parseOrcid('0000-0001-6661-8468'), /check digit/)
  for (const input of ['bad', 'https://evil.example/' + id, 'https://orcid.org.evil.example/' + id, 'https://user@orcid.org/' + id]) {
    assert.throws(() => parseOrcid(input))
  }
})

test('sparse person retains the real name without inventing biography or keywords', () => {
  assert.deepEqual(mapOrcidPerson(sparsePerson, id), {
    id, name: 'Sherzod Turaev', bio: '', interests: '', expertise: '',
    biographyUpdated: '', department: '', employment: '', warnings: [],
  })
  const record = mapOrcidPerson(personWithBio, id)
  assert.equal(record.bio, 'My actual biography.')
  assert.equal(record.interests, 'Automata, Logic, Theory')
  assert.equal(record.expertise, record.interests)
  assert.ok(record.biographyUpdated)
  assert.throws(() => mapOrcidPerson({ ...sparsePerson, path: '/different/person' }, id), /unexpected profile/)
})

test('maps grouped current and historical public employment as factual text', () => {
  const data = employments(affiliation())
  data['affiliation-group'][0].summaries.push({
    'employment-summary': affiliation({
      organization: { name: 'Previous University' },
      'department-name': 'Mathematics',
      'start-date': { year: { value: '2010' } },
      'end-date': { year: { value: '2019' } },
    })
  })
  assert.deepEqual(mapOrcidEmployments(data, id), {
    department: 'Computer Science',
    employment: 'Professor, Computer Science, Example University (2020-09 – present)\nProfessor, Mathematics, Previous University (2010 – 2019)',
    warnings: [],
  })
})

test('accepts lowercase public visibility from ORCID and uppercase public visibility', () => {
  for (const visibility of ['public', 'PUBLIC', ' Public ']) {
    const result = mapOrcidEmployments(employments(affiliation({
      visibility,
      'department-name': 'Computer Science and Software Engineering',
    })), id)
    assert.equal(result.department, 'Computer Science and Software Engineering')
    assert.match(result.employment, /Professor, Computer Science and Software Engineering/)
    assert.deepEqual(result.warnings, [])
  }
})

test('requires the exact top-level employment path and grouped shape', () => {
  for (const data of [null, {}, { ...employments(), path: '/other/employments' },
    { ...employments(), path: `/${id}/person` },
    { path: `/${id}/employments`, 'employment-summary': [affiliation()] }]) {
    assert.throws(() => mapOrcidEmployments(data, id), /unexpected employment/)
  }
  assert.deepEqual(mapOrcidEmployments(employments(), id), { department: '', employment: '', warnings: [] })
})

test('omits private, limited, unmarked and invalid records without using their departments', () => {
  const data = employments(
    affiliation({ visibility: 'PRIVATE' }), affiliation({ visibility: 'LIMITED' }),
    affiliation({ visibility: 'private' }), affiliation({ visibility: 'limited' }),
    affiliation({ visibility: undefined }), affiliation({ organization: null }),
    affiliation({ 'start-date': {} }),
    affiliation({ 'start-date': { year: { value: '2020' }, month: { value: '13' } } }),
    affiliation({ 'end-date': { year: { value: '2021' }, month: { value: '02' }, day: { value: '30' } } }),
    affiliation({ 'end-date': { year: { value: '2010' } } }), null,
  )
  data['affiliation-group'].push(null, { summaries: null }, { summaries: [null, {}] })
  assert.deepEqual(mapOrcidEmployments(data, id), { department: '', employment: '', warnings: [] })
})

test('department is blank for conflicting current departments, with a manual-choice warning', () => {
  const result = mapOrcidEmployments(employments(affiliation(), affiliation({ 'department-name': 'Mathematics' })), id)
  assert.equal(result.department, '')
  assert.match(result.warnings.join(' '), /multiple current.*choose.*manually/i)
  assert.match(result.employment, /Computer Science/)
  assert.match(result.employment, /Mathematics/)
})

test('department requires current, unambiguous employment, not a historical job', () => {
  const historical = affiliation({ 'end-date': { year: { value: '2024' } } })
  assert.equal(mapOrcidEmployments(employments(historical), id).department, '')
  assert.equal(mapOrcidEmployments(employments(affiliation(), affiliation({ organization: { name: 'Other University' } })), id).department, 'Computer Science')
  assert.equal(mapOrcidEmployments(employments(affiliation(), affiliation({ 'department-name': null })), id).department, '')
  const undated = mapOrcidEmployments(employments(affiliation({ 'start-date': null })), id)
  assert.match(undated.employment, /Dates not supplied/)
})

test('deduplicates and caps summaries but considers all current departments', () => {
  const items = Array.from({ length: 25 }, (_, i) => affiliation({ organization: { name: `University ${i}` } }))
  const result = mapOrcidEmployments(employments(...items, items[0], affiliation({ 'department-name': 'Physics' })), id)
  assert.equal(result.employment.split('\n').length, 20)
  assert.equal(result.department, '')
  assert.match(result.warnings.join(' '), /first 20/)
  assert.match(result.warnings.join(' '), /multiple current/)
  assert.equal(mapOrcidEmployments(employments(items[0], items[0]), id).employment.split('\n').length, 1)
})

test('fetches sparse person and public employments with the same timeout signal', async () => {
  const calls = []
  const record = await fetchOrcidPerson(id, async (url, options) => {
    calls.push({ url, options })
    return ok(url.endsWith('/person') ? sparsePerson : employments(affiliation()))
  })
  assert.deepEqual(calls.map(call => call.url), [
    `https://pub.orcid.org/v3.0/${id}/person`, `https://pub.orcid.org/v3.0/${id}/employments`,
  ])
  assert.equal(calls[0].options.signal, calls[1].options.signal)
  assert.equal(calls[0].options.headers.Accept, 'application/json')
  assert.equal(calls[1].options.headers.Accept, 'application/json')
  assert.equal(record.name, 'Sherzod Turaev')
  assert.equal(record.bio, '')
  assert.equal(record.interests, '')
  assert.equal(record.expertise, '')
  assert.equal(record.department, 'Computer Science')
  assert.match(record.employment, /Professor/)
  assert.deepEqual(record.warnings, [])
})

test('no employment data is a successful empty optional result', async () => {
  const record = await fetchOrcidPerson(id, async url => ok(url.endsWith('/person') ? sparsePerson : employments()))
  assert.equal(record.employment, '')
  assert.equal(record.department, '')
  assert.deepEqual(record.warnings, [])
})

test('optional HTTP, network, JSON, mapping and abort failures preserve person data with warnings', async () => {
  const failures = [
    async () => ({ ok: false, status: 503 }),
    async () => { throw new TypeError('network') },
    async () => ({ ok: true, json: async () => { throw new SyntaxError('invalid JSON') } }),
    async () => ok({ path: '/wrong/employments' }),
    async () => { throw abortError() },
  ]
  for (const fail of failures) {
    const record = await fetchOrcidPerson(id, async url => url.endsWith('/person') ? ok(personWithBio) : fail())
    assert.equal(record.bio, personWithBio.biography.content)
    assert.equal(record.interests, 'Automata, Logic, Theory')
    assert.equal(record.department, '')
    assert.equal(record.employment, '')
    assert.equal(record.warnings.length, 1)
    assert.match(record.warnings[0], /employment could not be loaded/)
  }
})

test('person failures retain meaningful errors and do not request employment', async () => {
  for (const [status, expected] of [[404, /No public ORCID/], [429, /busy/], [401, /additional access/], [403, /denied/], [500, /\(500\)/]]) {
    let calls = 0
    await assert.rejects(fetchOrcidPerson(id, async () => {
      calls++
      return { ok: false, status }
    }), expected)
    assert.equal(calls, 1)
  }
  await assert.rejects(fetchOrcidPerson(id, async () => { throw new TypeError('offline') }), /Could not reach ORCID/)
  await assert.rejects(fetchOrcidPerson(id, async () => { throw abortError() }), /too long/)
  await assert.rejects(fetchOrcidPerson(id, async () => ok({ ...sparsePerson, path: '/wrong/person' })), /unexpected profile/)
  await assert.rejects(fetchOrcidPerson('invalid', async () => assert.fail('must not fetch invalid ID')), /valid ORCID/)
})

test('the shared timeout aborts requests and always clears its timer', async t => {
  let expire
  const timer = {}
  let cleared = 0
  t.mock.method(globalThis, 'setTimeout', (callback, delay) => {
    assert.equal(delay, 15000)
    expire = callback
    return timer
  })
  t.mock.method(globalThis, 'clearTimeout', value => {
    assert.equal(value, timer)
    cleared++
  })
  const pending = options => new Promise((resolve, reject) => {
    options.signal.addEventListener('abort', () => reject(abortError()), { once: true })
    expire()
  })
  await assert.rejects(fetchOrcidPerson(id, (url, options) => pending(options)), /too long/)
  const record = await fetchOrcidPerson(id, (url, options) => url.endsWith('/person') ? ok(personWithBio) : pending(options))
  assert.equal(record.bio, personWithBio.biography.content)
  assert.match(record.warnings[0], /timed out/)
  await fetchOrcidPerson(id, async url => ok(url.endsWith('/person') ? sparsePerson : employments()))
  assert.equal(cleared, 3)
})

test('initial selection fills blank destinations only, never both bio sources or expertise', () => {
  const record = { bio: 'Biography', employment: 'Employment', department: 'CS', interests: 'Logic', expertise: 'Logic' }
  assert.deepEqual(initialOrcidSelection({}, record), {
    bio: true, employment: false, department: true, interests: true, expertise: false,
  })
  assert.deepEqual(initialOrcidSelection({ bio: ' \n', department: '', interests: null }, { ...record, bio: ' ' }), {
    bio: false, employment: true, department: true, interests: true, expertise: false,
  })
  assert.deepEqual(initialOrcidSelection({ bio: 'Mine', department: 'Mine', interests: 'Mine' }, record), {
    bio: false, employment: false, department: false, interests: false, expertise: false,
  })
  assert.deepEqual(initialOrcidSelection({}, {}), {
    bio: false, employment: false, department: false, interests: false, expertise: false,
  })
})

test('selection is explicit, preserves identity, and gives selected nonempty biography priority', () => {
  const draft = { bio: 'Mine', department: 'Old', interests: 'Mine', expertise: 'Mine', full_name: 'Local Name', email: 'local@example.test', university_id: '123', extra: true }
  const record = { bio: 'Biography', employment: 'Employment', department: 'CS', interests: 'Logic', expertise: 'Logic', full_name: 'Other', email: 'other@example.test', university_id: '456' }
  assert.deepEqual(applyOrcidSelection(draft, record, {}), draft)
  const all = { bio: true, employment: true, department: true, interests: true, expertise: true, full_name: true, email: true, university_id: true }
  assert.deepEqual(applyOrcidSelection(draft, record, all), { ...draft, bio: 'Biography', department: 'CS', interests: 'Logic', expertise: 'Logic' })
  assert.equal(applyOrcidSelection(draft, record, { employment: true }).bio, 'Employment')
  assert.equal(applyOrcidSelection(draft, { ...record, bio: ' ' }, all).bio, 'Employment')
  assert.equal(applyOrcidSelection(draft, { ...record, employment: ' ' }, { employment: true }).bio, 'Mine')
  assert.equal(applyOrcidSelection(draft, { ...record, bio: '' }, { bio: true }).bio, 'Mine')
  assert.equal(draft.bio, 'Mine')
  assert.equal(record.bio, 'Biography')
})
