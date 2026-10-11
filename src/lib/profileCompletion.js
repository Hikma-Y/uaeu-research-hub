export function missingProfileFields(profile) {
  const missing = []
  const text = (field, label) => { if (!String(profile?.[field] || '').trim()) missing.push(label) }
  text('department', 'Department')
  text(profile?.role === 'faculty' ? 'research_experience' : 'bio', 'Research background / biography')
  for (const [field, label] of [['research_interests', 'Research interests'], ['skills', 'Skills / expertise']]) {
    if (!Array.isArray(profile?.[field]) || !profile[field].some(item => String(item || '').trim())) missing.push(label)
  }
  if (profile?.role !== 'faculty') {
    text('major', 'Major')
    text('year_of_study', 'Year of study')
    if (profile?.gpa == null || profile.gpa === '' || !Number.isFinite(Number(profile.gpa)) || Number(profile.gpa) < 0 || Number(profile.gpa) > 4) missing.push('GPA')
  }
  return missing
}

// Allow navigation and reading while guarding interaction controls before their handlers run.
export function guardProfileInteraction(event, profile, onBlocked) {
  if (!missingProfileFields(profile).length) return
  const target = event.target.closest?.('button, form')
  if (!target || target.closest('[data-profile-edit]')) return
  if (!target.closest('.dashboard-content, .modal-backdrop')) return
  if (event.type === 'click') {
    if (target.matches('.idea-faculty-profile-button, .idea-student-button')) return
    const label = `${target.textContent || ''} ${target.getAttribute('aria-label') || ''}`.trim()
    if (/^(view|back|close|cancel|search|find suitable faculty|find faculty|show|hide|next|previous|overview|my profile|opportunities|projects|applications|idea portal|messages|analytics)\b/i.test(label)) return
  }
  event.preventDefault()
  event.stopPropagation()
  onBlocked()
}
