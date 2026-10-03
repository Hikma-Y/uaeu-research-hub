/*
 * Shared matching client for every matching surface in the application.
 *
 * The Python service adds Sentence-BERT semantic similarity when it is
 * available. The local implementation below is intentionally deterministic so
 * the app still produces an explainable ranking during development or if that
 * service is offline. A compatibility score is a ranking aid, never an
 * automatic accept/reject decision.
 */

const STOP_WORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'by', 'for', 'from', 'in', 'into',
  'is', 'of', 'on', 'or', 'project', 'research', 'the', 'to', 'with',
])

function numeric(value) {
  if (value === null || value === undefined || String(value).trim() === '') return null

  const result = Number(value)
  return Number.isFinite(result) ? result : null
}

function clamp(value, minimum = 0, maximum = 1) {
  return Math.max(minimum, Math.min(maximum, value))
}

function unique(values) {
  return [...new Set(values.filter(Boolean).map((value) => String(value).trim()).filter(Boolean))]
}

export function toList(value) {
  if (Array.isArray(value)) return unique(value)

  if (typeof value === 'string') {
    return unique(value.split(/[\n,]/).map((item) => item.trim()))
  }

  return []
}

function entryText(entries) {
  if (!Array.isArray(entries)) return []

  return entries.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') return []

    return [entry.title, entry.description, entry.role, entry.organisation, entry.organization]
      .filter(Boolean)
      .map(String)
  })
}

