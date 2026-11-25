import test from 'node:test'
import assert from 'node:assert/strict'
import { buildApplicationRankingKey, rankProjectApplications } from './applicationMatching.js'

const skillsWeights = { semantic: 0, skills: 100, academic: 0, gpa: 0, experience: 0 }
const gpaWeights = { semantic: 0, skills: 0, academic: 0, gpa: 100, experience: 0 }
const project = { id: 'project', title: 'Python research', requirements: ['Python'], matching_weights: skillsWeights }
const candidates = [
  { id: 'skills', skills: ['Python'], gpa: 2.5 },
  { id: 'grades', skills: [], gpa: 4 },
]
const applications = [
  { id: 'app-skills', student_id: 'skills', opportunity_id: 'project', student_name: 'Zara', status: 'Rejected', created_at: '2020-01-01' },
  { id: 'app-grades', student_id: 'grades', opportunity_id: 'project', student_name: 'Aisha', status: 'Submitted', created_at: '2026-01-01' },
]
const scored = (id, score, eligible = true, extra = {}) => ({
  id, match_score: score, is_eligible: eligible, match_reasons: ['Reason'],
  match_source: 'Test matcher', eligibility_reason: eligible ? '' : 'Minimum GPA not met', ...extra,
})
const ids = (result) => result.applications.map((row) => row.id)

// Node has no VITE_MATCHING_API_URL, exercising the real structured fallback.
test('real fallback reverses skills/GPA priorities, ignoring dates and review status', async () => {
  const input = structuredClone(applications)
  const projects = [structuredClone(project)]
  const snapshot = structuredClone({ input, projects, candidates })
  const options = { loadCandidates: async () => candidates }
  const skills = await rankProjectApplications(input, projects, options)
  assert.deepEqual(ids(skills), ['app-skills', 'app-grades'])
  assert.deepEqual(skills.applications.map((row) => [row.match_score, row.project_match_rank]), [[100, 1], [0, 2]])
  assert.equal(skills.applications[1].matching_unavailable, false)
  assert.ok(skills.notices.some((notice) => /structured/i.test(notice)))
  const grades = await rankProjectApplications(input, [{ ...project, matching_weights: gpaWeights }], options)
  assert.deepEqual(ids(grades), ['app-grades', 'app-skills'])
  const changedDates = input.map((row) => ({ ...row, created_at: '1900-01-01', status: 'Accepted' })).reverse()
  assert.deepEqual(ids(await rankProjectApplications(changedDates, projects, options)), ids(skills))
  assert.deepEqual({ input, projects, candidates }, snapshot)
  for (const row of skills.applications) {
    const raw = input.find((application) => application.id === row.id)
    for (const [key, value] of Object.entries(raw)) assert.deepEqual(row[key], value)
  }
})

test('filters and deduplicates applicants before ranking; joins mixed IDs without losing application identity', async () => {
  const uuid = '2cc38bda-d549-40e7-b8cd-6ade5d4b3b53'
  const apps = [
    { id: 'review-1', opportunity_id: '42', student_id: '7', status: 'Submitted' },
    { id: 'review-2', opportunity_id: uuid, student_id: 7, status: 'Accepted' },
  ]
  const calls = []
  const result = await rankProjectApplications(apps, [{ id: 42 }, { id: uuid }], {
    loadCandidates: async () => [{ student_id: 7, id: 'profile-7' }, { id: '7' }, { id: 'outsider' }],
    rankStudents: async (p, students) => {
      calls.push([p.id, students])
      assert.equal(students.length, 1)
      assert.equal(students[0].student_id, 7)
      return { students: [scored('profile-7', p.id === 42 ? 60 : 90, true, { student_id: 7, status: 'WRONG' })] }
    },
  })
  assert.equal(calls.length, 2)
  assert.deepEqual(ids(result), ['review-2', 'review-1'])
  assert.deepEqual(result.applications.map((row) => [row.student_id, row.status, row.project_match_rank]), [[7, 'Accepted', 1], ['7', 'Submitted', 1]])
  assert.deepEqual(result.notices, [])
})

