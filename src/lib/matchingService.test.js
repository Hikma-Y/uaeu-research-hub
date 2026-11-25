import test from 'node:test'
import assert from 'node:assert/strict'
import { projectRankingScores, requestService } from './matching.js'

const valid = { student_id: 'student', match_score: 0, eligible: true }

test('service score validation preserves genuine zero and rejects malformed or missing scores', () => {
  assert.equal(projectRankingScores([valid], ['student'], 'student_id').get('student').match_score, 0)
  for (const match_score of [undefined, null, false, true, '', '0', 'not-a-number', NaN, Infinity, -1, 101]) {
    assert.throws(() => projectRankingScores([{ ...valid, match_score }], ['student'], 'student_id'), /invalid/)
  }
  assert.throws(() => projectRankingScores([{ ...valid, eligible: undefined }], ['student'], 'student_id'), /invalid/)
  assert.throws(() => projectRankingScores([], ['student'], 'student_id'), /omitted/)
  assert.throws(() => projectRankingScores([valid, valid], ['student'], 'student_id'), /duplicate/)
  assert.throws(() => projectRankingScores(null, [], 'student_id'), /invalid/)
  assert.equal(projectRankingScores([], [], 'student_id').size, 0)
  assert.equal(projectRankingScores([{ project_id: 'project', match_score: 75, eligible: false }], ['project'], 'project_id').get('project').match_score, 75)
})

test('service request forwards project weights and reads JSON before clearing its deadline', async () => {
  const body = { project: { matching_weights: { semantic: 0, skills: 100, academic: 0, gpa: 0, experience: 0 } } }
  const result = await requestService('/api/match/rank', body, {
    apiUrl: 'https://matching.invalid',
    fetcher: async (url, options) => {
      assert.equal(url, 'https://matching.invalid/api/match/rank')
      assert.equal(options.method, 'POST')
      assert.deepEqual(JSON.parse(options.body), body)
      assert.ok(options.signal instanceof AbortSignal)
      return { ok: true, json: async () => ({ results: [valid] }) }
    },
  })
  assert.deepEqual(result, { results: [valid] })
})

function untilAbort(signal) {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(signal.reason)
    signal.addEventListener('abort', () => reject(signal.reason), { once: true })
  })
}

test('service deadlines abort stalled fetches and stalled response bodies', async () => {
  await assert.rejects(requestService('/api/match/rank', {}, {
    apiUrl: 'https://matching.invalid', timeoutMs: 5,
    fetcher: async (url, options) => untilAbort(options.signal),
  }), { name: 'AbortError' })
  await assert.rejects(requestService('/api/match/rank', {}, {
    apiUrl: 'https://matching.invalid', timeoutMs: 5,
    fetcher: async (url, options) => ({ ok: true, json: () => untilAbort(options.signal) }),
  }), { name: 'AbortError' })
})

test('service HTTP and JSON failures propagate to existing structured fallback paths', async () => {
  await assert.rejects(requestService('/api/match/rank', {}, {
    apiUrl: 'https://matching.invalid',
    fetcher: async () => ({ ok: false, status: 503 }),
  }), /503/)
  await assert.rejects(requestService('/api/match/rank', {}, {
    apiUrl: 'https://matching.invalid',
    fetcher: async () => ({ ok: true, json: async () => { throw new SyntaxError('Invalid JSON') } }),
  }), /Invalid JSON/)
})