function normalise(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9+#.\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// Keep the explicit "required skills matched" result understandable and
// reliable for common academic/technical abbreviations. Sentence-BERT still
// handles the wider topic similarity score; this list prevents a clear pair
// such as "AI" and "Artificial Intelligence" from being treated as unrelated.
const SKILL_ALIASES = new Map([
  ['ai', 'artificial intelligence'],
  ['artificial intelligence', 'artificial intelligence'],
  ['ml', 'machine learning'],
  ['machine learning', 'machine learning'],
  ['dl', 'deep learning'],
  ['deep learning', 'deep learning'],
  ['nlp', 'natural language processing'],
  ['natural language processing', 'natural language processing'],
  ['natural-language processing', 'natural language processing'],
  ['cv', 'computer vision'],
  ['computer vision', 'computer vision'],
  ['iot', 'internet of things'],
  ['internet of things', 'internet of things'],
  ['js', 'javascript'],
  ['javascript', 'javascript'],
  ['ts', 'typescript'],
  ['typescript', 'typescript'],
  ['node', 'node.js'],
  ['nodejs', 'node.js'],
  ['node.js', 'node.js'],
  ['reactjs', 'react'],
  ['react', 'react'],
  ['postgres', 'postgresql'],
  ['postgresql', 'postgresql'],
  ['sklearn', 'scikit-learn'],
  ['scikit learn', 'scikit-learn'],
  ['scikit-learn', 'scikit-learn'],
  ['powerbi', 'power bi'],
  ['power bi', 'power bi'],
])

function canonicalSkill(value) {
  const normalised = normalise(value)
  return SKILL_ALIASES.get(normalised) || normalised
}

function terms(values) {
  return new Set(
    values
      .flatMap((value) => normalise(value).split(/[\s-]+/))
      .filter((term) => term.length > 2 && !STOP_WORDS.has(term))
  )
}

function overlapScore(leftValues, rightValues) {
  const left = terms(leftValues)
  const right = terms(rightValues)

  if (!left.size || !right.size) return 0

  let overlap = 0
  left.forEach((term) => {
    if (right.has(term)) overlap += 1
  })

  return overlap / Math.min(left.size, right.size)
}

function sameOrContains(left, right) {
  const leftValue = canonicalSkill(left)
  const rightValue = canonicalSkill(right)
  return Boolean(
    leftValue &&
      rightValue &&
      (leftValue === rightValue || leftValue.includes(rightValue) || rightValue.includes(leftValue))
  )
}

function matchingItems(wanted, available) {
  const wantedItems = unique(wanted)
  const availableItems = unique(available)

  if (!wantedItems.length) return { score: 0.5, matched: [] }

  const matched = wantedItems.filter((item) =>
    availableItems.some((candidate) => sameOrContains(item, candidate))
  )

  return {
    score: matched.length / wantedItems.length,
    matched,
  }
}

function matchingAvailableItems(wanted, available) {
  const wantedItems = unique(wanted)
  const availableItems = unique(available)

  if (!wantedItems.length) return { score: 0.5, matched: [] }

  let matchedCount = 0
  const matched = []
  wantedItems.forEach((item) => {
    const matchingItem = availableItems.find((candidate) => sameOrContains(item, candidate))
    if (!matchingItem) return
    matchedCount += 1
    if (!matched.includes(matchingItem)) matched.push(matchingItem)
  })

  return {
    score: matchedCount / wantedItems.length,
    matched,
  }
}

function projectSkills(project) {
  return unique([
    ...toList(project?.requirements),
    ...toList(project?.tags),
  ])
}

function studentSkills(student) {
  return unique([
    ...toList(student?.skills),
    ...toList(student?.research_tools),
  ])
}

function studentFocus(student) {
  return unique([
    ...toList(student?.research_interests),
    ...toList(student?.relevant_coursework),
    ...entryText(student?.experience_entries),
    student?.research_experience,
    student?.bio,
  ])
}

function projectFocus(project) {
  return unique([
    project?.title,
    project?.description,
    project?.type,
    project?.department,
    ...projectSkills(project),
  ])
}

function formatGpa(value) {
  const number = numeric(value)
  return number === null ? 'â€”' : number.toFixed(2).replace(/\.00$/, '')
}

/**
 * Minimum GPA is the one current hard eligibility rule. Other profile fields
 * influence ordering but do not prevent a student from being considered.
 */
export function getProjectEligibility(project, student) {
  const minimumGpa = numeric(project?.minimum_gpa)
  if (minimumGpa === null) return { eligible: true, reason: '' }

  const studentGpa = numeric(student?.gpa)
  if (studentGpa === null) {
    return {
      eligible: false,
      reason: `A GPA of ${formatGpa(minimumGpa)} or higher is required. The student has not added a GPA yet.`,
    }
  }

  if (studentGpa < minimumGpa) {
    return {
      eligible: false,
      reason: `Minimum GPA is ${formatGpa(minimumGpa)}; current GPA is ${formatGpa(studentGpa)}.`,
    }
  }

  return { eligible: true, reason: '' }
}

function localProjectStudentMatch(project, student) {
  const requiredSkills = projectSkills(project)
  const skillResult = matchingItems(requiredSkills, studentSkills(student))
  const topicScore = overlapScore(projectFocus(project), studentFocus(student))
  const projectDepartment = normalise(project?.department)
  const studentMajor = normalise(student?.major)
  const studentDepartment = normalise(student?.department)
  const majorScore = !projectDepartment
    ? 0.5
    : [studentMajor, studentDepartment].some(
      (value) => value && (value.includes(projectDepartment) || projectDepartment.includes(value))
    )
      ? 1
      : 0
  const rawGpa = numeric(student?.gpa)
  const gpaScore = rawGpa === null ? 0 : clamp(rawGpa / 4)
  const hasExperience = Boolean(student?.has_research_experience)
    || entryText(student?.experience_entries).length > 0
    || toList(student?.relevant_coursework).length > 0
    || Boolean(String(student?.research_experience || '').trim())
  const experienceScore = hasExperience ? 1 : 0
  const eligibility = getProjectEligibility(project, student)
  const matchScore = Math.round(
    100 * (
      topicScore * 0.4 +
      skillResult.score * 0.25 +
      majorScore * 0.1 +
      gpaScore * 0.1 +
      experienceScore * 0.15
    )
  )

  const reasons = []
  if (topicScore >= 0.25) reasons.push('Relevant research interests or coursework')
  if (skillResult.matched.length) {
    reasons.push(`${skillResult.matched.length}/${requiredSkills.length} required skills matched`)
  }
  if (majorScore === 1) reasons.push('Major or department aligns')
  if (gpaScore >= 0.75) reasons.push('Strong GPA profile')
  if (hasExperience) reasons.push('Relevant experience or coursework listed')
  if (!eligibility.eligible) reasons.unshift(eligibility.reason)

  return {
    ...student,
    match_score: matchScore,
    match_reasons: reasons.slice(0, 3),
    match_source: 'Structured fallback',
    is_eligible: eligibility.eligible,
    eligibility_reason: eligibility.reason,
  }
}

function sortProjectMatches(left, right, titleField = 'full_name') {
  if (Boolean(left.is_eligible) !== Boolean(right.is_eligible)) {
    return left.is_eligible ? -1 : 1
  }

  const scoreDifference = Number(right.match_score ?? right.match ?? 0) - Number(left.match_score ?? left.match ?? 0)
  if (scoreDifference) return scoreDifference

  return String(left[titleField] || '').localeCompare(String(right[titleField] || ''))
}

function prepareStudentForService(student) {
  return {
    student_id: String(student?.student_id || student?.id || ''),
    major: student?.major || '',
    department: student?.department || '',
    gpa: numeric(student?.gpa),
    skills: toList(student?.skills),
    research_interests: toList(student?.research_interests),
    relevant_coursework: toList(student?.relevant_coursework),
    research_tools: toList(student?.research_tools),
    has_research_experience: Boolean(student?.has_research_experience),
    research_experience: student?.research_experience || '',
    bio: student?.bio || '',
    experience_entries: Array.isArray(student?.experience_entries) ? student.experience_entries : [],
  }
}

function prepareProjectForService(project) {
  return {
    title: project?.title || '',
    description: project?.description || '',
    type: project?.type || '',
    department: project?.department || '',
    tags: toList(project?.tags),
    requirements: toList(project?.requirements),
    minimum_gpa: numeric(project?.minimum_gpa),
  }
}

function prepareFacultyForService(faculty) {
  return {
    faculty_id: String(faculty?.id || faculty?.faculty_id || ''),
    full_name: faculty?.full_name || '',
    department: faculty?.department || '',
    research_interests: toList(faculty?.research_interests),
    skills: toList(faculty?.skills),
    research_experience: faculty?.research_experience || faculty?.bio || '',
    supervision_status: faculty?.supervision_status || 'available',
    supervision_capacity: numeric(faculty?.supervision_capacity),
  }
}

function matchingApiUrl() {
  return String(import.meta.env?.VITE_MATCHING_API_URL || '').replace(/\/$/, '')
}

async function requestService(path, body) {
  const apiUrl = matchingApiUrl()
  if (!apiUrl) return null

  const response = await fetch(`${apiUrl}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  if (!response.ok) throw new Error(`Matching service returned ${response.status}`)

  return response.json()
}

function serviceNotice(payload, fallbackNotice) {
  if (!payload) return fallbackNotice
  return payload.trained
    ? 'Fine-tuned semantic matching is active. Scores support decisions; they do not decide automatically.'
    : 'Pre-trained semantic matching is active. Fine-tune it later using faculty-labelled decisions.'
}

function attachProjectResult(project, student, result, engine) {
  const fallback = localProjectStudentMatch(project, student)
  if (!result) return fallback

  const eligibility = getProjectEligibility(project, student)
  const isEligible = typeof result.eligible === 'boolean' ? result.eligible : eligibility.eligible
  const eligibilityReason = result.eligibility_reason || eligibility.reason || ''
  const reasons = Array.isArray(result.reasons) ? result.reasons.filter(Boolean) : fallback.match_reasons

  return {
    ...student,
    match_score: Math.round(Number(result.match_score) || 0),
    match_reasons: (!isEligible && eligibilityReason ? [eligibilityReason, ...reasons] : reasons).slice(0, 3),
    match_source: engine || 'Semantic + structured score',
    is_eligible: isEligible,
    eligibility_reason: eligibilityReason,
  }
}

/** Rank students for a faculty project and preserve hard-GPA eligibility. */
export async function rankStudentsForProject(project, students) {
  const fallback = () => students
    .map((student) => localProjectStudentMatch(project, student))
    .sort((left, right) => sortProjectMatches(left, right))

  if (!matchingApiUrl()) {
    return {
      students: fallback(),
      notice: 'Semantic matching is not connected yet. Showing the transparent structured score instead.',
      isFallback: true,
    }
  }

  try {
    const payload = await requestService('/api/match/rank', {
      project: prepareProjectForService(project),
      students: students.map(prepareStudentForService),
    })
    if (!Array.isArray(payload?.results)) throw new Error('Matching service returned an invalid ranking.')

    const scores = new Map(payload.results.map((result) => [String(result.student_id), result]))
    const ranked = students
      .map((student) => attachProjectResult(project, student, scores.get(String(student.student_id || student.id)), payload.engine))
      .sort((left, right) => sortProjectMatches(left, right))

    return {
      students: ranked,
      notice: serviceNotice(payload, ''),
      isFallback: false,
    }
  } catch (error) {
    console.warn('Semantic student matching is unavailable:', error.message)
    return {
      students: fallback(),
      notice: 'The local semantic service is unavailable, so the transparent structured score is shown instead.',
      isFallback: true,
    }
  }
}

/** Rank visible opportunities for a signed-in student using the same model. */
export async function rankProjectsForStudent(student, projects) {
  const fallback = () => projects
    .map((project) => {
      const result = localProjectStudentMatch(project, student)
      return {
        ...project,
        match: result.match_score,
        match_reasons: result.match_reasons,
        match_source: result.match_source,
        is_eligible: result.is_eligible,
        eligibility_reason: result.eligibility_reason,
      }
    })
    .sort((left, right) => sortProjectMatches(left, right, 'title'))

  if (!matchingApiUrl()) {
    return {
      projects: fallback(),
      notice: 'Semantic matching is not connected yet. Showing the transparent structured score instead.',
      isFallback: true,
    }
  }

  try {
    const payload = await requestService('/api/match/rank-projects', {
      student: prepareStudentForService(student),
      projects: projects.map((project) => ({
        project_id: String(project.id),
        ...prepareProjectForService(project),
      })),
    })
    if (!Array.isArray(payload?.results)) throw new Error('Matching service returned an invalid ranking.')

    const scores = new Map(payload.results.map((result) => [String(result.project_id), result]))
    const ranked = projects.map((project) => {
      const fallbackResult = localProjectStudentMatch(project, student)
      const result = scores.get(String(project.id))
      if (!result) {
        return {
          ...project,
          match: fallbackResult.match_score,
          match_reasons: fallbackResult.match_reasons,
          match_source: fallbackResult.match_source,
          is_eligible: fallbackResult.is_eligible,
          eligibility_reason: fallbackResult.eligibility_reason,
        }
      }

      const eligibility = getProjectEligibility(project, student)
      const isEligible = typeof result.eligible === 'boolean' ? result.eligible : eligibility.eligible
      const eligibilityReason = result.eligibility_reason || eligibility.reason || ''
      const reasons = Array.isArray(result.reasons) ? result.reasons.filter(Boolean) : fallbackResult.match_reasons
      return {
        ...project,
        match: Math.round(Number(result.match_score) || 0),
        match_reasons: (!isEligible && eligibilityReason ? [eligibilityReason, ...reasons] : reasons).slice(0, 3),
        match_source: payload.engine || 'Semantic + structured score',
        is_eligible: isEligible,
        eligibility_reason: eligibilityReason,
      }
    }).sort((left, right) => sortProjectMatches(left, right, 'title'))

    return {
      projects: ranked,
      notice: serviceNotice(payload, ''),
      isFallback: false,
    }
  } catch (error) {
    console.warn('Semantic project matching is unavailable:', error.message)
    return {
      projects: fallback(),
      notice: 'The local semantic service is unavailable, so the transparent structured score is shown instead.',
      isFallback: true,
    }
  }
}

function facultyAvailability(faculty) {
  const status = normalise(faculty?.supervision_status || 'available')
  const capacity = numeric(faculty?.supervision_capacity)

  if (status.includes('unavailable') || status.includes('full') || capacity === 0) {
    return { available: false, score: 0, reason: 'Not currently accepting new students' }
  }
  if (status.includes('limited')) {
    return { available: true, score: 0.5, reason: 'Limited supervision availability' }
  }
  return { available: true, score: 1, reason: '' }
}

function localFacultyForStudent(student, faculty) {
  const facultyTopics = unique([
    ...toList(faculty?.research_interests),
    ...toList(faculty?.skills),
    faculty?.research_experience,
    faculty?.department,
  ])
  const semanticScore = overlapScore(studentFocus(student).concat(studentSkills(student), [student?.major, student?.department]), facultyTopics)
  const interestResult = matchingItems(toList(student?.research_interests), toList(faculty?.research_interests))
  const skillResult = matchingItems(studentSkills(student), toList(faculty?.skills))
  const studentDepartment = normalise(student?.department || student?.major)
  const facultyDepartment = normalise(faculty?.department)
  const departmentScore = !studentDepartment || !facultyDepartment
    ? 0.5
    : sameOrContains(studentDepartment, facultyDepartment) ? 1 : 0
  const availability = facultyAvailability(faculty)
  const score = Math.round(100 * (
    semanticScore * 0.5 +
    interestResult.score * 0.25 +
    skillResult.score * 0.15 +
    departmentScore * 0.1
  ))
  const reasons = []
  if (semanticScore >= 0.2) reasons.push('Research interests and expertise are relevant')
  if (interestResult.matched.length) reasons.push(`Shared interests: ${interestResult.matched.join(', ')}`)
  if (skillResult.matched.length) reasons.push(`Related expertise: ${skillResult.matched.join(', ')}`)
  if (departmentScore === 1) reasons.push('Department or major aligns')
  if (availability.reason) reasons.unshift(availability.reason)

  return {
    ...faculty,
    match_score: score,
    match_reasons: reasons.slice(0, 3),
    match_source: 'Structured fallback',
    is_available: availability.available,
    availability_reason: availability.reason,
  }
}

function sortFacultyMatches(left, right) {
  if (Boolean(left.is_available) !== Boolean(right.is_available)) return left.is_available ? -1 : 1
  const difference = Number(right.match_score || 0) - Number(left.match_score || 0)
  if (difference) return difference
  return String(left.full_name || '').localeCompare(String(right.full_name || ''))
}

/** Rank faculty supervisors from the student's saved profile. */
export async function rankFacultyForStudent(student, faculty) {
  const fallback = () => faculty.map((person) => localFacultyForStudent(student, person)).sort(sortFacultyMatches)

  if (!matchingApiUrl()) {
    return {
      faculty: fallback(),
      notice: 'Semantic matching is not connected yet. Showing the transparent structured score instead.',
      isFallback: true,
    }
  }

  try {
    const payload = await requestService('/api/match/rank-faculty', {
      student: prepareStudentForService(student),
      faculty: faculty.map(prepareFacultyForService),
    })
    if (!Array.isArray(payload?.results)) throw new Error('Matching service returned an invalid ranking.')

    const scores = new Map(payload.results.map((result) => [String(result.faculty_id), result]))
    const ranked = faculty.map((person) => {
      const fallbackResult = localFacultyForStudent(student, person)
      const result = scores.get(String(person.id || person.faculty_id))
      if (!result) return fallbackResult
      return {
        ...person,
        match_score: Math.round(Number(result.match_score) || 0),
        match_reasons: Array.isArray(result.reasons) ? result.reasons.slice(0, 3) : fallbackResult.match_reasons,
        match_source: payload.engine || 'Semantic + structured score',
        is_available: typeof result.available === 'boolean' ? result.available : fallbackResult.is_available,
        availability_reason: result.availability_reason || fallbackResult.availability_reason,
      }
    }).sort(sortFacultyMatches)

    return { faculty: ranked, notice: serviceNotice(payload, ''), isFallback: false }
  } catch (error) {
    console.warn('Semantic faculty matching is unavailable:', error.message)
    return {
      faculty: fallback(),
      notice: 'The local semantic service is unavailable, so the transparent structured score is shown instead.',
      isFallback: true,
    }
  }
}

function localFacultyForIdea(idea, faculty) {
  const ideaValues = unique([idea?.title, idea?.category, idea?.description])
  const facultyExpertise = unique([
    ...toList(faculty?.research_interests),
    ...toList(faculty?.skills),
  ])
  const facultyTopics = unique([
    ...facultyExpertise,
    faculty?.research_experience,
    faculty?.department,
  ])
  const semanticScore = overlapScore(ideaValues, facultyTopics)
  const topicResult = matchingAvailableItems(ideaValues, facultyExpertise)
  const availability = facultyAvailability(faculty)
  const score = Math.round(100 * (
    semanticScore * 0.7 +
    topicResult.score * 0.3
  ))
  const reasons = []
  if (semanticScore >= 0.4) reasons.push('Strong related terminology in the idea and faculty profile')
  else if (semanticScore >= 0.2) reasons.push('Related terminology appears in the idea and faculty profile')
  if (topicResult.matched.length) reasons.push(`Relevant expertise: ${topicResult.matched.slice(0, 3).join(', ')}`)
  if (availability.reason) reasons.unshift(availability.reason)
  return {
    ...faculty,
    match_score: score,
    match_reasons: reasons.slice(0, 3),
    match_source: 'Structured fallback',
    is_available: availability.available,
    availability_reason: availability.reason,
  }
}

/** Rank faculty supervisors against one student research idea. */
export async function rankFacultyForIdea(idea, faculty) {
  const fallback = () => faculty.map((person) => localFacultyForIdea(idea, person)).sort(sortFacultyMatches)

  if (!matchingApiUrl()) {
    return {
      faculty: fallback(),
      notice: 'Semantic matching is not connected yet. Showing the transparent structured score instead.',
      isFallback: true,
    }
  }

  try {
    const payload = await requestService('/api/match/rank-faculty-for-idea', {
      idea: {
        title: idea?.title || '',
        category: idea?.category || '',
        description: idea?.description || '',
      },
      faculty: faculty.map(prepareFacultyForService),
    })
    if (!Array.isArray(payload?.results)) throw new Error('Matching service returned an invalid ranking.')

    const scores = new Map(payload.results.map((result) => [String(result.faculty_id), result]))
    const ranked = faculty.map((person) => {
      const fallbackResult = localFacultyForIdea(idea, person)
      const result = scores.get(String(person.id || person.faculty_id))
      if (!result) return fallbackResult
      return {
        ...person,
        match_score: Math.round(Number(result.match_score) || 0),
        match_reasons: Array.isArray(result.reasons) ? result.reasons.slice(0, 3) : fallbackResult.match_reasons,
        match_source: payload.engine || 'Semantic + structured score',
        is_available: typeof result.available === 'boolean' ? result.available : fallbackResult.is_available,
        availability_reason: result.availability_reason || fallbackResult.availability_reason,
      }
    }).sort(sortFacultyMatches)

    return { faculty: ranked, notice: serviceNotice(payload, ''), isFallback: false }
  } catch (error) {
    console.warn('Semantic idea-to-faculty matching is unavailable:', error.message)
    return {
      faculty: fallback(),
      notice: 'The local semantic service is unavailable, so the transparent structured score is shown instead.',
      isFallback: true,
    }
  }
}