test('per-project ranks and global sort use availability, eligibility, score, name and application ID', async () => {
  const specs = [
    ['b', 'p1', 'Beth', 80, true], ['a', 'p1', 'Amy', 80, true],
    ['c', 'p1', 'Amy', 80, true], ['zero', 'p2', 'Zero', 0, true],
    ['ineligible', 'p1', 'Aaron', 100, false], ['other', 'p2', 'Other', 90, true],
    ['unknown', 'p2', 'Aardvark', null, true],
  ]
  const apps = specs.map(([id, opportunity_id, student_name]) => ({ id, student_id: id, opportunity_id, student_name }))
  const result = await rankProjectApplications(apps.reverse(), [{ id: 'p1' }, { id: 'p2' }], {
    loadCandidates: async () => specs.map(([id]) => ({ id })),
    rankStudents: async (_, students) => ({
      students: students.map(({ id }) => {
        const spec = specs.find((entry) => entry[0] === id)
        return scored(id, spec[3], spec[4])
      })
    }),
  })
  assert.deepEqual(ids(result), ['other', 'a', 'c', 'b', 'zero', 'ineligible', 'unknown'])
  assert.deepEqual(result.applications.map((row) => row.project_match_rank), [1, 1, 2, 3, 2, 4, null])
  assert.equal(result.applications[4].match_score, 0)
  assert.equal(result.applications[5].is_eligible, false)
  assert.equal(result.applications[5].eligibility_reason, 'Minimum GPA not met')
  assert.deepEqual(result.applications[0].match_reasons, ['Reason'])
  assert.equal(result.applications[0].match_source, 'Test matcher')
  assert.equal(result.applications[6].match_score, null)
})

test('missing and malformed scores or eligibility never become a zero match or eligible', async () => {
  const malformed = [null, undefined, NaN, Infinity, -1, 101, '80', '', false, {}, []]
  const results = malformed.map((score, i) => scored(`bad-${i}`, score))
  results.push(scored('missing-score', undefined), scored('missing-eligibility', 90, undefined))
  // A default argument is deliberately bypassed to test absent eligibility.
  delete results.at(-1).is_eligible
  for (const eligible of [null, 'false', 'true', 0, 1, {}]) {
    results.push(scored(`eligibility-${results.length}`, 100, eligible))
  }
  results.push(scored('good', 0, false), scored('duplicate', 70), scored('duplicate', 90))
  const apps = [...new Set([...results.map((row) => row.id), 'missing-result', 'missing-candidate'])]
    .map((id) => ({
      id: `app-${id}`, student_id: id, opportunity_id: project.id,
      match_score: 100, is_eligible: true, project_match_rank: 1
    }))
  const result = await rankProjectApplications(apps, [project], {
    loadCandidates: async () => apps.filter((row) => row.student_id !== 'missing-candidate').map((row) => ({ id: row.student_id })),
    rankStudents: async () => ({ students: [null, ...results, scored('outsider', 100)] }),
  })
  assert.equal(result.applications.length, apps.length)
  assert.equal(result.applications[0].id, 'app-good')
  assert.equal(result.applications[0].matching_unavailable, false)
  for (const row of result.applications.slice(1)) {
    assert.equal(row.matching_unavailable, true, row.id)
    assert.equal(row.match_score, null, row.id)
    assert.equal(row.project_match_rank, null, row.id)
    assert.equal(row.is_eligible, false, row.id)
  }
  assert.ok(result.notices.length)
})

test('project/RPC/async ranking failures preserve all rows while successful partial projects and unique notices survive', async () => {
  const projectIds = ['ok1', 'ok2', 'rpc-failure', 'rank-failure', 'bad-candidates', 'bad-ranking', 'no-candidates', 'missing-project']
  const apps = projectIds.map((id) => ({ id: `app-${id}`, student_id: 'student', opportunity_id: id, status: 'Submitted' }))
  const result = await rankProjectApplications(apps, projectIds.filter((id) => id !== 'missing-project').map((id) => ({ id })), {
    loadCandidates: async (p) => {
      if (p.id === 'rpc-failure') throw new Error('secure RPC denied')
      if (p.id === 'bad-candidates') return { data: [] }
      if (p.id === 'no-candidates') return []
      return [{ id: 'student' }]
    },
    rankStudents: async (p) => {
      if (p.id === 'rank-failure') throw new Error('async matching failed')
      if (p.id === 'bad-ranking') return { students: null }
      return { students: [scored('student', 75)], notice: 'Shared fallback notice', isFallback: true }
    },
  })
  assert.equal(result.applications.length, apps.length)
  assert.equal(result.applications.filter((row) => !row.matching_unavailable).length, 2)
  assert.equal(result.notices.filter((notice) => notice === 'Shared fallback notice').length, 1)
  assert.equal(new Set(result.notices).size, result.notices.length)
  for (const id of projectIds.slice(2)) assert.ok(result.notices.some((notice) => notice.includes(id)), id)
  for (const row of result.applications) assert.equal(row.status, 'Submitted')
})

