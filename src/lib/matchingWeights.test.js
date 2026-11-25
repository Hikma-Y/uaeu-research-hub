import test from 'node:test'
import assert from 'node:assert/strict'
import {
  DEFAULT_MATCHING_WEIGHTS,
  describeProjectMatchingWeights,
  getProjectMatchingWeights,
  hasCustomProjectMatchingWeights,
  matchingWeightsError,
  requireProjectWeightsSupport,
} from './matchingWeights.js'

const skillsOnly = { semantic: 0, skills: 100, academic: 0, gpa: 0, experience: 0 }

test('project weights retain independent backwards-compatible defaults', () => {
  assert.deepEqual(DEFAULT_MATCHING_WEIGHTS, { semantic: 40, skills: 25, academic: 10, gpa: 10, experience: 15 })
  assert.equal(matchingWeightsError(DEFAULT_MATCHING_WEIGHTS), '')
  for (const project of [undefined, {}, { matching_weights: null }]) {
    const weights = getProjectMatchingWeights(project)
    assert.deepEqual(weights, DEFAULT_MATCHING_WEIGHTS)
    weights.skills = 99
    assert.equal(DEFAULT_MATCHING_WEIGHTS.skills, 25)
    assert.equal(hasCustomProjectMatchingWeights(project), false)
  }
  assert.deepEqual(getProjectMatchingWeights({ matching_weights: skillsOnly }), skillsOnly)
  assert.equal(hasCustomProjectMatchingWeights({ matching_weights: skillsOnly }), true)
})

test('weights require exact keys, finite integer percentages, and a total of 100', () => {
  for (const value of [undefined, null, [], {}, 100, '100',
    { ...skillsOnly, extra: 0 }, { skills: 100 },
    ...[-1, 101, NaN, Infinity, 12.5, true, '100', ''].map((skills) => ({ ...skillsOnly, skills })),
    { ...skillsOnly, skills: 99 }, { ...skillsOnly, skills: 0 },
  ]) assert.ok(matchingWeightsError(value), JSON.stringify(value))
  assert.equal(matchingWeightsError(skillsOnly), '')
  assert.match(describeProjectMatchingWeights({ matching_weights: skillsOnly }), /Skills 100%/)
  assert.match(describeProjectMatchingWeights({ matching_weights: skillsOnly }), /GPA 0%/)
})

test('older semantic services may score defaults but cannot silently ignore custom project weights', () => {
  assert.doesNotThrow(() => requireProjectWeightsSupport({}, [{}]))
  assert.doesNotThrow(() => requireProjectWeightsSupport({}, [{ matching_weights: DEFAULT_MATCHING_WEIGHTS }]))
  assert.throws(() => requireProjectWeightsSupport({}, [{ matching_weights: skillsOnly }]), { code: 'PROJECT_WEIGHTS_UNSUPPORTED' })
  assert.throws(() => requireProjectWeightsSupport({ project_weights_applied: false }, [{}, { matching_weights: skillsOnly }]), { code: 'PROJECT_WEIGHTS_UNSUPPORTED' })
  assert.doesNotThrow(() => requireProjectWeightsSupport({ project_weights_applied: true }, [{ matching_weights: skillsOnly }]))
})
