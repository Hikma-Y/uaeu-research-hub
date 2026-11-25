export const DEFAULT_MATCHING_WEIGHTS = Object.freeze({
  semantic: 40,
  skills: 25,
  academic: 10,
  gpa: 10,
  experience: 15,
})

export const MATCHING_WEIGHT_FIELDS = Object.freeze([
  { key: 'semantic', label: 'Research relevance', description: 'Semantic relevance, or text overlap when AI is unavailable.' },
  { key: 'skills', label: 'Skills', description: 'Coverage of the project’s required skills.' },
  { key: 'academic', label: 'Academic alignment', description: 'Alignment with the project’s department or major.' },
  { key: 'gpa', label: 'GPA', description: 'Academic performance on a 4.0 scale.' },
  { key: 'experience', label: 'Experience / coursework', description: 'Listed research experience or relevant coursework.' },
])

export function matchingWeightsError(weights) {
  const keys = Object.keys(DEFAULT_MATCHING_WEIGHTS)
  if (!weights || typeof weights !== 'object' || Array.isArray(weights)
    || Object.keys(weights).length !== keys.length
    || keys.some((key) => !Object.hasOwn(weights, key) || !Number.isInteger(weights[key]) || weights[key] < 0 || weights[key] > 100)) {
    return 'Enter a whole-number percentage from 0 to 100 for every matching factor.'
  }
  if (keys.reduce((total, key) => total + weights[key], 0) !== 100) {
    return 'Matching weights must add up to exactly 100%.'
  }
  return ''
}

export function getProjectMatchingWeights(project) {
  const weights = project?.matching_weights
  return { ...(matchingWeightsError(weights) ? DEFAULT_MATCHING_WEIGHTS : weights) }
}

export function hasCustomProjectMatchingWeights(project) {
  const weights = getProjectMatchingWeights(project)
  return Object.keys(DEFAULT_MATCHING_WEIGHTS).some((key) => weights[key] !== DEFAULT_MATCHING_WEIGHTS[key])
}

export function requireProjectWeightsSupport(payload, projects) {
  if (projects.some(hasCustomProjectMatchingWeights) && payload?.project_weights_applied !== true) {
    const error = new Error('The semantic service does not support project-specific matching weights yet.')
    error.code = 'PROJECT_WEIGHTS_UNSUPPORTED'
    throw error
  }
}

export function describeProjectMatchingWeights(project) {
  const weights = getProjectMatchingWeights(project)
  return MATCHING_WEIGHT_FIELDS.map(({ key, label }) => `${label} ${weights[key]}%`).join(' · ')
}