test('project groups progress in parallel, isolate failures, and return stable notices regardless of completion order', async () => {
  const deferred = () => {
    let resolve
    const promise = new Promise((done) => { resolve = done })
    return { promise, resolve }
  }
  const projectIds = ['a-load-pending', 'b-rank-pending', 'c-fast', 'd-failure']
  const apps = projectIds.map((id) => ({ id: `app-${id}`, student_id: 'student', opportunity_id: id }))
  const projects = projectIds.map((id) => ({ id }))
  const run = async (reverseCompletion) => {
    const loadGate = deferred()
    const rankGate = deferred()
    const events = []
    const pending = rankProjectApplications(reverseCompletion ? [...apps].reverse() : apps, projects, {
      loadCandidates: async (p) => {
        events.push(`load:${p.id}`)
        if (p.id === 'a-load-pending') await loadGate.promise
        return [{ id: 'student' }]
      },
      rankStudents: async (p) => {
        events.push(`rank:${p.id}`)
        if (p.id === 'b-rank-pending') await rankGate.promise
        if (p.id === 'd-failure') {
          events.push('failed')
          throw new Error('isolated semantic failure')
        }
        events.push(`done:${p.id}`)
        return { students: [scored('student', 80)], notice: `Notice ${p.id}` }
      },
    })
    try {
      // Flush asynchronous work without releasing either blocked project.
      await new Promise((resolve) => setImmediate(resolve))
      for (const id of projectIds) assert.ok(events.includes(`load:${id}`), id)
      assert.ok(events.includes('rank:b-rank-pending'))
      assert.ok(events.includes('done:c-fast'))
      assert.ok(events.includes('failed'))
      assert.ok(!events.includes('rank:a-load-pending'))
      assert.ok(!events.includes('done:b-rank-pending'))
      if (reverseCompletion) loadGate.resolve()
      else rankGate.resolve()
      await new Promise((resolve) => setImmediate(resolve))
    } finally {
      loadGate.resolve()
      rankGate.resolve()
    }
    return pending
  }

  const forward = await run(false)
  const reverse = await run(true)
  assert.deepEqual(reverse, forward)
  assert.deepEqual(forward.notices, [...forward.notices].sort())
  assert.equal(forward.notices.length, 4)
  assert.equal(forward.applications.filter((row) => !row.matching_unavailable).length, 3)
  const failed = forward.applications.find((row) => row.opportunity_id === 'd-failure')
  assert.equal(failed.matching_unavailable, true)
  assert.equal(failed.match_score, null)
  assert.equal(failed.id, 'app-d-failure')
  assert.ok(forward.notices.some((notice) => notice.includes('isolated semantic failure')))
})

test('handles empty input and fallback without a notice', async () => {
  assert.deepEqual(await rankProjectApplications([], [], {
    loadCandidates: () => assert.fail('no project should load'),
  }), { applications: [], notices: [] })
  const result = await rankProjectApplications([applications[0]], [project], {
    loadCandidates: async () => candidates,
    rankStudents: async () => ({ students: [scored('skills', 10)], isFallback: true }),
  })
  assert.match(result.notices[0], /fallback/i)
})

test('ranking key is canonical across input and object-key order, but tracks all raw applications and matching project edits', () => {
  const projects = [project, { id: 'other', title: 'Other project' }]
  const key = buildApplicationRankingKey(applications, projects)
  assert.equal(typeof key, 'string')
  assert.doesNotThrow(() => JSON.parse(key))
  const reorderObject = (value) => {
    if (Array.isArray(value)) return value.map(reorderObject)
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).reverse().map(([k, v]) => [k, reorderObject(v)]))
    return value
  }
  assert.equal(buildApplicationRankingKey(reorderObject([...applications].reverse()), reorderObject([...projects].reverse())), key)
  for (const [field, value] of Object.entries({ status: 'Accepted', student_name: 'New name', student_id: 'new-student', opportunity_id: 'other', created_at: 'changed', review_note: 'new' })) {
    assert.notEqual(buildApplicationRankingKey([{ ...applications[0], [field]: value }, applications[1]], projects), key, field)
  }
  assert.notEqual(buildApplicationRankingKey([...applications, { id: 'new-app' }], projects), key)
  for (const [field, value] of Object.entries({ title: 'New title', description: 'New description', type: 'Internship', department: 'Science', tags: ['AI'], requirements: ['R'], minimum_gpa: 3, matching_weights: gpaWeights })) {
    assert.notEqual(buildApplicationRankingKey(applications, [{ ...project, [field]: value }, projects[1]]), key, field)
  }
  assert.equal(buildApplicationRankingKey(applications, [{ ...project, created_at: 'ignored', status: 'ignored' }, projects[1]]), key)
})
