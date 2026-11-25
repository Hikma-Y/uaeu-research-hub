export function parseOrcid(input) {
  let value = input.trim()
  if (/^https?:\/\//i.test(value)) {
    const url = new URL(value)
    if (!['orcid.org', 'www.orcid.org'].includes(url.hostname) || url.username || url.password) {
      throw new Error('Use an orcid.org profile link or a 16-character ORCID iD.')
    }
    value = url.pathname.replace(/^\/+|\/+$/g, '')
  }
  const compact = value.replaceAll('-', '').toUpperCase()
  if (!/^\d{15}[\dX]$/.test(compact)) throw new Error('Enter a valid ORCID iD, such as 0000-0002-6259-9843.')
  let total = 0
  for (const digit of compact.slice(0, 15)) total = (total + Number(digit)) * 2
  const check = (12 - total % 11) % 11
  if (compact[15] !== (check === 10 ? 'X' : String(check))) throw new Error('This ORCID iD has an invalid check digit. Check the profile link.')
  return compact.match(/.{4}/g).join('-')
}

const text = value => typeof value === 'string' ? value.trim() : ''

export function mapOrcidPerson(data, id) {
  if (!data || typeof data !== 'object' || !data.name || data.path !== `/${id}/person`) {
    throw new Error('ORCID returned an unexpected profile. Please try again.')
  }
  const keywords = Array.isArray(data.keywords?.keyword) ? data.keywords.keyword : []
  const seen = new Set()
  const interests = keywords.flatMap(item => text(item?.content).split(/[,;\n]/))
    .map(value => value.trim()).filter(value => {
      const key = value.toLowerCase()
      if (!key || seen.has(key)) return false
      seen.add(key)
      return true
    }).join(', ')
  const biographyDate = Number(data.biography?.['last-modified-date']?.value)
  return {
    id,
    name: text(data.name['credit-name']?.value) || [text(data.name['given-names']?.value), text(data.name['family-name']?.value)].filter(Boolean).join(' ') || 'Name not supplied',
    bio: text(data.biography?.content),
    interests,
    expertise: interests,
    department: '',
    employment: '',
    warnings: [],
    biographyUpdated: biographyDate > 0 && Number.isFinite(biographyDate) ? new Date(biographyDate).toLocaleDateString() : '',
  }
}

function employmentDate(date) {
  if (date == null) return ''
  const year = text(date.year?.value)
  const month = text(date.month?.value)
  const day = text(date.day?.value)
  if (!/^\d{4}$/.test(year) || Number(year) === 0) return null
  if (month && (!/^\d{2}$/.test(month) || Number(month) < 1 || Number(month) > 12)) return null
  if (day && (!month || !/^\d{2}$/.test(day) || Number(day) < 1 || Number(day) > new Date(Date.UTC(Number(year), Number(month), 0)).getUTCDate())) return null
  return [year, month, day].filter(Boolean).join('-')
}

export function mapOrcidEmployments(data, id) {
  if (!data || data.path !== `/${id}/employments` || !Array.isArray(data['affiliation-group'])) {
    throw new Error('ORCID returned unexpected employment data. Please try again.')
  }
  const records = []
  const seen = new Set()
  for (const group of data['affiliation-group']) {
    if (!Array.isArray(group?.summaries)) continue
    for (const summary of group.summaries) {
      const item = summary?.['employment-summary']
      if (!item || text(item.visibility).toLowerCase() !== 'public') continue
      const organization = text(item.organization?.name)
      const role = text(item['role-title'])
      const department = text(item['department-name'])
      const start = employmentDate(item['start-date'])
      const end = employmentDate(item['end-date'])
      if (!organization || start === null || end === null || (start && end && start > end && !start.startsWith(end))) continue
      const key = JSON.stringify([organization, role, department, start, end])
      if (seen.has(key)) continue
      seen.add(key)
      records.push({ organization, role, department, start, end })
    }
  }
  const current = records.filter(record => !record.end)
  const departments = new Map(current.filter(record => record.department)
    .map(record => [record.department.toLowerCase(), record.department]))
  const warnings = []
  if (departments.size > 1) {
    warnings.push('ORCID lists multiple current employment departments. Please choose your department manually.')
  }
  // An undepartmented current affiliation cannot establish the same department.
  const department = departments.size === 1 && current.every(record => record.department)
    ? departments.values().next().value : ''
  const limit = 20
  if (records.length > limit) warnings.push(`Only the first ${limit} public employment records are shown.`)
  const employment = records.slice(0, limit).map(record => {
    const details = [record.role, record.department, record.organization].filter(Boolean).join(', ')
    const dates = record.start || record.end
      ? `${record.start || 'Start date not supplied'} – ${record.end || 'present'}`
      : 'Dates not supplied'
    return `${details} (${dates})`
  }).join('\n')
  return { department, employment, warnings }
}

export async function fetchOrcidPerson(input, fetcher = fetch) {
  const id = parseOrcid(input)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 15000)
  try {
    const response = await fetcher(`https://pub.orcid.org/v3.0/${id}/person`, {
      headers: { Accept: 'application/json' }, signal: controller.signal,
    })
    if (!response.ok) {
      const messages = {
        404: 'No public ORCID record was found for this iD.',
        429: 'ORCID is busy. Please wait a minute before trying again.',
        401: 'ORCID requires additional access for this request. Please try again later.',
        403: 'ORCID denied this request. Please try again later.',
      }
      throw new Error(messages[response.status] || `ORCID could not load the profile (${response.status}). Try again later.`)
    }
    const person = mapOrcidPerson(await response.json(), id)
    try {
      const employments = await fetcher(`https://pub.orcid.org/v3.0/${id}/employments`, {
        headers: { Accept: 'application/json' }, signal: controller.signal,
      })
      if (!employments.ok) throw new Error(`HTTP ${employments.status}`)
      return { ...person, ...mapOrcidEmployments(await employments.json(), id) }
    } catch (error) {
      const reason = error.name === 'AbortError' ? 'the request timed out' : 'the request failed'
      return { ...person, warnings: [`Public ORCID employment could not be loaded (${reason}). You can enter employment and department manually.`] }
    }
  } catch (error) {
    if (error.name === 'AbortError') throw new Error('ORCID took too long to respond. Please try again.')
    if (error instanceof TypeError) throw new Error('Could not reach ORCID. Check your connection and try again. You can still edit your profile manually.')
    throw error
  } finally {
    clearTimeout(timer)
  }
}

export function initialOrcidSelection(draft, record) {
  const bioBlank = !text(draft.bio)
  return {
    bio: bioBlank && !!text(record.bio),
    employment: bioBlank && !text(record.bio) && !!text(record.employment),
    department: !text(draft.department) && !!text(record.department),
    interests: !text(draft.interests) && !!text(record.interests),
    expertise: false,
  }
}

export function applyOrcidSelection(draft, record, selected) {
  const next = { ...draft }
  for (const field of ['bio', 'interests', 'expertise', 'department']) {
    if (selected[field] && text(record[field])) next[field] = record[field]
  }
  if (selected.employment && text(record.employment) && !(selected.bio && text(record.bio))) {
    next.bio = record.employment
  }
  return next
}
