import { rankStudentsForProject } from './matching.js'

const projectMatchingFields = [
  'id', 'title', 'description', 'type', 'department', 'tags',
  'requirements', 'minimum_gpa', 'matching_weights',
]

function idKey(value) {
  return value === null || value === undefined ? '' : String(value)
}

function studentKey(student) {
  return idKey(student?.student_id || student?.id)
}

function compareText(left, right) {
  return String(left ?? '').localeCompare(String(right ?? ''))
}

function compareApplications(left, right) {
  return Number(left.matching_unavailable) - Number(right.matching_unavailable) ||
    Number(right.is_eligible) - Number(left.is_eligible) ||
    (right.match_score ?? 0) - (left.match_score ?? 0) ||
    compareText(left.student_name, right.student_name) ||
    compareText(left.id, right.id)
}

function unavailableApplication(application) {
  return {
    ...application,
    match_score: null,
    match_reasons: [],
    match_source: null,
    is_eligible: false,
    eligibility_reason: '',
    project_match_rank: null,
    matching_unavailable: true,
  }
}

function validResult(result) {
  return typeof result?.match_score === 'number' &&
    Number.isFinite(result.match_score) &&
    result.match_score >= 0 && result.match_score <= 100 &&
    typeof result.is_eligible === 'boolean'
}

/**
 * Rank only actual applicants. Candidate loading is injected so callers retain
 * responsibility for authentication and the secure project-candidates RPC.
 * Unavailable rows retain their review-action IDs and have null scores/ranks.
 */
export async function rankProjectApplications(
  applications,
  projects,
  { loadCandidates, rankStudents = rankStudentsForProject },
) {
  const notices = new Set()
  const projectById = new Map(projects.map((project) => [idKey(project.id), project]))
  const groups = new Map()
  for (const application of applications) {
    const key = idKey(application.opportunity_id)
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(unavailableApplication(application))
  }

  // Each project progresses independently; request timeouts belong to the loaders.
  await Promise.all([...groups.keys()].map(async (key) => {
    const rows = groups.get(key)
    const project = key ? projectById.get(key) : undefined
    const label = project?.title || key || 'unknown project'
    const unavailableNotice = (reason) => notices.add(`Matching unavailable for ${label}: ${reason}`)
    if (!project) {
      unavailableNotice('project not found.')
      return
    }

    try {
      const candidates = await loadCandidates(project)
      if (!Array.isArray(candidates)) throw new Error('candidate data is not an array.')
      const applicantIds = new Set(rows.map((row) => idKey(row.student_id)).filter(Boolean))
      const candidatesById = new Map()
      for (const candidate of candidates) {
        const id = studentKey(candidate)
        if (applicantIds.has(id) && !candidatesById.has(id)) candidatesById.set(id, candidate)
      }
      if (!candidatesById.size) {
        unavailableNotice('no applicant candidate profiles found.')
        return
      }

      // Never send nonapplicants (or duplicate profiles) to the matching service.
      const ranking = await rankStudents(project, [...candidatesById.values()])
      if (typeof ranking?.notice === 'string' && ranking.notice.trim()) notices.add(ranking.notice.trim())
      else if (ranking?.isFallback) notices.add('Semantic matching is unavailable; structured fallback scores are shown.')
      if (!Array.isArray(ranking?.students)) throw new Error('invalid ranking results.')
      const results = new Map()
      for (const result of ranking.students) {
        const id = studentKey(result)
        if (!candidatesById.has(id)) continue
        // Ambiguous duplicate results must not silently select a better score.
        results.set(id, results.has(id) ? null : result)
      }

      for (const row of rows) {
        const result = results.get(idKey(row.student_id))
        if (!validResult(result)) continue
        Object.assign(row, {
          match_score: result.match_score,
          match_reasons: Array.isArray(result.match_reasons) ? result.match_reasons.filter((reason) => typeof reason === 'string') : [],
          match_source: typeof result.match_source === 'string' ? result.match_source : null,
          is_eligible: result.is_eligible,
          eligibility_reason: typeof result.eligibility_reason === 'string' ? result.eligibility_reason : '',
          matching_unavailable: false,
        })
      }
      if (rows.some((row) => row.matching_unavailable)) {
        unavailableNotice('some applicants have missing candidate profiles or missing/invalid ranking results.')
      }
      rows.filter((row) => !row.matching_unavailable)
        .sort(compareApplications)
        .forEach((row, index) => { row.project_match_rank = index + 1 })
    } catch (error) {
      unavailableNotice(error?.message || 'candidate loading or ranking failed.')
    }
  }))

  return { applications: [...groups.values()].flat().sort(compareApplications), notices: [...notices].sort() }
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical)
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]))
  }
  return value
}

function stableRows(rows) {
  return rows.map(canonical).sort((left, right) =>
    compareText(left.id, right.id) || compareText(JSON.stringify(left), JSON.stringify(right)))
}

/** Stable poll key: raw application changes and project matching edits invalidate it. */
export function buildApplicationRankingKey(applications, projects) {
  return JSON.stringify({
    applications: stableRows(applications),
    projects: stableRows(projects.map((project) => Object.fromEntries(
      projectMatchingFields.filter((field) => project[field] !== undefined)
        .map((field) => [field, project[field]]),
    ))),
  })
}
