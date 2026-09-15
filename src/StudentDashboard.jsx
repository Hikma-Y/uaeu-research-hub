import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from './lib/supabase'
import {
  Bell,
  CalendarDays,
  Check,
  ChevronRight,
  CircleUserRound,
  ClipboardList,
  Download,
  Eye,
  ExternalLink,
  FileText,
  FlaskConical,
  FolderKanban,
  LayoutDashboard,
  Lightbulb,
  LogOut,
  MessageSquare,
  MoreHorizontal,
  Paperclip,
  Pencil,
  Plus,
  Search,
  Save,
  Send,
  Sparkles,
  Trash2,
  Upload,
  UserRound,
  UsersRound,
  X,
} from 'lucide-react'

const NAV_ITEMS = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'profile', label: 'My Profile', icon: UserRound },
  { id: 'opportunities', label: 'Opportunities', icon: Search },
  { id: 'applications', label: 'Applications', icon: ClipboardList },
  { id: 'projects', label: 'Project Management', icon: FolderKanban },
  { id: 'ideas', label: 'Idea Portal', icon: Lightbulb },
  { id: 'messages', label: 'Messaging', icon: MessageSquare },
]

const DOCUMENT_BUCKET = 'student-documents'

function getInitials(fullName) {
  if (!fullName) return 'ST'

  const parts = fullName
    .trim()
    .split(/\s+/)
    .filter(Boolean)

  if (!parts.length) return 'ST'

  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase()
  }

  return `${parts[0][0]}${parts[1][0]}`.toUpperCase()
}

function getFirstName(fullName) {
  if (!fullName) return 'Student'

  return fullName.trim().split(/\s+/)[0] || 'Student'
}

