import { useRef, useState } from 'react'
import { fetchOrcidPerson, initialOrcidSelection } from './lib/orcid'

const IMPORT_FIELDS = [
  { key: 'bio', label: 'Research biography', destination: 'bio' },
  { key: 'employment', label: 'Public employment → research background', destination: 'bio' },
  { key: 'department', label: 'Current department', destination: 'department' },
  { key: 'interests', label: 'Research interests', destination: 'interests' },
  { key: 'expertise', label: 'Suggested areas of expertise', destination: 'expertise' },
]

export default function OrcidImport({ draft, onApply }) {
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [record, setRecord] = useState(null)
  const [confirmed, setConfirmed] = useState(false)
  const [selected, setSelected] = useState({})
  const generation = useRef(0)

  async function load(event) {
    event.preventDefault()
    const request = ++generation.current
    setLoading(true)
    setError('')
    setRecord(null)
    setConfirmed(false)
    try {
      const result = await fetchOrcidPerson(input)
      if (request !== generation.current) return
      setRecord(result)
      setSelected(initialOrcidSelection(draft, result))
    } catch (err) {
      if (request === generation.current) setError(err.message)
    } finally {
      if (request === generation.current) setLoading(false)
    }
  }

  return <section className="orcid-import" aria-label="Import from ORCID">
    <h3>Auto-fill from ORCID</h3>
    <p>Paste an ORCID link or iD, click Load profile, then review and apply the fields you want. Pasting alone does not change your profile.</p>
    <form onSubmit={load} className="orcid-import__form">
      <label htmlFor="faculty-orcid">ORCID profile link or iD</label>
      <div className="orcid-import__input-row">
        <input id="faculty-orcid" value={input} placeholder="https://orcid.org/0000-0002-6259-9843" required disabled={loading}
          onChange={event => { setInput(event.target.value); setRecord(null); setError(''); setConfirmed(false) }} />
        <button type="submit" className="outline-button" disabled={loading || !input.trim()}>{loading ? 'Loading…' : 'Load profile'}</button>
      </div>
    </form>
    {error && <p role="alert">{error}</p>}
    {loading && <p role="status">Reading the public ORCID profile…</p>}
    {record && <div className="orcid-import__preview">
      <h4>Review: {record.name}</h4>
      <a href={`https://orcid.org/${record.id}`} target="_blank" rel="noopener noreferrer">View source profile ({record.id})</a>
      <p>Select the fields to use. Existing text is kept unless you explicitly select a replacement. Your name, email, and university ID will not be changed.</p>
      {!record.bio && <p role="status">This ORCID record has no public biography. If public employment is listed below, you can explicitly choose it as research background instead.</p>}
      {!record.interests && <p>No public research keywords are available. Research interests and skills cannot be inferred from employment.</p>}
      {record.warnings?.map((warning) => <p key={warning} role="status">{warning}</p>)}
      {!IMPORT_FIELDS.some(({ key }) => record[key]) && <p role="status">No importable information is publicly available for this record. Your current details are unchanged; you can enter them manually.</p>}
      {IMPORT_FIELDS.map(({ key: field, label, destination }) => <div key={field} className="orcid-import__field">
        <label className="orcid-import__check"><input type="checkbox" checked={!!selected[field]} disabled={!record[field]}
          onChange={event => {
            const checked = event.target.checked
            setSelected(current => ({
              ...current,
              [field]: checked,
              ...(checked && field === 'bio' ? { employment: false } : {}),
              ...(checked && field === 'employment' ? { bio: false } : {}),
            }))
          }} />{label}{String(draft[destination] || '').trim() && record[field] ? ' (replaces existing text)' : ''}</label>
        <p>{record[field] || 'Not provided publicly. Your existing text will be kept.'}</p>
        {field === 'bio' && record.biographyUpdated && <small>Biography last updated: {record.biographyUpdated}. Check titles and other dated information.</small>}
        {field === 'employment' && record.employment && <small>Factual public employment history, not a research biography or verified technical skills. Selecting this fills Research background instead of the biography above. A role without an end date is listed as present in ORCID, not independently verified.</small>}
        {field === 'expertise' && record.expertise && <small>Suggested from ORCID keywords. These are research topics, not verified technical skills.</small>}
      </div>)}
      <label className="orcid-import__check"><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} />I have reviewed the source and am authorised to use this profile information.</label>
      <button type="button" className="outline-button" disabled={!confirmed || !Object.entries(selected).some(([field, enabled]) => enabled && record[field])}
        onClick={() => { onApply(record, selected); setRecord(null); setConfirmed(false) }}>Use selected information</button>
      <small className="orcid-import__save-note">Nothing is saved until you click Save on your research profile.</small>
    </div>}
  </section>
}
