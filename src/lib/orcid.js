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

export function mapOrcidPerson(data, id) {
  if (!data || typeof data !== 'object' || !data.name || data.path !== `/${id}/person`) {
    throw new Error('ORCID returned an unexpected profile. Please try again.')
  }
  const text = value => typeof value === 'string' ? value.trim() : ''
  const keywords = Array.isArray(data.keywords?.keyword) ? data.keywords.keyword : []
  const seen = new Set()
  const interests = keywords.flatMap(item => text(item.content).split(/[,;\n]/))
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
    biographyUpdated: biographyDate > 0 && Number.isFinite(biographyDate) ? new Date(biographyDate).toLocaleDateString() : '',
  }
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
    return mapOrcidPerson(await response.json(), id)
  } catch (error) {
    if (error.name === 'AbortError') throw new Error('ORCID took too long to respond. Please try again.')
    if (error instanceof TypeError) throw new Error('Could not reach ORCID. Check your connection and try again. You can still edit your profile manually.')
    throw error
  } finally {
    clearTimeout(timer)
  }
}

export function applyOrcidSelection(draft, record, selected) {
  const next = { ...draft }
  for (const field of ['bio', 'interests', 'expertise']) {
    if (selected[field] && record[field]) next[field] = record[field]
  }
  return next
}
