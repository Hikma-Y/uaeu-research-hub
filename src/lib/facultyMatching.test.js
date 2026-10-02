import test from 'node:test'
import assert from 'node:assert/strict'
import { rankFacultyForIdea } from './facultyMatching.js'

const faculty = [
  { id: 'health', full_name: 'Amna', research_interests: ['Public health'], skills: ['Epidemiology'] },
  { id: 'ai', full_name: 'Zayed', research_interests: ['Artificial intelligence'], skills: ['Natural language processing'] },
]

test('different ideas recommend different supervisors and expose matching topics', () => {
  const ai = rankFacultyForIdea(faculty, { title: 'Artificial intelligence for Arabic language processing' })
  assert.equal(ai[0].id, 'ai')
  assert.ok(ai[0].matchedTopics.includes('Natural language processing'))
  assert.equal(ai[0].rank, 1)
  const health = rankFacultyForIdea(faculty, { description: 'Public health and epidemiology in schools' })
  assert.equal(health[0].id, 'health')
  assert.equal(faculty[0].rank, undefined)
})

test('missing expertise and unrelated ideas have no positive recommendation', () => {
  const result = rankFacultyForIdea([...faculty, { id: 'empty', full_name: 'Bader' }], { title: 'Astronomy' })
  assert.ok(result.every((person) => person.score === 0))
  assert.deepEqual(result.map((person) => person.full_name), ['Amna', 'Bader', 'Zayed'])
})

test('category, biography, and case-insensitive expertise contribute to relevance', () => {
  const result = rankFacultyForIdea([{ id: 'bio', research_experience: 'ROBOTICS and autonomous vehicles' }, ...faculty], { category: 'Robotics' })
  assert.equal(result[0].id, 'bio')
  assert.deepEqual(result[0].matchedWords, ['robotics'])
})