function formatDeadline(dateValue) {
  if (!dateValue) return 'Not specified'

  const date = new Date(`${dateValue}T00:00:00`)

  if (Number.isNaN(date.getTime())) {
    return dateValue
  }

  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

function formatBytes(bytes) {
  if (!bytes) return 'Unknown size'

  if (bytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(bytes / 1024))} KB`
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/*
 * Makes the filename safer to use inside Supabase Storage.
 */
function sanitizeFileName(fileName) {
  return fileName
    .replace(/\s+/g, '-')
    .replace(/[^a-zA-Z0-9._-]/g, '')
}

/*
 * Uploaded files get a timestamp prefix so two documents with
 * the same filename do not conflict.
 *
 * Example:
 * 1788200000000-my-cv.pdf -> my-cv.pdf
 */
function getDisplayFileName(fileName) {
  return fileName.replace(/^\d+-/, '')
}

function Sidebar({
  activeTab,
  onTabChange,
  onSignOut,
}) {
  return (
    <aside className="student-sidebar">
      <div
        className="student-sidebar__brand"
        aria-label="UAEU Research Hub"
      >
        <FlaskConical size={25} />
      </div>

      <nav aria-label="Student dashboard">
        {NAV_ITEMS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            className={
              activeTab === id
                ? 'sidebar-action is-active'
                : 'sidebar-action'
            }
            type="button"
            aria-label={label}
            aria-current={
              activeTab === id
                ? 'page'
                : undefined
            }
            data-tooltip={label}
            onClick={() => onTabChange(id)}
          >
            <Icon
              size={21}
              strokeWidth={1.8}
            />
          </button>
        ))}
      </nav>

      <button
        className="sidebar-action sidebar-action--signout"
        type="button"
        aria-label="Sign out"
        data-tooltip="Sign out"
        onClick={onSignOut}
      >
        <LogOut
          size={21}
          strokeWidth={1.8}
        />
      </button>
    </aside>
  )
}

function DashboardHeader({
  activeTab,
  profile,
}) {
  const current = NAV_ITEMS.find(
    (item) => item.id === activeTab
  )

  const initials = getInitials(
    profile?.full_name
  )

  return (
    <header className="dashboard-header">
      <div>
        <span className="dashboard-header__eyebrow">
          Student workspace
        </span>

        <h1>{current?.label}</h1>
      </div>

      <div className="dashboard-header__actions">
        <button
          className="header-icon-button"
          type="button"
          aria-label="Notifications"
        >
          <Bell size={20} />
          <span className="notification-dot" />
        </button>

        <div className="student-identity">
          <span className="student-avatar">
            {initials}
          </span>

          <span>
            <strong>
              {profile?.full_name || 'Student'}
            </strong>

            <small>
              {profile?.major || 'Major not specified'}
              {' · '}
              {profile?.year_of_study || 'Year not specified'}
            </small>
          </span>
        </div>
      </div>
    </header>
  )
}

function SectionHeading({
  eyebrow,
  title,
  action,
}) {
  return (
    <div className="section-heading">
      <div>
        <span>{eyebrow}</span>
        <h2>{title}</h2>
      </div>

      {action}
    </div>
  )
}

function OpportunityCard({
  opportunity,
  onView,
  onApply,
  isApplied,
}) {
  const tags = Array.isArray(opportunity.tags)
    ? opportunity.tags
    : []

  return (
    <article className="opportunity-card">
      <div className="opportunity-card__top">
        <span className="project-id">
          {opportunity.id}
        </span>

        {typeof opportunity.match === 'number' ? (
          <span className="match-score">
            <Sparkles size={14} />
            {opportunity.match}% match
          </span>
        ) : (
          <span className="match-score">
            <Sparkles size={14} />
            Match pending
          </span>
        )}
      </div>

      <h3>{opportunity.title}</h3>

      <p>
        {opportunity.type} · {opportunity.department}
      </p>

      <div className="tag-list">
        {tags.map((tag) => (
          <span key={tag}>
            {tag}
          </span>
        ))}
      </div>

      <div className="opportunity-card__footer">
        <span>
          <CircleUserRound size={16} />
          {opportunity.supervisor}
        </span>

        <div className="card-actions">
          <button
            type="button"
            onClick={() => onView(opportunity)}
          >
            View project
            <ChevronRight size={16} />
          </button>

          <button
            className="card-apply-button"
            type="button"
            disabled={isApplied}
            onClick={() => onApply(opportunity.id)}
          >
            {isApplied ? (
              <>
                <Check size={14} />
                Applied
              </>
            ) : (
              'Apply'
            )}
          </button>
        </div>
      </div>
    </article>
  )
}

function ProjectDetailsModal({
  project,
  isApplied,
  onApply,
  onClose,
}) {
  useEffect(() => {
    function closeOnEscape(event) {
      if (event.key === 'Escape') {
        onClose()
      }
    }

    document.addEventListener(
      'keydown',
      closeOnEscape
    )

    return () => {
      document.removeEventListener(
        'keydown',
        closeOnEscape
      )
    }
  }, [onClose])

  if (!project) return null

  const requirements = Array.isArray(
    project.requirements
  )
    ? project.requirements
    : []

  const tags = Array.isArray(project.tags)
    ? project.tags
    : []

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(event) =>
        event.target === event.currentTarget &&
        onClose()
      }
    >
      <section
        className="project-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="project-modal-title"
      >
        <button
          className="modal-close"
          type="button"
          aria-label="Close project details"
          onClick={onClose}
        >
          <X size={20} />
        </button>

        <div className="project-modal__heading">
          <div className="opportunity-card__top">
            <span className="project-id">
              {project.id} · {project.type}
            </span>

            {typeof project.match === 'number' ? (
              <span className="match-score">
                <Sparkles size={14} />
                {project.match}% match
              </span>
            ) : (
              <span className="match-score">
                <Sparkles size={14} />
                Match pending
              </span>
            )}
          </div>

          <h2 id="project-modal-title">
            {project.title}
          </h2>

          <p>
            {project.department} · Supervised by{' '}
            {project.supervisor}
          </p>
        </div>

        <div className="project-modal__body">
          <div className="project-modal__main">
            <h3>About this project</h3>

            <p>
              {project.description ||
                'No description provided.'}
            </p>

            <h3>
              What we are looking for
            </h3>

            {requirements.length ? (
              <ul>
                {requirements.map((item) => (
                  <li key={item}>
                    <Check size={15} />
                    {item}
                  </li>
                ))}
              </ul>
            ) : (
              <p>
                No requirements have been specified yet.
              </p>
            )}

            <h3>Skills and topics</h3>

            <div className="tag-list tag-list--large">
              {tags.length ? (
                tags.map((tag) => (
                  <span key={tag}>
                    {tag}
                  </span>
                ))
              ) : (
                <span>
                  No tags specified
                </span>
              )}
            </div>
          </div>

          <aside className="project-facts">
            <div>
              <CalendarDays size={18} />

              <span>
                <small>
                  Application deadline
                </small>

                <strong>
                  {formatDeadline(project.deadline)}
                </strong>
              </span>
            </div>

            <div>
              <Clock3Icon />

              <span>
                <small>
                  Expected commitment
                </small>

                <strong>
                  {project.commitment || 'Not specified'}
                </strong>
              </span>
            </div>

            <div>
              <UsersRound size={18} />

              <span>
                <small>
                  Project format
                </small>

                <strong>
                  Collaborative team
                </strong>
              </span>
            </div>
          </aside>
        </div>

        <footer className="project-modal__footer">
          <button
            className="outline-button"
            type="button"
            onClick={onClose}
          >
            Close
          </button>

          <button
            className="primary-dashboard-button"
            type="button"
            disabled={isApplied}
            onClick={() => onApply(project.id)}
          >
            {isApplied ? (
              <>
                <Check size={16} />
                Application submitted
              </>
            ) : (
              'Apply for this project'
            )}
          </button>
        </footer>
      </section>
    </div>
  )
}

function Clock3Icon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  )
}

function Overview({
  profile,
  opportunities,
  onViewProject,
  onApply,
  appliedProjectIds,
  applicationCount,
}) {
  const firstName = getFirstName(
    profile?.full_name
  )

  return (
    <div className="dashboard-section">
      <section className="student-hero">
        <div>
          <span>Student Interface</span>

          <h2>
            Welcome back, {firstName}.
          </h2>

          <p>
            Discover research opportunities,
            apply faster, track progress, and
            collaborate in one platform.
          </p>
        </div>

        <div
          className="hero-orbit"
          aria-hidden="true"
        >
          <FlaskConical size={42} />
        </div>
      </section>

      <div className="metric-grid">
        <article>
          <span className="metric-icon metric-icon--gold">
            <Sparkles />
          </span>

          <div>
            <strong>
              {opportunities.length}
            </strong>

            <span>
              Available opportunities
            </span>
          </div>

          <small>
            Loaded from the research database
          </small>
        </article>

        <article>
          <span className="metric-icon metric-icon--blue">
            <ClipboardList />
          </span>

          <div>
            <strong>
              {applicationCount}
            </strong>

            <span>
              Applications
            </span>
          </div>

          <small>
            Track every submission
          </small>
        </article>

        <article>
          <span className="metric-icon metric-icon--green">
            <FolderKanban />
          </span>

          <div>
            <strong>1</strong>
            <span>Active project</span>
          </div>

          <small>
            Project tracking demo
          </small>
        </article>
      </div>

      <section className="content-card">
        <SectionHeading
          eyebrow="Research opportunities"
          title="Available for you"
        />

        {opportunities.length ? (
          <div className="opportunity-grid opportunity-grid--overview">
            {opportunities
              .slice(0, 2)
              .map((item) => (
                <OpportunityCard
                  key={item.id}
                  opportunity={item}
                  onView={onViewProject}
                  onApply={onApply}
                  isApplied={appliedProjectIds.includes(
                    item.id
                  )}
                />
              ))}
          </div>
        ) : (
          <div className="empty-state">
            <Search size={30} />

            <h3>
              No opportunities yet
            </h3>

            <p>
              Research opportunities will appear here
              when they are added.
            </p>
          </div>
        )}
      </section>
    </div>
  )
}

/*
 * This component now uses Supabase Storage for student documents.
 */
function Profile({
  profile,
  onProfileUpdate,
}) {
  const fileInput = useRef(null)

  const [isEditing, setIsEditing] =
    useState(false)

  const [isSaving, setIsSaving] =
    useState(false)

  const [saveError, setSaveError] =
    useState('')

  const [saveSuccess, setSaveSuccess] =
    useState(false)

  const [documents, setDocuments] =
    useState([])

  const [
    documentsLoading,
    setDocumentsLoading,
  ] = useState(true)

  const [
    documentUploading,
    setDocumentUploading,
  ] = useState(false)

  const [
    documentError,
    setDocumentError,
  ] = useState('')

  const [openMenu, setOpenMenu] =
    useState(null)

  const createDraft = (
    sourceProfile
  ) => ({
    full_name: sourceProfile?.full_name || '',
    headline: sourceProfile?.headline || '',
    bio: sourceProfile?.bio || '',
    major: sourceProfile?.major || '',
    year_of_study: sourceProfile?.year_of_study || '',
    gpa: sourceProfile?.gpa ?? '',
    expected_graduation_year:
      sourceProfile?.expected_graduation_year ?? '',
    research_experience:
      sourceProfile?.research_experience || '',

    skills: Array.isArray(
      sourceProfile?.skills
    )
      ? sourceProfile.skills.join(', ')
      : '',

    research_interests:
      Array.isArray(
        sourceProfile?.research_interests
      )
        ? sourceProfile.research_interests.join(', ')
        : '',
    relevant_coursework: Array.isArray(
      sourceProfile?.relevant_coursework
    )
      ? sourceProfile.relevant_coursework.join(', ')
      : '',
    languages: Array.isArray(sourceProfile?.languages)
      ? sourceProfile.languages.join(', ')
      : '',
    achievement_entries: Array.isArray(
      sourceProfile?.achievement_entries
    )
      ? sourceProfile.achievement_entries
      : Array.isArray(sourceProfile?.achievements)
        ? sourceProfile.achievements.map((title) => ({
            title, issuer: '', date: '', description: '', link: '',
          }))
        : [],
    linkedin_url: sourceProfile?.linkedin_url || '',
    github_url: sourceProfile?.github_url || '',
    portfolio_url: sourceProfile?.portfolio_url || '',
    student_projects: Array.isArray(
      sourceProfile?.student_projects
    )
      ? sourceProfile.student_projects
      : [],
    has_research_experience:
      sourceProfile?.has_research_experience ??
      Boolean(
        sourceProfile?.experience_entries?.length ||
        sourceProfile?.research_experience
      ),
    experience_entries: Array.isArray(
      sourceProfile?.experience_entries
    )
      ? sourceProfile.experience_entries
      : sourceProfile?.research_experience
        ? [{
            title: 'Research experience',
            organization: '',
            type: 'Research',
            start_date: '',
            end_date: '',
            description: sourceProfile.research_experience,
          }]
        : [],
  })

  const [draft, setDraft] =
    useState(createDraft(profile))

  useEffect(() => {
    setDraft(createDraft(profile))
  }, [profile])

  /*
   * Load the student's stored documents from
   * their private UUID folder.
   */
  async function loadDocuments() {
    if (!profile?.id) {
      setDocuments([])
      setDocumentsLoading(false)
      return
    }

    setDocumentsLoading(true)
    setDocumentError('')

    const { data, error } =
      await supabase.storage
        .from(DOCUMENT_BUCKET)
        .list(profile.id, {
          limit: 100,
        })

    if (error) {
      console.error(
        'Document load error:',
        error.message
      )

      setDocumentError(
        'Could not load your documents.'
      )

      setDocumentsLoading(false)
      return
    }

    setDocuments(
      (data || []).filter(
        (item) => item.name !== '.emptyFolderPlaceholder'
      )
    )

    setDocumentsLoading(false)
  }

  useEffect(() => {
    loadDocuments()
  }, [profile?.id])

  function startEditing() {
    setDraft(createDraft(profile))
    setSaveError('')
    setSaveSuccess(false)
    setIsEditing(true)
  }

  function cancelEditing() {
    setDraft(createDraft(profile))
    setSaveError('')
    setIsEditing(false)
  }

  function parseList(value) {
    return value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
  }

  function updateProject(index, field, value) {
    setDraft((current) => ({
      ...current,
      student_projects: current.student_projects.map(
        (project, projectIndex) =>
          projectIndex === index
            ? { ...project, [field]: value }
            : project
      ),
    }))
  }

  function addProject() {
    setDraft((current) => ({
      ...current,
      student_projects: [
        ...current.student_projects,
        { title: '', role: '', description: '', link: '' },
      ],
    }))
  }

  function removeProject(index) {
    setDraft((current) => ({
      ...current,
      student_projects: current.student_projects.filter(
        (_project, projectIndex) => projectIndex !== index
      ),
    }))
  }

  function addAchievement() {
    setDraft((current) => ({
      ...current,
      achievement_entries: [
        ...current.achievement_entries,
        { title: '', issuer: '', date: '', description: '', link: '' },
      ],
    }))
  }

  function updateAchievement(index, field, value) {
    setDraft((current) => ({
      ...current,
      achievement_entries: current.achievement_entries.map(
        (entry, entryIndex) =>
          entryIndex === index ? { ...entry, [field]: value } : entry
      ),
    }))
  }

  function removeAchievement(index) {
    setDraft((current) => ({
      ...current,
      achievement_entries: current.achievement_entries.filter(
        (_entry, entryIndex) => entryIndex !== index
      ),
    }))
  }

  function addExperience() {
    setDraft((current) => ({
      ...current,
      has_research_experience: true,
      experience_entries: [
        ...current.experience_entries,
        {
          title: '', organization: '', type: 'Research',
          start_date: '', end_date: '', description: '',
        },
      ],
    }))
  }

  function updateExperience(index, field, value) {
    setDraft((current) => ({
      ...current,
      experience_entries: current.experience_entries.map(
        (entry, entryIndex) =>
          entryIndex === index ? { ...entry, [field]: value } : entry
      ),
    }))
  }

  function removeExperience(index) {
    setDraft((current) => {
      const entries = current.experience_entries.filter(
        (_entry, entryIndex) => entryIndex !== index
      )
      return {
        ...current,
        experience_entries: entries,
        has_research_experience: entries.length > 0,
      }
    })
  }

  async function saveProfile() {
    if (!profile?.id) {
      setSaveError(
        'Unable to update the profile because the user ID is missing.'
      )
      return
    }

    setIsSaving(true)
    setSaveError('')
    setSaveSuccess(false)

    if (!draft.full_name.trim()) {
      setSaveError('Student name is required.')
      setIsSaving(false)
      return
    }

    const gpa = draft.gpa === '' ? null : Number(draft.gpa)
    const graduationYear =
      draft.expected_graduation_year === ''
        ? null
        : Number(draft.expected_graduation_year)

    if (gpa !== null && (Number.isNaN(gpa) || gpa < 0 || gpa > 4)) {
      setSaveError('GPA must be a number between 0.00 and 4.00.')
      setIsSaving(false)
      return
    }

    if (
      graduationYear !== null &&
      (!Number.isInteger(graduationYear) ||
        graduationYear < 2026 ||
        graduationYear > 2100)
    ) {
      setSaveError('Expected graduation year must be between 2026 and 2100.')
      setIsSaving(false)
      return
    }

    const urlFields = [
      ['LinkedIn', draft.linkedin_url],
      ['GitHub', draft.github_url],
      ['Portfolio', draft.portfolio_url],
      ...draft.student_projects.map((project, index) => [
        `Project ${index + 1} link`,
        project.link || '',
      ]),
      ...draft.achievement_entries.map((entry, index) => [
        `Achievement ${index + 1} link`,
        entry.link || '',
      ]),
    ]

    const invalidUrl = urlFields.find(([, value]) => {
      if (!value.trim()) return false
      try {
        const url = new URL(value)
        return !['http:', 'https:'].includes(url.protocol)
      } catch {
        return true
      }
    })

    if (invalidUrl) {
      setSaveError(`${invalidUrl[0]} must be a complete web address.`)
      setIsSaving(false)
      return
    }

    const updates = {
      full_name: draft.full_name.trim(),
      headline: draft.headline.trim(),
      bio: draft.bio.trim(),
      major: draft.major.trim(),
      year_of_study: draft.year_of_study.trim(),
      gpa,
      expected_graduation_year: graduationYear,
      research_experience:
        draft.research_experience.trim(),
      skills: parseList(draft.skills),
      research_interests: parseList(draft.research_interests),
      relevant_coursework: parseList(draft.relevant_coursework),
      languages: parseList(draft.languages),
      linkedin_url: draft.linkedin_url.trim(),
      github_url: draft.github_url.trim(),
      portfolio_url: draft.portfolio_url.trim(),
      student_projects: draft.student_projects
        .map((project) => ({
          title: project.title?.trim() || '',
          role: project.role?.trim() || '',
          description: project.description?.trim() || '',
          link: project.link?.trim() || '',
        }))
        .filter((project) => project.title),
      has_research_experience: draft.has_research_experience,
      experience_entries: draft.has_research_experience
        ? draft.experience_entries
            .map((entry) => ({
              title: entry.title?.trim() || '',
              organization: entry.organization?.trim() || '',
              type: entry.type || 'Research',
              start_date: entry.start_date || '',
              end_date: entry.end_date || '',
              description: entry.description?.trim() || '',
            }))
            .filter((entry) => entry.title)
        : [],
      achievement_entries: draft.achievement_entries
        .map((entry) => ({
          title: entry.title?.trim() || '',
          issuer: entry.issuer?.trim() || '',
          date: entry.date || '',
          description: entry.description?.trim() || '',
          link: entry.link?.trim() || '',
        }))
        .filter((entry) => entry.title),

      updated_at:
        new Date().toISOString(),
    }

    const { data, error } =
      await supabase
        .from('profiles')
        .update(updates)
        .eq('id', profile.id)
        .select()
        .single()

    if (error) {
      console.error(
        'Profile update error:',
        error.message
      )

      setSaveError(
        'Could not save your profile. Please try again.'
      )

      setIsSaving(false)
      return
    }

    onProfileUpdate(data)

    setIsEditing(false)
    setIsSaving(false)
    setSaveSuccess(true)

    window.setTimeout(() => {
      setSaveSuccess(false)
    }, 2500)
  }

  /*
   * Upload selected files to:
   *
   * student-documents/
   *    USER_UUID/
   *       timestamp-filename.pdf
   */
  async function addDocuments(event) {
    const files = Array.from(
      event.target.files || []
    )

    event.target.value = ''

    if (!files.length || !profile?.id) {
      return
    }

    setDocumentUploading(true)
    setDocumentError('')

    for (const file of files) {
      const extension =
        file.name
          .split('.')
          .pop()
          ?.toLowerCase() || ''

      if (
        !['pdf', 'doc', 'docx'].includes(
          extension
        )
      ) {
        setDocumentError(
          `${file.name} is not a supported file type.`
        )
        continue
      }

      const safeName =
        sanitizeFileName(file.name)

      const filePath =
        `${profile.id}/${Date.now()}-${safeName}`

      const { error } =
        await supabase.storage
          .from(DOCUMENT_BUCKET)
          .upload(
            filePath,
            file,
            {
              upsert: false,
              contentType: file.type || undefined,
            }
          )

      if (error) {
        console.error(
          'Document upload error:',
          error.message
        )

        setDocumentError(
          `Could not upload ${file.name}.`
        )
      }
    }

    setDocumentUploading(false)

    await loadDocuments()
  }

  /*
   * Since the bucket is private, we create a temporary
   * signed URL when the student wants to preview a file.
   */
  async function previewDocument(item) {
    if (!profile?.id) return

    setDocumentError('')
    setOpenMenu(null)

    const filePath =
      `${profile.id}/${item.name}`

    const { data, error } =
      await supabase.storage
        .from(DOCUMENT_BUCKET)
        .createSignedUrl(
          filePath,
          60
        )

    if (error) {
      console.error(
        'Preview error:',
        error.message
      )

      setDocumentError(
        'Could not preview this document.'
      )

      return
    }

    window.open(
      data.signedUrl,
      '_blank',
      'noopener,noreferrer'
    )
  }

  /*
   * Download the private file as a Blob,
   * then trigger a normal browser download.
   */
  async function downloadDocument(item) {
    if (!profile?.id) return

    setDocumentError('')
    setOpenMenu(null)

    const filePath =
      `${profile.id}/${item.name}`

    const { data, error } =
      await supabase.storage
        .from(DOCUMENT_BUCKET)
        .download(filePath)

    if (error) {
      console.error(
        'Download error:',
        error.message
      )

      setDocumentError(
        'Could not download this document.'
      )

      return
    }

    const objectUrl =
      URL.createObjectURL(data)

    const link =
      window.document.createElement('a')

    link.href = objectUrl
    link.download =
      getDisplayFileName(item.name)

    window.document.body.appendChild(
      link
    )

    link.click()
    link.remove()

    URL.revokeObjectURL(objectUrl)
  }

  /*
   * Delete the file from Supabase Storage.
   */
  async function removeDocument(item) {
    if (!profile?.id) return

    const confirmed =
      window.confirm(
        `Remove ${getDisplayFileName(item.name)}?`
      )

    if (!confirmed) {
      setOpenMenu(null)
      return
    }

    setDocumentError('')
    setOpenMenu(null)

    const filePath =
      `${profile.id}/${item.name}`

    const { error } =
      await supabase.storage
        .from(DOCUMENT_BUCKET)
        .remove([filePath])

    if (error) {
      console.error(
        'Document delete error:',
        error.message
      )

      setDocumentError(
        'Could not remove this document.'
      )

      return
    }

    await loadDocuments()
  }

  const initials = getInitials(
    profile?.full_name
  )

  const completionChecks = [
    profile?.headline,
    profile?.major,
    profile?.year_of_study,
    profile?.bio,
    profile?.has_research_experience
      ? profile?.experience_entries?.length
      : true,
    profile?.skills?.length,
    profile?.research_interests?.length,
    profile?.student_projects?.length,
    profile?.linkedin_url || profile?.github_url,
    documents.length,
  ]
  const completion = Math.round(
    (completionChecks.filter(Boolean).length /
      completionChecks.length) * 100
  )

  return (
    <div className="dashboard-section profile-page-layout">
      <section className="content-card profile-card">
        <SectionHeading
          eyebrow="Personal details"
          title="My profile"
          action={
            isEditing ? (
              <div className="edit-actions">
                <button
                  className="outline-button"
                  type="button"
                  onClick={cancelEditing}
                  disabled={isSaving}
                >
                  Cancel
                </button>

                <button
                  className="save-button"
                  type="button"
                  onClick={saveProfile}
                  disabled={isSaving}
                >
                  <Save size={15} />

                  {isSaving
                    ? 'Saving...'
                    : 'Save changes'}
                </button>
              </div>
            ) : (
              <button
                className="outline-button"
                type="button"
                onClick={startEditing}
              >
                <Pencil size={14} />
                Edit profile
              </button>
            )
          }
        />

        {saveSuccess && (
          <div
            className="success-toast"
            role="status"
          >
            <Check size={17} />
            Profile updated successfully.
          </div>
        )}

        {saveError && (
          <p role="alert">
            {saveError}
          </p>
        )}

        <div className="profile-summary">
          <span className="profile-avatar">
            {initials}
          </span>

          <div>
            {isEditing ? (
              <label className="profile-name-field">
                Student name
                <input
                  value={draft.full_name}
                  onChange={(event) =>
                    setDraft({ ...draft, full_name: event.target.value })
                  }
                />
              </label>
            ) : (
              <h3>{profile?.full_name || 'Student'}</h3>
            )}

            <p className="profile-headline">
              {profile?.headline ||
                'Add a headline that introduces your research interests'}
            </p>

            <span>
              {profile?.major || 'Major not specified'}
              {' · '}
              {profile?.year_of_study || 'Year not specified'}
            </span>

            {!isEditing && (
              <div className="profile-intro-links">
                {[
                  ['LinkedIn', profile?.linkedin_url],
                  ['GitHub', profile?.github_url],
                  ['Portfolio', profile?.portfolio_url],
                ].filter(([, url]) => url).map(([label, url]) => (
                  <a key={label} href={url} target="_blank" rel="noreferrer">
                    {label} <ExternalLink size={12} />
                  </a>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="profile-completion-row">
          <span>Profile completion</span>
          <strong>{completion}%</strong>
        </div>
        <div
          className="profile-progress"
          role="progressbar"
          aria-valuenow={completion}
          aria-valuemin="0"
          aria-valuemax="100"
        >
          <span style={{ width: `${completion}%` }} />
        </div>

        <h4 className="profile-section-title">About</h4>
        {isEditing ? (
          <div className="profile-fields">
            <label>
              Headline
              <input
                value={draft.headline}
                placeholder="Computer Science student interested in AI and healthcare"
                onChange={(event) =>
                  setDraft({ ...draft, headline: event.target.value })
                }
              />
            </label>

            <label>
              About me
              <textarea
                value={draft.bio}
                placeholder="Introduce your academic background and interests"
                onChange={(event) =>
                  setDraft({ ...draft, bio: event.target.value })
                }
              />
            </label>
          </div>
        ) : (
          <div className="profile-about-copy">
            {profile?.bio || 'No introduction added yet.'}
          </div>
        )}

        <h4 className="profile-section-title">Academic details</h4>
        <div className="profile-fields">
          <label>
            UAEU email

            <input
              value={profile?.email || ''}
              readOnly
            />
          </label>

          <label>
            University ID

            <input
              value={profile?.university_id || ''}
              readOnly
            />
          </label>

          <label>
            Department

            <input value={profile?.department || ''} readOnly />
          </label>
        </div>

        <div className="profile-fields profile-fields--two-column academic-detail-fields">
          <label>
            Major
            <input
              value={isEditing ? draft.major : profile?.major || ''}
              readOnly={!isEditing}
              onChange={(event) =>
                setDraft({ ...draft, major: event.target.value })
              }
            />
          </label>

          <label>
            Year of study
            <input
              value={isEditing ? draft.year_of_study : profile?.year_of_study || ''}
              readOnly={!isEditing}
              placeholder="For example, Year 3"
              onChange={(event) =>
                setDraft({ ...draft, year_of_study: event.target.value })
              }
            />
          </label>

          <label>
            GPA
            <input
              type="number"
              min="0"
              max="4"
              step="0.01"
              value={isEditing ? draft.gpa : profile?.gpa ?? ''}
              readOnly={!isEditing}
              onChange={(event) =>
                setDraft({ ...draft, gpa: event.target.value })
              }
            />
          </label>

          <label>
            Expected graduation year
            <input
              type="number"
              min="2026"
              max="2100"
              value={
                isEditing
                  ? draft.expected_graduation_year
                  : profile?.expected_graduation_year ?? ''
              }
              readOnly={!isEditing}
              onChange={(event) =>
                setDraft({
                  ...draft,
                  expected_graduation_year: event.target.value,
                })
              }
            />
          </label>
        </div>

        <h4 className="profile-section-title">Research profile</h4>
        {isEditing ? (
          <div className="editable-tag-fields">
            <label>
              Research interests

              <span>
                Separate items with commas
              </span>

              <textarea
                value={
                  draft.research_interests
                }
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    research_interests:
                      event.target.value,
                  })
                }
              />
            </label>

          </div>
        ) : (
          <div className="profile-tag-groups">
            {[
              ['Research interests', profile?.research_interests],
            ].map(([label, items]) => (
              <div key={label}>
                <h5>{label}</h5>
                <div className="tag-list tag-list--large">
                  {items?.length
                    ? items.map((item) => <span key={item}>{item}</span>)
                    : <span>Nothing added yet</span>}
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="profile-section-heading">
          <h5 className="profile-subsection-title">Experience</h5>
          {isEditing && draft.has_research_experience && (
            <button className="text-button" type="button" onClick={addExperience}>
              <Plus size={15} /> Add experience
            </button>
          )}
        </div>

        {isEditing && (
          <fieldset className="experience-question">
            <legend>Do you have any research or related experience?</legend>
            <label>
              <input
                type="radio"
                name="has-research-experience"
                checked={draft.has_research_experience}
                onChange={() =>
                  setDraft({ ...draft, has_research_experience: true })
                }
              />
              Yes
            </label>
            <label>
              <input
                type="radio"
                name="has-research-experience"
                checked={!draft.has_research_experience}
                onChange={() =>
                  setDraft({
                    ...draft,
                    has_research_experience: false,
                    experience_entries: [],
                  })
                }
              />
              No
            </label>
          </fieldset>
        )}

        <div className="profile-projects">
          {(isEditing
            ? draft.has_research_experience
              ? draft.experience_entries
              : []
            : profile?.has_research_experience
              ? profile?.experience_entries || []
              : []
          ).map((entry, index) => (
            <article className="profile-project" key={`${entry.title}-${index}`}>
              {isEditing ? (
                <>
                  <div className="profile-fields profile-fields--two-column">
                    <label>
                      Experience title
                      <input
                        value={entry.title || ''}
                        onChange={(event) =>
                          updateExperience(index, 'title', event.target.value)
                        }
                      />
                    </label>
                    <label>
                      Organization or faculty
                      <input
                        value={entry.organization || ''}
                        onChange={(event) =>
                          updateExperience(index, 'organization', event.target.value)
                        }
                      />
                    </label>
                    <label>
                      Experience type
                      <select
                        value={entry.type || 'Research'}
                        onChange={(event) =>
                          updateExperience(index, 'type', event.target.value)
                        }
                      >
                        <option>Research</option>
                        <option>Internship</option>
                        <option>Volunteering</option>
                        <option>Other</option>
                      </select>
                    </label>
                    <label>
                      Start date
                      <input
                        type="month"
                        value={entry.start_date || ''}
                        onChange={(event) =>
                          updateExperience(index, 'start_date', event.target.value)
                        }
                      />
                    </label>
                    <label>
                      End date
                      <input
                        type="month"
                        value={entry.end_date || ''}
                        onChange={(event) =>
                          updateExperience(index, 'end_date', event.target.value)
                        }
                      />
                    </label>
                  </div>
                  <label className="project-description-field">
                    Description
                    <textarea
                      value={entry.description || ''}
                      onChange={(event) =>
                        updateExperience(index, 'description', event.target.value)
                      }
                    />
                  </label>
                  <button
                    className="remove-project-button"
                    type="button"
                    onClick={() => removeExperience(index)}
                  >
                    <Trash2 size={14} /> Remove experience
                  </button>
                </>
              ) : (
                <>
                  <h5>{entry.title}</h5>
                  <span>
                    {[entry.organization, entry.type].filter(Boolean).join(' · ')}
                  </span>
                  {(entry.start_date || entry.end_date) && (
                    <small>{entry.start_date || 'Start'} – {entry.end_date || 'Present'}</small>
                  )}
                  {entry.description && <p>{entry.description}</p>}
                </>
              )}
            </article>
          ))}
          {isEditing && draft.has_research_experience && !draft.experience_entries.length && (
            <button className="empty-add-button" type="button" onClick={addExperience}>
              <Plus size={17} /> Add your first experience
            </button>
          )}
          {!isEditing && !profile?.has_research_experience && (
            <p className="profile-empty-copy">No research experience added.</p>
          )}
        </div>

        <div className="profile-section-heading">
          <h4 className="profile-section-title">Projects</h4>
          {isEditing && (
            <button className="text-button" type="button" onClick={addProject}>
              <Plus size={15} /> Add project
            </button>
          )}
        </div>

        <div className="profile-projects">
          {(isEditing ? draft.student_projects : profile?.student_projects || [])
            .map((project, index) => (
              <article className="profile-project" key={`${project.title}-${index}`}>
                {isEditing ? (
                  <>
                    <div className="profile-fields profile-fields--two-column">
                      <label>
                        Project title
                        <input
                          value={project.title || ''}
                          onChange={(event) => updateProject(index, 'title', event.target.value)}
                        />
                      </label>
                      <label>
                        Your role
                        <input
                          value={project.role || ''}
                          onChange={(event) => updateProject(index, 'role', event.target.value)}
                        />
                      </label>
                    </div>
                    <label className="project-description-field">
                      Description
                      <textarea
                        value={project.description || ''}
                        onChange={(event) => updateProject(index, 'description', event.target.value)}
                      />
                    </label>
                    <label className="project-link-field">
                      Project link
                      <input
                        type="url"
                        value={project.link || ''}
                        placeholder="https://..."
                        onChange={(event) => updateProject(index, 'link', event.target.value)}
                      />
                    </label>
                    <button
                      className="remove-project-button"
                      type="button"
                      onClick={() => removeProject(index)}
                    >
                      <Trash2 size={14} /> Remove project
                    </button>
                  </>
                ) : (
                  <>
                    <h5>{project.title}</h5>
                    {project.role && <span>{project.role}</span>}
                    {project.description && <p>{project.description}</p>}
                    {project.link && (
                      <a href={project.link} target="_blank" rel="noreferrer">
                        View project <ExternalLink size={13} />
                      </a>
                    )}
                  </>
                )}
              </article>
            ))}
          {!isEditing && !profile?.student_projects?.length && (
            <p className="profile-empty-copy">No projects added yet.</p>
          )}
          {isEditing && !draft.student_projects.length && (
            <button className="empty-add-button" type="button" onClick={addProject}>
              <Plus size={17} /> Add your first project
            </button>
          )}
        </div>

        <h4 className="profile-section-title">Skills and languages</h4>
        {isEditing ? (
          <div className="editable-tag-fields">
            {[
              ['Technical and soft skills', 'skills'],
              ['Relevant coursework', 'relevant_coursework'],
              ['Languages', 'languages'],
            ].map(([label, field]) => (
              <label key={field}>
                {label}
                <span>Separate items with commas</span>
                <textarea
                  value={draft[field]}
                  onChange={(event) =>
                    setDraft({ ...draft, [field]: event.target.value })
                  }
                />
              </label>
            ))}
          </div>
        ) : (
          <div className="profile-tag-groups">
            {[
              ['Skills', profile?.skills],
              ['Relevant coursework', profile?.relevant_coursework],
              ['Languages', profile?.languages],
            ].map(([label, items]) => (
              <div key={label}>
                <h5>{label}</h5>
                <div className="tag-list tag-list--large">
                  {items?.length
                    ? items.map((item) => <span key={item}>{item}</span>)
                    : <span>Nothing added yet</span>}
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="profile-section-heading">
          <h4 className="profile-section-title">Achievements</h4>
          {isEditing && (
            <button className="text-button" type="button" onClick={addAchievement}>
              <Plus size={15} /> Add achievement
            </button>
          )}
        </div>

        <div className="profile-projects">
          {(isEditing
            ? draft.achievement_entries
            : profile?.achievement_entries || []
          ).map((entry, index) => (
            <article className="profile-project" key={`${entry.title}-${index}`}>
              {isEditing ? (
                <>
                  <div className="profile-fields profile-fields--two-column">
                    <label>
                      Achievement title
                      <input
                        value={entry.title || ''}
                        placeholder="Award or certification name"
                        onChange={(event) =>
                          updateAchievement(index, 'title', event.target.value)
                        }
                      />
                    </label>
                    <label>
                      Issuer or organization
                      <input
                        value={entry.issuer || ''}
                        onChange={(event) =>
                          updateAchievement(index, 'issuer', event.target.value)
                        }
                      />
                    </label>
                    <label>
                      Date received
                      <input
                        type="month"
                        value={entry.date || ''}
                        onChange={(event) =>
                          updateAchievement(index, 'date', event.target.value)
                        }
                      />
                    </label>
                    <label>
                      Credential link
                      <input
                        type="url"
                        value={entry.link || ''}
                        placeholder="https://..."
                        onChange={(event) =>
                          updateAchievement(index, 'link', event.target.value)
                        }
                      />
                    </label>
                  </div>
                  <label className="project-description-field">
                    Description
                    <textarea
                      value={entry.description || ''}
                      onChange={(event) =>
                        updateAchievement(index, 'description', event.target.value)
                      }
                    />
                  </label>
                  <button
                    className="remove-project-button"
                    type="button"
                    onClick={() => removeAchievement(index)}
                  >
                    <Trash2 size={14} /> Remove achievement
                  </button>
                </>
              ) : (
                <>
                  <h5>{entry.title}</h5>
                  {entry.issuer && <span>{entry.issuer}</span>}
                  {entry.date && <small>{entry.date}</small>}
                  {entry.description && <p>{entry.description}</p>}
                  {entry.link && (
                    <a href={entry.link} target="_blank" rel="noreferrer">
                      View credential <ExternalLink size={13} />
                    </a>
                  )}
                </>
              )}
            </article>
          ))}
          {!isEditing && !profile?.achievement_entries?.length && (
            <p className="profile-empty-copy">No achievements added yet.</p>
          )}
          {isEditing && !draft.achievement_entries.length && (
            <button className="empty-add-button" type="button" onClick={addAchievement}>
              <Plus size={17} /> Add your first achievement
            </button>
          )}
        </div>

        {isEditing && (
          <>
          <h4 className="profile-section-title">Professional links</h4>
          <div className="profile-fields">
            {[
              ['LinkedIn', 'linkedin_url'],
              ['GitHub', 'github_url'],
              ['Portfolio website', 'portfolio_url'],
            ].map(([label, field]) => (
              <label key={field}>
                {label}
                <input
                  type="url"
                  value={draft[field]}
                  placeholder="https://..."
                  onChange={(event) =>
                    setDraft({ ...draft, [field]: event.target.value })
                  }
                />
              </label>
            ))}
          </div>
          </>
        )}
      </section>

      <aside className="content-card documents-card">
        <SectionHeading
          eyebrow="Application documents"
          title="My documents"
        />

        <button
          className="upload-zone"
          type="button"
          disabled={documentUploading}
          onClick={() =>
            fileInput.current?.click()
          }
        >
          <Upload size={24} />

          <strong>
            {documentUploading
              ? 'Uploading...'
              : 'Upload documents'}
          </strong>

          <span>
            PDF or DOCX · stored securely in your account
          </span>
        </button>

        <input
          ref={fileInput}
          hidden
          multiple
          type="file"
          accept=".pdf,.doc,.docx"
          onChange={addDocuments}
        />

        {documentError && (
          <p role="alert">
            {documentError}
          </p>
        )}

        {documentsLoading ? (
          <div className="documents-empty">
            <FileText size={25} />
            <p>
              Loading documents...
            </p>
          </div>
        ) : !documents.length ? (
          <div className="documents-empty">
            <FileText size={25} />

            <p>
              No documents uploaded yet.
            </p>
          </div>
        ) : (
          documents.map((item) => (
            <div
              className="document-row"
              key={item.id || item.name}
            >
              <span>
                <FileText size={20} />

                <span>
                  <strong>
                    {getDisplayFileName(
                      item.name
                    )}
                  </strong>

                  <small>
                    {formatBytes(
                      item.metadata?.size
                    )}
                    {' · '}
                    Stored securely
                  </small>
                </span>
              </span>

              <div className="document-menu-wrap">
                <button
                  type="button"
                  aria-label={`Options for ${getDisplayFileName(item.name)}`}
                  aria-expanded={
                    openMenu === item.name
                  }
                  onClick={() =>
                    setOpenMenu(
                      openMenu === item.name
                        ? null
                        : item.name
                    )
                  }
                >
                  <MoreHorizontal />
                </button>

                {openMenu === item.name && (
                  <div className="document-menu">
                    <button
                      type="button"
                      onClick={() =>
                        previewDocument(item)
                      }
                    >
                      <Eye size={15} />
                      Preview
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        downloadDocument(item)
                      }
                    >
                      <Download size={15} />
                      Download
                    </button>

                    <button
                      className="document-menu__remove"
                      type="button"
                      onClick={() =>
                        removeDocument(item)
                      }
                    >
                      <Trash2 size={15} />
                      Remove
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </aside>
    </div>
  )
}

function Opportunities({
  opportunities,
  onViewProject,
  onApply,
  appliedProjectIds,
}) {
  const [query, setQuery] =
    useState('')

  const [
    programType,
    setProgramType,
  ] = useState(
    'All program types'
  )

  const visible = useMemo(
    () =>
      opportunities.filter(
        (item) => {
          const tags =
            Array.isArray(item.tags)
              ? item.tags
              : []

          const matchesQuery =
            `${item.title || ''} ${
              item.department || ''
            } ${tags.join(' ')}`
              .toLowerCase()
              .includes(
                query.toLowerCase()
              )

          const matchesType =
            programType ===
              'All program types' ||
            item.type ===
              programType

          return (
            matchesQuery &&
            matchesType
          )
        }
      ),
    [
      query,
      programType,
      opportunities,
    ]
  )

  const availableTypes =
    useMemo(
      () => [
        ...new Set(
          opportunities
            .map((item) => item.type)
            .filter(Boolean)
        ),
      ],
      [opportunities]
    )

  return (
    <div className="dashboard-section">
      <section className="content-card">
        <SectionHeading
          eyebrow="Explore"
          title="Research opportunities"
          action={
            <span className="count-pill">
              {opportunities.length}{' '}
              available
            </span>
          }
        />

        <div className="search-toolbar">
          <label className="dashboard-search">
            <Search size={19} />

            <input
              value={query}
              onChange={(event) =>
                setQuery(
                  event.target.value
                )
              }
              placeholder="Search by topic, skill, or department"
            />
          </label>

          <select
            aria-label="Program type"
            value={programType}
            onChange={(event) =>
              setProgramType(
                event.target.value
              )
            }
          >
            <option>
              All program types
            </option>

            {availableTypes.map(
              (type) => (
                <option
                  key={type}
                  value={type}
                >
                  {type}
                </option>
              )
            )}
          </select>
        </div>

        <div className="opportunity-grid">
          {visible.map((item) => (
            <div
              className={
                appliedProjectIds.includes(
                  item.id
                )
                  ? 'applied-card'
                  : ''
              }
              key={item.id}
            >
              <OpportunityCard
                opportunity={item}
                onView={onViewProject}
                onApply={onApply}
                isApplied={appliedProjectIds.includes(
                  item.id
                )}
              />
            </div>
          ))}

          {!visible.length && (
            <div className="empty-state">
              <Search size={30} />

              <h3>
                No opportunities found
              </h3>

              <p>
                Try a different keyword
                or program type.
              </p>
            </div>
          )}
        </div>
      </section>
    </div>
  )
}

function Applications({
  applications,
  opportunities,
  onViewProject,
  loading,
  error,
}) {
  if (loading) {
    return (
      <div className="dashboard-section">
        <section className="content-card">
          <SectionHeading
            eyebrow="Application center"
            title="Track your applications"
          />

          <p>
            Loading applications...
          </p>
        </section>
      </div>
    )
  }

  if (error) {
    return (
      <div className="dashboard-section">
        <section className="content-card">
          <SectionHeading
            eyebrow="Application center"
            title="Track your applications"
          />

          <p>{error}</p>
        </section>
      </div>
    )
  }

  return (
    <div className="dashboard-section">
      <section className="content-card">
        <SectionHeading
          eyebrow="Application center"
          title="Track your applications"
          action={
            <span className="count-pill">
              {applications.length}{' '}
              total
            </span>
          }
        />

        {!applications.length ? (
          <div className="empty-state">
            <ClipboardList size={30} />

            <h3>
              No applications yet
            </h3>

            <p>
              Apply to a research opportunity
              and it will appear here.
            </p>
          </div>
        ) : (
          <div className="application-table">
            <div className="application-table__header">
              <span>Application</span>
              <span>Project</span>
              <span>Status</span>
              <span>Match</span>
              <span>Updated</span>
            </div>

            {applications.map(
              (application) => {
                const project =
                  opportunities.find(
                    (item) =>
                      item.id ===
                      application.opportunity_id
                  )

                return (
                  <div
                    className="application-table__row"
                    key={application.id}
                  >
                    <span data-label="Application">
                      <strong>
                        APP
                        {String(
                          application.id
                        ).padStart(
                          3,
                          '0'
                        )}
                      </strong>
                    </span>

                    <span data-label="Project">
                      {project ? (
                        <button
                          className="project-link"
                          type="button"
                          onClick={() =>
                            onViewProject(
                              project
                            )
                          }
                        >
                          {project.title}
                        </button>
                      ) : (
                        'Project unavailable'
                      )}
                    </span>

                    <span data-label="Status">
                      <em
                        className={`status status--${application.status
                          .toLowerCase()
                          .replaceAll(
                            ' ',
                            '-'
                          )}`}
                      >
                        {application.status}
                      </em>
                    </span>

                    <span data-label="Match">
                      {typeof project?.match ===
                      'number'
                        ? `${project.match}%`
                        : 'Pending'}
                    </span>

                    <span data-label="Updated">
                      {application.updated_at
                        ? new Date(
                            application.updated_at
                          ).toLocaleDateString()
                        : '—'}
                    </span>
                  </div>
                )
              }
            )}
          </div>
        )}
      </section>
    </div>
  )
}

function Projects() {
  const milestones = [
    [
      'Literature review',
      'Completed',
      'Apr 18',
    ],
    [
      'Dataset preparation',
      'Completed',
      'Apr 25',
    ],
    [
      'Model development',
      'In progress',
      'May 12',
    ],
    [
      'Final evaluation',
      'Upcoming',
      'May 28',
    ],
  ]

  return (
    <div className="dashboard-section">
      <section className="content-card project-banner">
        <div>
          <span className="project-id">
            SURE+ 2026
          </span>

          <h2>
            Sustainability Analytics Dashboard
          </h2>

          <p>
            Supervisor: Dr. Khalid Al Nuaimi
            · 72% complete
          </p>
        </div>

        <div className="project-ring">
          <strong>72%</strong>
          <span>Progress</span>
        </div>
      </section>

      <section className="content-card">
        <SectionHeading
          eyebrow="Project timeline"
          title="Milestones"
        />

        <div className="milestone-list">
          {milestones.map(
            (
              [name, status, date],
              index
            ) => (
              <div
                className="milestone"
                key={name}
              >
                <span
                  className={
                    status ===
                    'Completed'
                      ? 'milestone__dot is-complete'
                      : 'milestone__dot'
                  }
                >
                  {status ===
                  'Completed' ? (
                    <Check size={14} />
                  ) : (
                    index + 1
                  )}
                </span>

                <div>
                  <strong>
                    {name}
                  </strong>

                  <small>
                    {status}
                  </small>
                </div>

                <time>
                  <CalendarDays size={15} />
                  {date}
                </time>
              </div>
            )
          )}
        </div>
      </section>
    </div>
  )
}

function Ideas({ profile }) {
  const [showForm, setShowForm] =
    useState(false)

  const [submitted, setSubmitted] =
    useState(false)

  const [ideas, setIdeas] =
    useState([])

  const [
    ideasLoading,
    setIdeasLoading,
  ] = useState(true)

  const [
    ideasError,
    setIdeasError,
  ] = useState('')

  const [
    isSubmitting,
    setIsSubmitting,
  ] = useState(false)

  const [
    draftIdea,
    setDraftIdea,
  ] = useState({
    title: '',
    category:
      'Artificial Intelligence',
    description: '',
  })

  async function loadIdeas() {
    setIdeasLoading(true)
    setIdeasError('')

    const { data, error } =
      await supabase
        .from('research_ideas')
        .select(`
          *,
          profiles (
            full_name,
            major
          )
        `)
        .order('created_at', {
          ascending: false,
        })

    if (error) {
      console.error(
        'Research ideas load error:',
        error.message
      )

      setIdeasError(
        'Could not load research ideas.'
      )

      setIdeasLoading(false)
      return
    }

    setIdeas(data || [])
    setIdeasLoading(false)
  }

  useEffect(() => {
    loadIdeas()
  }, [])

  async function submitIdea(event) {
    event.preventDefault()

    if (
      !draftIdea.title.trim() ||
      !draftIdea.description.trim()
    ) {
      return
    }

    if (!profile?.id) {
      alert(
        'Student profile could not be identified.'
      )
      return
    }

    setIsSubmitting(true)

    const { error } =
      await supabase
        .from('research_ideas')
        .insert({
          student_id:
            profile.id,

          title:
            draftIdea.title.trim(),

          category:
            draftIdea.category,

          description:
            draftIdea.description.trim(),
        })

    if (error) {
      console.error(
        'Research idea submission error:',
        error.message
      )

      alert(
        'Could not submit your research idea.'
      )

      setIsSubmitting(false)
      return
    }

    setDraftIdea({
      title: '',
      category:
        'Artificial Intelligence',
      description: '',
    })

    setSubmitted(true)
    setShowForm(false)
    setIsSubmitting(false)

    await loadIdeas()

    window.setTimeout(() => {
      setSubmitted(false)
    }, 2800)
  }

  return (
    <div className="dashboard-section">
      <section className="idea-hero content-card">
        <span>
          <Lightbulb size={30} />
        </span>

        <div>
          <h2>
            Have a research idea?
          </h2>

          <p>
            Share it with the UAEU community
            and find students or faculty
            members who want to build it with you.
          </p>
        </div>

        <button
          className="primary-dashboard-button"
          type="button"
          onClick={() =>
            setShowForm(
              (current) => !current
            )
          }
        >
          {showForm
            ? 'Close form'
            : 'Submit an idea'}
        </button>
      </section>

      {submitted && (
        <div
          className="success-toast"
          role="status"
        >
          <Check size={17} />
          Your research idea was submitted successfully.
        </div>
      )}

      {showForm && (
        <section className="content-card idea-form-card">
          <SectionHeading
            eyebrow="New proposal"
            title="Share your research idea"
          />

          <form
            className="idea-form"
            onSubmit={submitIdea}
          >
            <label>
              Idea title

              <input
                value={draftIdea.title}
                onChange={(event) =>
                  setDraftIdea({
                    ...draftIdea,
                    title:
                      event.target.value,
                  })
                }
                placeholder="Give your idea a clear, specific title"
                required
              />
            </label>

            <label>
              Research area

              <select
                value={draftIdea.category}
                onChange={(event) =>
                  setDraftIdea({
                    ...draftIdea,
                    category:
                      event.target.value,
                  })
                }
              >
                <option>
                  Artificial Intelligence
                </option>

                <option>
                  Cybersecurity
                </option>

                <option>
                  Sustainability
                </option>

                <option>
                  Healthcare
                </option>

                <option>
                  Education Technology
                </option>

                <option>
                  Data Science
                </option>

                <option>
                  Internet of Things
                </option>

                <option>
                  Other
                </option>
              </select>
            </label>

            <label className="idea-form__description">
              Describe your idea

              <textarea
                value={
                  draftIdea.description
                }
                onChange={(event) =>
                  setDraftIdea({
                    ...draftIdea,
                    description:
                      event.target.value,
                  })
                }
                placeholder="Explain the research problem, your proposed approach, and the type of collaborators you are looking for…"
                minLength={20}
                required
              />
            </label>

            <div className="idea-form__actions">
              <button
                className="outline-button"
                type="button"
                disabled={isSubmitting}
                onClick={() =>
                  setShowForm(false)
                }
              >
                Cancel
              </button>

              <button
                className="primary-dashboard-button"
                type="submit"
                disabled={isSubmitting}
              >
                <Send size={15} />

                {isSubmitting
                  ? 'Submitting...'
                  : 'Submit idea'}
              </button>
            </div>
          </form>
        </section>
      )}

      <section className="content-card">
        <SectionHeading
          eyebrow="Community ideas"
          title="Research ideas"
          action={
            !ideasLoading ? (
              <span className="count-pill">
                {ideas.length} total
              </span>
            ) : null
          }
        />

        {ideasLoading ? (
          <p>
            Loading research ideas...
          </p>
        ) : ideasError ? (
          <p role="alert">
            {ideasError}
          </p>
        ) : !ideas.length ? (
          <div className="empty-state">
            <Lightbulb size={30} />

            <h3>
              No research ideas yet
            </h3>

            <p>
              Be the first student to
              submit a research idea.
            </p>
          </div>
        ) : (
          <div className="idea-grid">
            {ideas.map((idea) => (
              <article key={idea.id}>
                <span>
                  {idea.category}
                </span>

                <h3>
                  {idea.title}
                </h3>

                <p>
                  {idea.description}
                </p>

                <small>
                  <UsersRound size={15} />

                  Submitted by{' '}
                  {idea.profiles
                    ?.full_name ||
                    'Student'}

                  {idea.profiles?.major
                    ? ` · ${idea.profiles.major}`
                    : ''}
                </small>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

/*
 * Messaging remains a frontend demo for now.
 * Socket.io will replace this later.
 */
function Messages() {
  const [message, setMessage] =
    useState('')

  const [sent, setSent] =
    useState([])

  function sendMessage(event) {
    event.preventDefault()

    if (!message.trim()) {
      return
    }

    setSent((current) => [
      ...current,
      message,
    ])

    setMessage('')
  }

  return (
    <div className="dashboard-section messaging-layout">
      <aside className="content-card conversation-list">
        <SectionHeading
          eyebrow="Inbox"
          title="Messages"
        />

        <label className="dashboard-search">
          <Search size={18} />

          <input
            placeholder="Search conversations"
          />
        </label>

        <button
          className="conversation is-active"
          type="button"
        >
          <span className="conversation-avatar">
            SA
          </span>

          <span>
            <strong>
              Dr. Sara Al Mansoori
            </strong>

            <small>
              Let's discuss your application…
            </small>
          </span>

          <time>10:42</time>
        </button>

        <button
          className="conversation"
          type="button"
        >
          <span className="conversation-avatar">
            KN
          </span>

          <span>
            <strong>
              Dr. Khalid Al Nuaimi
            </strong>

            <small>
              Your milestone was approved.
            </small>
          </span>

          <time>Mon</time>
        </button>
      </aside>

      <section className="content-card chat-panel">
        <header>
          <span className="conversation-avatar">
            SA
          </span>

          <div>
            <strong>
              Dr. Sara Al Mansoori
            </strong>

            <small>
              <span className="online-dot" />
              Online
            </small>
          </div>
        </header>

        <div className="chat-messages">
          <div className="chat-date">
            Today
          </div>

          <div className="message-bubble">
            <p>
              Your experience is a strong fit
              for the AI matching project.
              Are you available to discuss it tomorrow?
            </p>

            <time>10:38</time>
          </div>

          <div className="message-bubble message-bubble--me">
            <p>
              Yes, absolutely. I am available after 11:00 AM.
            </p>

            <time>10:41</time>
          </div>

          {sent.map(
            (item, index) => (
              <div
                className="message-bubble message-bubble--me"
                key={`${item}-${index}`}
              >
                <p>{item}</p>
                <time>Now</time>
              </div>
            )
          )}
        </div>

        <form
          className="message-composer"
          onSubmit={sendMessage}
        >
          <button
            type="button"
            aria-label="Attach file"
          >
            <Paperclip size={20} />
          </button>

          <input
            value={message}
            onChange={(event) =>
              setMessage(
                event.target.value
              )
            }
            placeholder="Write a message…"
          />

          <button
            className="send-button"
            type="submit"
            aria-label="Send message"
          >
            <Send size={18} />
          </button>
        </form>
      </section>
    </div>
  )
}

export default function StudentDashboard({
  profile,
  onSignOut,
}) {
  const [
    studentProfile,
    setStudentProfile,
  ] = useState(profile)

  const [
    activeTab,
    setActiveTab,
  ] = useState('overview')

  const [
    selectedProject,
    setSelectedProject,
  ] = useState(null)

  const [
    opportunities,
    setOpportunities,
  ] = useState([])

  const [
    opportunitiesLoading,
    setOpportunitiesLoading,
  ] = useState(true)

  const [
    opportunitiesError,
    setOpportunitiesError,
  ] = useState('')

  const [
    applications,
    setApplications,
  ] = useState([])

  const [
    applicationsLoading,
    setApplicationsLoading,
  ] = useState(true)

  const [
    applicationsError,
    setApplicationsError,
  ] = useState('')

  useEffect(() => {
    setStudentProfile(profile)
  }, [profile])

  useEffect(() => {
    async function loadOpportunities() {
      setOpportunitiesLoading(true)
      setOpportunitiesError('')

      const { data, error } =
        await supabase
          .from(
            'research_opportunities'
          )
          .select('*')
          .order('created_at', {
            ascending: false,
          })

      if (error) {
        console.error(
          'Opportunity load error:',
          error.message
        )

        setOpportunitiesError(
          'Could not load research opportunities.'
        )

        setOpportunitiesLoading(false)
        return
      }

      setOpportunities(data || [])
      setOpportunitiesLoading(false)
    }

    loadOpportunities()
  }, [])

  async function loadApplications() {
    if (!studentProfile?.id) {
      setApplications([])
      setApplicationsLoading(false)
      return
    }

    setApplicationsLoading(true)
    setApplicationsError('')

    const { data, error } =
      await supabase
        .from('applications')
        .select('*')
        .eq(
          'student_id',
          studentProfile.id
        )
        .order('created_at', {
          ascending: false,
        })

    if (error) {
      console.error(
        'Application load error:',
        error.message
      )

      setApplicationsError(
        'Could not load your applications.'
      )

      setApplicationsLoading(false)
      return
    }

    setApplications(data || [])
    setApplicationsLoading(false)
  }

  useEffect(() => {
    if (studentProfile?.id) {
      loadApplications()
    }
  }, [studentProfile?.id])

  const appliedProjectIds =
    applications.map(
      (application) =>
        application.opportunity_id
    )

  async function applyToProject(
    projectId
  ) {
    if (!studentProfile?.id) {
      alert(
        'Student profile could not be identified.'
      )
      return
    }

    if (
      appliedProjectIds.includes(
        projectId
      )
    ) {
      return
    }

    const { error } =
      await supabase
        .from('applications')
        .insert({
          student_id:
            studentProfile.id,

          opportunity_id:
            projectId,

          status:
            'Submitted',
        })

    if (error) {
      console.error(
        'Application submission error:',
        error.message
      )

      alert(
        'Could not submit the application. Please try again.'
      )

      return
    }

    await loadApplications()
  }

  if (opportunitiesLoading) {
    return (
      <div className="student-app">
        <div
          style={{
            width: '100%',
            minHeight: '100vh',
            display: 'grid',
            placeItems: 'center',
          }}
        >
          <p>
            Loading research opportunities...
          </p>
        </div>
      </div>
    )
  }

  if (opportunitiesError) {
    return (
      <div className="student-app">
        <div
          style={{
            width: '100%',
            minHeight: '100vh',
            display: 'grid',
            placeItems: 'center',
            padding: '24px',
            textAlign: 'center',
          }}
        >
          <div>
            <h2>
              Could not load opportunities
            </h2>

            <p>
              {opportunitiesError}
            </p>

            <button
              className="outline-button"
              type="button"
              onClick={onSignOut}
            >
              Sign out
            </button>
          </div>
        </div>
      </div>
    )
  }

  const screens = {
    overview: (
      <Overview
        profile={studentProfile}
        opportunities={opportunities}
        onViewProject={setSelectedProject}
        onApply={applyToProject}
        appliedProjectIds={appliedProjectIds}
        applicationCount={applications.length}
      />
    ),

    profile: (
      <Profile
        profile={studentProfile}
        onProfileUpdate={setStudentProfile}
      />
    ),

    opportunities: (
      <Opportunities
        opportunities={opportunities}
        onViewProject={setSelectedProject}
        onApply={applyToProject}
        appliedProjectIds={appliedProjectIds}
      />
    ),

    applications: (
      <Applications
        applications={applications}
        opportunities={opportunities}
        onViewProject={setSelectedProject}
        loading={applicationsLoading}
        error={applicationsError}
      />
    ),

    projects: <Projects />,

    ideas: (
      <Ideas
        profile={studentProfile}
      />
    ),

    messages: <Messages />,
  }

  return (
    <div className="student-app">
      <Sidebar
        activeTab={activeTab}
        onTabChange={setActiveTab}
        onSignOut={onSignOut}
      />

      <div className="student-app__main">
        <DashboardHeader
          activeTab={activeTab}
          profile={studentProfile}
        />

        <main className="dashboard-content">
          {Object.entries(
            screens
          ).map(
            ([tabId, screen]) => (
              <div
                key={tabId}
                hidden={
                  activeTab !== tabId
                }
              >
                {screen}
              </div>
            )
          )}
        </main>
      </div>

      <ProjectDetailsModal
        project={selectedProject}
        isApplied={
          selectedProject
            ? appliedProjectIds.includes(
                selectedProject.id
              )
            : false
        }
        onApply={applyToProject}
        onClose={() =>
          setSelectedProject(null)
        }
      />
    </div>
  )
}
