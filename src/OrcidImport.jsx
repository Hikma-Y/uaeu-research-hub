import { useRef, useState } from 'react'
import { fetchOrcidPerson } from './lib/orcid'

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
      setSelected({ bio: !draft.bio.trim() && !!result.bio, interests: !draft.interests.trim() && !!result.interests, expertise: false })
    } catch (err) {
      if (request === generation.current) setError(err.message)
    } finally {
      if (request === generation.current) setLoading(false)
    }
  }

  return <section className="orcid-import" aria-label="Import from ORCID">
    <h3>Auto-fill from ORCID</h3>
    <p>Use your public research profile to fill the fields below, then review and save.</p>
    <form onSubmit={load} className="orcid-import__form">
      <label htmlFor="faculty-orcid">ORCID profile link or iD</label>
      <div className="orcid-import__input-row">
        <input id="faculty-orcid" value={input} placeholder="https://orcid.org/0000-0002-6259-9843" required disabled={loading}
          onChange={event => { setInput(event.target.value); setRecord(null); setError(''); setConfirmed(false) }} />
        <button type="submit" className="outline-button" disabled={loading || !input.trim()}>{loading ? 'Loading…' : 'Auto-fill'}</button>
      </div>
    </form>
    {error && <p role="alert">{error}</p>}
    {loading && <p role="status">Reading the public ORCID profile…</p>}
    {record && <div className="orcid-import__preview">
      <h4>Review: {record.name}</h4>
      <a href={`https://orcid.org/${record.id}`} target="_blank" rel="noopener noreferrer">View source profile ({record.id})</a>
      <p>Select the fields to use. Selected fields replace the current text; empty source fields leave your text unchanged.</p>
      {[
        ['bio', 'Research biography'], ['interests', 'Research interests'], ['expertise', 'Suggested areas of expertise'],
      ].map(([field, title]) => <div key={field} className="orcid-import__field">
        <label className="orcid-import__check"><input type="checkbox" checked={!!selected[field]} disabled={!record[field]}
          onChange={event => setSelected(current => ({ ...current, [field]: event.target.checked }))} />{title}{draft[field].trim() && record[field] ? ' (replaces existing text)' : ''}</label>
        <p>{record[field] || 'Not provided publicly. Your existing text will be kept.'}</p>
        {field === 'bio' && record.biographyUpdated && <small>Biography last updated: {record.biographyUpdated}. Check titles and other dated information.</small>}
        {field === 'expertise' && record.expertise && <small>Suggested from ORCID keywords. These are research topics, not verified technical skills.</small>}
      </div>)}
      <label className="orcid-import__check"><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} />I confirm this is my research profile.</label>
      <button type="button" className="outline-button" disabled={!confirmed || !Object.entries(selected).some(([field, enabled]) => enabled && record[field])}
        onClick={() => { onApply(record, selected); setRecord(null); setConfirmed(false) }}>Use selected information</button>
      <small className="orcid-import__save-note">Nothing is saved until you click Save on your research profile.</small>
    </div>}
  </section>
}
