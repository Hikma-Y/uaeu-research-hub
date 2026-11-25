const stopWords = new Set('a an the and or to of in on for with is are be this that my our research idea study project using use'.split(' '))

function words(value) {
  return [...new Set(String(value || '').toLowerCase().match(/[\p{L}\p{N}]+/gu) || [])]
    .filter((word) => word.length > 1 && !stopWords.has(word))
}

export function rankFacultyForIdea(faculty, idea) {
  const ideaWords = new Set(words(`${idea?.title || ''} ${idea?.category || ''} ${idea?.description || ''}`))
  return faculty.map((person) => {
    const topics = [...new Set([...(person.research_interests || []), ...(person.skills || [])])]
    const matchedTopics = topics.filter((topic) => words(topic).some((word) => ideaWords.has(word)))
    const expertiseWords = new Set(words(`${topics.join(' ')} ${person.department || ''} ${person.research_experience || ''}`))
    const matchedWords = [...ideaWords].filter((word) => expertiseWords.has(word))
    return { ...person, score: matchedTopics.length * 3 + matchedWords.length, matchedTopics, matchedWords }
  }).sort((a, b) => b.score - a.score || (a.full_name || '').localeCompare(b.full_name || ''))
    .map((person, index) => ({ ...person, rank: index + 1 }))
}
