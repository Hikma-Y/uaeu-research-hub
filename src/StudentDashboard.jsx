import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from './lib/supabase'
import SupabaseMessages from './SupabaseMessages'
import {
  rankFacultyForIdea,
  rankFacultyForStudent,
  rankProjectsForStudent,
} from './lib/matching'
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
  Mail,
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

// Keep Supabase's internal UUID private while giving every existing and new
// project a short, consistent reference that is safe to show to students.
function getProjectCode(projectOrId) {
  const id = typeof projectOrId === 'object'
    ? projectOrId?.id
    : projectOrId
  const value = String(id || '').trim()

  if (!value) return 'Project'

  return value.toUpperCase().startsWith('PRJ-')
    ? value
    : `PRJ-${value.slice(0, 8)}`
}

function getRemainingSlots(project) {
  const remaining = Number(project?.remaining_slots)

  if (Number.isFinite(remaining)) {
    return Math.max(remaining, 0)
  }

  return Math.max(Number(project?.student_capacity) || 0, 0)
}

function getAvailabilityLabel(project) {
  const remaining = getRemainingSlots(project)

  if (remaining === 0) return 'Full'

  return `${remaining} student${remaining === 1 ? '' : 's'} remaining`
}

function hasStudentPayment(project) {
  return (
    project?.student_payment_aed !== null &&
    project?.student_payment_aed !== undefined
  )
}

function formatStudentPayment(payment) {
  return new Intl.NumberFormat('en-AE', {
    maximumFractionDigits: 2,
  }).format(Number(payment))
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

function StudentNotificationBell({ profile, onNavigate }) {
  const [notifications, setNotifications] = useState([])
  const [isOpen, setIsOpen] = useState(false)

  useEffect(() => {
    async function loadNotifications() {
      if (!profile?.id) return

      const { data: messages } = await supabase
        .from('direct_messages')
        .select('id, sender_id, body, attachment_name, created_at, project_invitation_id')
        .eq('recipient_id', profile.id)
        .is('read_at', null)
        .order('created_at', { ascending: false })
        .limit(6)

      const senderIds = [...new Set((messages || []).map((message) => message.sender_id))]
      const { data: senders } = senderIds.length
        ? await supabase.from('message_directory').select('id, full_name').in('id', senderIds)
        : { data: [] }
      const names = new Map((senders || []).map((sender) => [sender.id, sender.full_name]))
      setNotifications((messages || []).map((message) => ({
        ...message,
        sender_name: names.get(message.sender_id) || 'University user',
      })))
    }

    loadNotifications()
    const refreshId = window.setInterval(loadNotifications, 12000)
    return () => window.clearInterval(refreshId)
  }, [profile?.id])

  return (
    <div className="header-notifications">
      <button className="header-icon-button" type="button" aria-label="Notifications" onClick={() => setIsOpen((current) => !current)}>
        <Bell size={20} />
        {notifications.length > 0 && <span className="notification-dot" />}
      </button>
      {isOpen && (
        <div className="notification-menu" role="dialog" aria-label="Notifications">
          <header><strong>Notifications</strong>{notifications.length > 0 && <span>{notifications.length} new</span>}</header>
          {notifications.length ? notifications.map((notification) => (
            <button key={notification.id} type="button" onClick={() => {
              setIsOpen(false)
              if (notification.project_invitation_id) {
                supabase.rpc('mark_project_invitation_notification_read', { p_message_id: notification.id }).then(({ error }) => {
                  if (!error) setNotifications((current) => current.filter((item) => item.id !== notification.id))
                })
              }
              onNavigate(notification.project_invitation_id ? 'projects' : 'messages')
            }}>
              <span className="notification-menu__avatar">{getInitials(notification.sender_name)}</span>
              <span><strong>{notification.sender_name}</strong><small>{notification.project_invitation_id ? 'Invitation' : 'Message'} · {notification.body || `Attachment: ${notification.attachment_name || 'file'}`}</small></span>
              <time>{new Date(notification.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time>
            </button>
          )) : <p>No new notifications.</p>}
        </div>
      )}
    </div>
  )
}

function DashboardHeader({
  activeTab,
  profile,
  onNavigate,
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
        <StudentNotificationBell profile={profile} onNavigate={onNavigate} />

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
  isApplying,
}) {
  const tags = Array.isArray(opportunity.tags)
    ? opportunity.tags
    : []

  const isFull = getRemainingSlots(opportunity) === 0
  const isEligible = opportunity.is_eligible !== false

  return (
    <article className={`opportunity-card ${isEligible ? '' : 'opportunity-card--ineligible'}`}>
      <div className="opportunity-card__top">
        <span className="project-id">
          {getProjectCode(opportunity)}
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

      <div className="opportunity-card__availability">
        <span className={isFull ? 'is-full' : ''}>
          <UsersRound size={15} />
          {getAvailabilityLabel(opportunity)}
        </span>

        {hasStudentPayment(opportunity) && (
          <span className="is-funded">
            Student stipend: AED {formatStudentPayment(opportunity.student_payment_aed)}
          </span>
        )}

        {opportunity.minimum_gpa !== null && opportunity.minimum_gpa !== undefined && (
          <span className={isEligible ? 'is-gpa-rule' : 'is-ineligible'}>
            Minimum GPA: {opportunity.minimum_gpa}
          </span>
        )}
      </div>

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
            disabled={isApplied || isFull || isApplying || !isEligible}
            onClick={() => onApply(opportunity.id)}
          >
            {isApplied ? (
              <>
                <Check size={14} />
                Applied
              </>
            ) : isFull ? (
              'Full'
            ) : !isEligible ? (
              'Not eligible'
            ) : isApplying ? (
              'Applying…'
            ) : (
              'Apply'
            )}
          </button>
        </div>
      </div>

      {!isEligible && (
        <p className="matching-eligibility-note">
          {opportunity.eligibility_reason || 'You do not meet this project’s minimum eligibility requirement.'}
        </p>
      )}

      {isEligible && opportunity.match_reasons?.length > 0 && (
        <p className="matching-reasons">
          {opportunity.match_reasons.join(' · ')}
        </p>
      )}
    </article>
  )
}

function ProjectDetailsModal({
  project,
  isApplied,
  isApplying,
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

  const isFull = getRemainingSlots(project) === 0
  const isEligible = project.is_eligible !== false

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
              {getProjectCode(project)} · {project.type}
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
                  Student places
                </small>

                <strong>
                  {getAvailabilityLabel(project)}
                </strong>
              </span>
            </div>

            {project.minimum_gpa !== null && project.minimum_gpa !== undefined && (
              <div>
                <GraduationCap size={18} />

                <span>
                  <small>
                    Minimum GPA
                  </small>

                  <strong>
                    {project.minimum_gpa}
                  </strong>
                </span>
              </div>
            )}

            {hasStudentPayment(project) && (
              <div>
                <span className="project-facts__currency">AED</span>

                <span>
                  <small>
                    Student stipend
                  </small>

                  <strong>
                    AED {formatStudentPayment(project.student_payment_aed)}
                  </strong>
                </span>
              </div>
            )}
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
            disabled={isApplied || isFull || isApplying || !isEligible}
            onClick={() => onApply(project.id)}
          >
            {isApplied ? (
              <>
                <Check size={16} />
                Application submitted
              </>
            ) : isFull ? (
              'Project full'
            ) : !isEligible ? (
              'Not eligible'
            ) : isApplying ? (
              'Submitting application…'
            ) : (
              'Apply for this project'
            )}
          </button>
        </footer>
        {!isEligible && <p className="project-modal__eligibility" role="status">{project.eligibility_reason || 'You do not meet this project’s minimum eligibility requirement.'}</p>}
        {isEligible && project.match_reasons?.length > 0 && <p className="project-modal__eligibility">Why it matches: {project.match_reasons.join(' · ')}</p>}
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
  applyingProjectIds,
  applicationCount,
  projectCount,
  onNavigate,
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
        <button className="metric-card-button" type="button" onClick={() => onNavigate('opportunities')}>
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
        </button>

        <button className="metric-card-button" type="button" onClick={() => onNavigate('applications')}>
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
        </button>

        <button className="metric-card-button" type="button" onClick={() => onNavigate('projects')}>
          <span className="metric-icon metric-icon--green">
            <FolderKanban />
          </span>

          <div>
            <strong>{projectCount}</strong>
            <span>Active projects</span>
          </div>

          <small>
            Track your research progress
          </small>
        </button>
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
                  isApplying={applyingProjectIds.includes(item.id)}
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
    headline: sourceProfile?.headline || '',
    bio: sourceProfile?.bio || '',
    major: sourceProfile?.major || '',
    department: sourceProfile?.department || '',
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
      headline: draft.headline.trim(),
      bio: draft.bio.trim(),
      major: draft.major.trim(),
      department: draft.department.trim(),
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
            <h3>{profile?.full_name || 'Student'}</h3>

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

            <input
              value={isEditing ? draft.department : profile?.department || ''}
              readOnly={!isEditing}
              onChange={(event) => setDraft({ ...draft, department: event.target.value })}
            />
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
  matchingNotice,
  onViewProject,
  onApply,
  appliedProjectIds,
  applyingProjectIds,
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

        {matchingNotice && (
          <p className="opportunity-matching-note" role="status">
            <Sparkles size={14} />
            {matchingNotice}
          </p>
        )}

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
                isApplying={applyingProjectIds.includes(item.id)}
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

function FindFaculty({ profile, idea, onContact, invitationRefreshKey }) {
  const [faculty, setFaculty] = useState([])
  const [rankedFaculty, setRankedFaculty] = useState([])
  const [loading, setLoading] = useState(true)
  const [rankingLoading, setRankingLoading] = useState(false)
  const [rankingNotice, setRankingNotice] = useState('')
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [department, setDepartment] = useState('')
  const [interest, setInterest] = useState('')
  const [selected, setSelected] = useState(null)
  const [invitedFacultyIds, setInvitedFacultyIds] = useState([])
  const [invitationStatusError, setInvitationStatusError] = useState('')
  const [invitationsLoading, setInvitationsLoading] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function load() {
      const { data, error: loadError } = await supabase.rpc('get_faculty_directory')
      if (cancelled) return
      if (loadError) setError('Faculty profiles could not be loaded. Please try again later.')
      else setFaculty(data || [])
      setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (!profile?.id || !idea?.id) {
      setInvitedFacultyIds([])
      setInvitationStatusError('')
      setInvitationsLoading(false)
      return undefined
    }

    let cancelled = false
    async function loadInvitations() {
      setInvitationsLoading(true)
      const { data, error: invitationError } = await supabase
        .from('direct_messages')
        .select('recipient_id')
        .eq('sender_id', profile.id)
        .eq('research_idea_id', idea.id)

      if (cancelled) return
      if (invitationError) {
        console.error('Faculty invitation status load error:', invitationError.message)
        setInvitationStatusError('Previously sent invitations could not be loaded.')
        setInvitedFacultyIds([])
        setInvitationsLoading(false)
        return
      }

      setInvitationStatusError('')
      setInvitedFacultyIds([...new Set((data || []).map((invite) => String(invite.recipient_id)))])
      setInvitationsLoading(false)
    }

    loadInvitations()
    return () => { cancelled = true }
  }, [profile?.id, idea?.id, invitationRefreshKey])

  const hasMatchingProfile = Boolean(
    profile?.major ||
    profile?.department ||
    profile?.research_experience ||
    profile?.bio ||
    profile?.has_research_experience ||
    profile?.experience_entries?.length ||
    profile?.skills?.length ||
    profile?.research_interests?.length ||
    profile?.relevant_coursework?.length
  )
  const profileKey = [
    profile?.id,
    profile?.major,
    profile?.department,
    profile?.research_experience,
    profile?.bio,
    profile?.has_research_experience,
    (profile?.skills || []).join('|'),
    (profile?.research_interests || []).join('|'),
    (profile?.relevant_coursework || []).join('|'),
    (profile?.research_tools || []).join('|'),
    JSON.stringify(profile?.experience_entries || []),
  ].join('::')
  const ideaKey = [idea?.id, idea?.title, idea?.category, idea?.description].join('::')

  useEffect(() => {
    if (!faculty.length) {
      setRankedFaculty([])
      setRankingLoading(false)
      return undefined
    }

    let cancelled = false
    setRankingLoading(true)
    const delay = idea ? 250 : 0
    const timer = window.setTimeout(() => {
      async function rank() {
        const ranking = idea
          ? await rankFacultyForIdea(idea, faculty)
          : hasMatchingProfile
            ? await rankFacultyForStudent(profile, faculty)
            : {
                faculty: [...faculty].sort((left, right) =>
                  String(left.full_name || '').localeCompare(String(right.full_name || ''))
                ),
                notice: 'Add research interests, skills, or academic details to receive personalised faculty recommendations.',
              }
        if (cancelled) return
        setRankedFaculty(ranking.faculty || [])
        setRankingNotice(ranking.notice || '')
        setRankingLoading(false)
      }
      rank()
    }, delay)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [faculty, profileKey, ideaKey])

  useEffect(() => {
    if (!selected) return
    const closeOnEscape = (event) => { if (event.key === 'Escape') setSelected(null) }
    document.addEventListener('keydown', closeOnEscape)
    return () => document.removeEventListener('keydown', closeOnEscape)
  }, [selected])

  const departments = [...new Set(faculty.map((person) => person.department).filter(Boolean))].sort()
  const interests = [...new Set(faculty.flatMap((person) => person.research_interests || []))].sort()
  const rankedWithPosition = rankedFaculty.map((person, index) => ({ ...person, rank: index + 1 }))
  const visible = rankedWithPosition.filter((person) =>
    (!department || person.department === department) &&
    (!interest || (person.research_interests || []).includes(interest)) &&
    `${person.full_name || ''} ${person.department || ''} ${(person.research_interests || []).join(' ')} ${(person.skills || []).join(' ')}`.toLowerCase().includes(query.trim().toLowerCase())
  )

  return <section className="content-card">
    <SectionHeading eyebrow="Idea Portal" title="Find faculty" action={<span className="count-pill">{faculty.length} faculty members</span>} />
    <p className="faculty-directory-intro">Discover potential supervisors and explore their research interests.</p>
    <p className="faculty-ranking-announcement">{idea ? `Recommendations for “${idea.title || 'Your draft idea'}” use semantic topic relevance, faculty expertise, and supervision availability.` : 'Faculty are ranked from your saved research profile. You can also choose one of your ideas for idea-specific recommendations.'}</p>
    <div className="search-toolbar faculty-directory-toolbar">
      <label className="dashboard-search"><Search size={19} /><input aria-label="Search faculty" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by name, research topic, or expertise" /></label>
      <select aria-label="Faculty department" value={department} onChange={(event) => setDepartment(event.target.value)}><option value="">All departments</option>{departments.map((item) => <option key={item}>{item}</option>)}</select>
      <select aria-label="Faculty research interest" value={interest} onChange={(event) => setInterest(event.target.value)}><option value="">All research interests</option>{interests.map((item) => <option key={item}>{item}</option>)}</select>
    </div>
    {loading ? <p role="status">Loading faculty profiles…</p> : error ? <p role="alert">{error}</p> : <>
      {rankingNotice && <p className="opportunity-matching-note" role="status"><Sparkles size={14} />{rankingNotice}</p>}
      {invitationStatusError && <p className="faculty-match-reason" role="alert">{invitationStatusError}</p>}
      <p className="faculty-directory-intro" role="status">{rankingLoading ? 'Updating recommendations… ' : ''}{visible.length} faculty members · {idea ? 'Ranked by idea compatibility' : hasMatchingProfile ? 'Ranked by profile compatibility' : 'Listed alphabetically'}</p>
      <div className="opportunity-grid">
        {visible.map((person) => <article className="faculty-directory-card" key={person.id}>
          {(idea || hasMatchingProfile) && <div className="faculty-match-heading"><span className="count-pill">#{person.rank}</span><strong>{person.is_available === false ? 'Not available' : `${person.match_score ?? 0}% match`}</strong></div>}
          <div className="faculty-directory-identity"><span className="faculty-directory-avatar">{getInitials(person.full_name)}</span><div><h3>{person.full_name || 'Faculty member'}</h3><p>{person.department || 'Department not specified'}</p></div></div>
          <h4>Research interests</h4>
          <div className="tag-list">{person.research_interests?.length ? person.research_interests.map((item) => <span key={item}>{item}</span>) : <span>Not added yet</span>}</div>
          {(idea || hasMatchingProfile) && <p className="faculty-match-reason">{person.match_reasons?.join(' · ') || 'No shared profile details have been added yet.'}</p>}
          {person.is_available === false && <p className="faculty-match-reason">{person.availability_reason || 'This faculty member is not currently accepting new students.'}</p>}
          <button className="text-button" type="button" onClick={() => setSelected(person)}>View Profile <ChevronRight size={15} /></button>
          <button className="text-button" type="button" disabled={invitationsLoading || invitedFacultyIds.includes(String(person.id))} onClick={() => onContact(person, idea)}>
            {invitedFacultyIds.includes(String(person.id)) ? <><Check size={15} /> Invitation sent</> : invitationsLoading ? 'Checking invitation…' : <><Mail size={15} /> {idea ? 'Invite to discuss idea' : 'Message faculty'}</>}
          </button>
        </article>)}
        {!visible.length && <div className="empty-state"><UsersRound size={30} /><h3>{faculty.length ? 'No faculty match your search' : 'No faculty profiles available yet'}</h3><p>{faculty.length ? 'Try another keyword or change your filters.' : 'Faculty members will appear here as their profiles become available.'}</p></div>}
      </div>
    </>}
    {selected && <div className="modal-backdrop" onClick={() => setSelected(null)}><section className="project-modal" role="dialog" aria-modal="true" aria-labelledby="faculty-directory-title" onClick={(event) => event.stopPropagation()}>
      <div className="project-modal__heading"><button className="faculty-directory-close" type="button" autoFocus aria-label="Close faculty profile" onClick={() => setSelected(null)}><X size={20} /></button><span>Faculty profile</span><h2 id="faculty-directory-title">{selected.full_name}</h2><p>{selected.department || 'Department not specified'}</p></div>
      <div className="project-modal__body faculty-directory-details"><h3>Research biography</h3><p>{selected.research_experience || 'No biography added yet.'}</p><h3>Research interests</h3><div className="tag-list">{(selected.research_interests || []).map((item) => <span key={item}>{item}</span>)}{!selected.research_interests?.length && <p>Not added yet.</p>}</div><h3>Areas of expertise</h3><div className="tag-list">{(selected.skills || []).map((item) => <span key={item}>{item}</span>)}{!selected.skills?.length && <p>Not added yet.</p>}</div></div>
    </section></div>}
  </section>
}

function Applications({
  applications,
  opportunities,
  onViewProject,
  onDelete,
  deletingApplicationId,
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
              <span>Action</span>
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

                    <span data-label="Action">
                      <button
                        className="application-delete-button"
                        type="button"
                        disabled={deletingApplicationId === application.id}
                        onClick={() => onDelete(application)}
                      >
                        <Trash2 size={14} />
                        {deletingApplicationId === application.id
                          ? 'Deleting...'
                          : 'Delete'}
                      </button>
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

function ProjectInvitations({ profile, onRespond }) {
  const [invitations, setInvitations] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [rejectingId, setRejectingId] = useState(null)
  const [response, setResponse] = useState('')
  const [inquiringId, setInquiringId] = useState(null)
  const [inquiry, setInquiry] = useState('')
  const [respondingId, setRespondingId] = useState(null)
  const [notice, setNotice] = useState('')

  async function loadInvitations(silent = false) {
    if (!silent) setLoading(true)
    const { data, error: loadError } = await supabase.rpc('get_my_project_invitations')
    if (loadError) {
      console.error('Invitation load error:', loadError.message)
      setError('Could not load your project invitations.')
    } else {
      setInvitations(data || [])
      setError('')
    }
    setLoading(false)
  }

  useEffect(() => {
    loadInvitations()
    const refreshId = window.setInterval(() => loadInvitations(true), 12000)
    return () => window.clearInterval(refreshId)
  }, [profile?.id])

  async function respond(invitation, status) {
    if (respondingId) return
    setRespondingId(invitation.invitation_id)
    setError('')
    setNotice('')
    const { error: updateError } = await supabase.rpc('respond_to_project_invitation', {
      p_invitation_id: invitation.invitation_id,
      p_status: status,
      p_student_response: status === 'Rejected' ? response.trim() || null : null,
    })
    setRespondingId(null)

    if (updateError) {
      console.error('Invitation response error:', updateError.message)
      setError(updateError.message || 'Could not update this invitation.')
      return
    }

    setRejectingId(null)
    setResponse('')
    setNotice(status === 'Accepted' ? 'Invitation accepted. You have joined the project.' : 'Invitation declined.')
    await loadInvitations()
    await onRespond?.()
  }

  async function sendInquiry(invitation) {
    const body = inquiry.trim()
    if (!body || !profile?.id) return

    const { error: sendError } = await supabase
      .from('direct_messages')
      .insert({
        sender_id: profile.id,
        recipient_id: invitation.faculty_id,
        body: `Question about “${invitation.project_title}”: ${body}`,
      })

    if (sendError) {
      console.error('Invitation inquiry error:', sendError.message)
      setError('Could not send your inquiry. Make sure messaging is set up first.')
      return
    }

    setInquiry('')
    setInquiringId(null)
  }

  return (
    <section className="content-card invitation-section">
      <SectionHeading eyebrow="Private opportunities" title="Project invitations" />
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      {loading ? <p>Loading invitations...</p> : !invitations.length ? (
        <div className="empty-state"><Mail size={28} /><h3>No invitations yet</h3><p>Faculty invitations will appear here before a project is publicly posted.</p></div>
      ) : (
        <div className="invitation-list">
          {invitations.map((invitation) => (
            <article className="invitation-card" key={invitation.invitation_id}>
              <div><span className="project-id">Private invitation</span><em className={`invitation-status invitation-status--${invitation.status.toLowerCase()}`}>{invitation.status}</em></div>
              <h3>{invitation.project_title}</h3>
              <p>{invitation.project_description}</p>
              <small>From {invitation.faculty_name || 'Faculty member'}</small>
              {invitation.status === 'Pending' && (
                <div className="invitation-actions">
                  <button className="primary-dashboard-button" type="button" disabled={Boolean(respondingId)} onClick={() => respond(invitation, 'Accepted')}>{respondingId === invitation.invitation_id ? 'Saving...' : 'Accept invitation'}</button>
                  <button className="outline-button" type="button" onClick={() => { setRejectingId(invitation.invitation_id); setInquiringId(null) }}>Reject</button>
                  <button className="text-button" type="button" onClick={() => { setInquiringId(invitation.invitation_id); setRejectingId(null) }}>Ask a question</button>
                </div>
              )}
              {rejectingId === invitation.invitation_id && (
                <div className="invitation-response"><textarea value={response} onChange={(event) => setResponse(event.target.value)} placeholder="Optional reason for declining" /><button className="outline-button" type="button" disabled={Boolean(respondingId)} onClick={() => respond(invitation, 'Rejected')}>Confirm rejection</button></div>
              )}
              {inquiringId === invitation.invitation_id && (
                <div className="invitation-response"><textarea value={inquiry} onChange={(event) => setInquiry(event.target.value)} placeholder="Write your question for the faculty member" /><button className="primary-dashboard-button" type="button" onClick={() => sendInquiry(invitation)}>Send question</button></div>
              )}
              {invitation.status === 'Rejected' && invitation.student_response && <small className="invitation-note">Your reason: {invitation.student_response}</small>}
            </article>
          ))}
        </div>
      )}
    </section>
  )
}

function Projects({ profile, projects, loading, error, onViewProject, onInvitationRespond }) {
  return <div className="dashboard-section">
    <ProjectInvitations profile={profile} onRespond={onInvitationRespond} />
    <section className="content-card">
      <SectionHeading eyebrow="Project tracking" title="My projects" />
      {loading ? <p role="status">Loading your projects...</p> : error ? <p role="alert">{error}</p> : projects.length ?
        <div className="opportunity-grid">{projects.map((project) => <article className="content-card" key={project.id}>
          <span className="project-id">{project.program_type || 'Research project'}</span>
          <h3><button className="project-link" type="button" onClick={() => onViewProject(project)}>{project.title}</button></h3>
          <p>{project.description || project.abstract || ''}</p>
          <small>{getRemainingSlots(project)} student places remaining</small>
          <button className="text-button" type="button" onClick={() => onViewProject(project)}>View details <ChevronRight size={15} /></button>
        </article>)}</div> :
        <div className="empty-state"><FolderKanban size={30} /><h3>No active projects yet</h3><p>Your projects will appear here once your applications are accepted.</p></div>}
    </section>
  </div>
}

function Ideas({ profile, onOpenConversation }) {
  const recommendationsRef = useRef(null)
  const [recommendationIdea, setRecommendationIdea] = useState(null)
  const [contact, setContact] = useState(null)
  const [contactIdeaId, setContactIdeaId] = useState(null)
  const [contactBody, setContactBody] = useState('')
  const [contactError, setContactError] = useState('')
  const [contactSending, setContactSending] = useState(false)
  const [inviteRefreshKey, setInviteRefreshKey] = useState(0)

  function startContact(person, idea) {
    setContact(person)
    setContactIdeaId(idea?.id || null)
    setContactError('')
    setContactBody(idea ? `Hello ${person.full_name || 'Doctor'},\n\nI would like to invite you to discuss my research idea: ${idea.title || 'Untitled idea'}.\n\n${idea.description || ''}\n\nWould you be interested in discussing this idea or supervising the research?` : '')
  }

  async function sendContact(event) {
    event.preventDefault()
    if (!profile?.id || !contact || !contactBody.trim() || contactSending) return
    setContactSending(true)
    setContactError('')
    const { error } = await supabase.from('direct_messages').insert({
      sender_id: profile.id,
      recipient_id: contact.id,
      body: contactBody.trim(),
      research_idea_id: contactIdeaId,
    })
    setContactSending(false)
    if (error) {
      setContactError('Could not send your message. Please try again.')
      return
    }
    if (contactIdeaId) setInviteRefreshKey((current) => current + 1)
    setContact(null)
    if (contactIdeaId) {
      await loadIdeas()
    } else {
      onOpenConversation(contact.id)
    }
  }
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

  const [deletingIdeaId, setDeletingIdeaId] = useState(null)
  const [invitationStatusError, setInvitationStatusError] = useState('')

  const [
    draftIdea,
    setDraftIdea,
  ] = useState({
    title: '',
    category:
      'Artificial Intelligence',
    custom_category: '',
    description: '',
  })

  async function loadIdeas() {
    setIdeasLoading(true)
    setIdeasError('')
    setInvitationStatusError('')

    const { data, error } =
      await supabase
        .from('research_ideas')
        .select(`
          *,
          profiles!research_ideas_student_id_fkey (
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

    const { data: adopters } = await supabase
      .from('adopted_idea_faculty')
      .select('idea_id, faculty_name')
    const facultyNames = (adopters || []).reduce((names, item) => ({ ...names, [String(item.idea_id)]: item.faculty_name }), {})

    const { data: ideaInvitations, error: invitationError } = await supabase
      .from('direct_messages')
      .select('research_idea_id, recipient_id')
      .eq('sender_id', profile?.id)
      .not('research_idea_id', 'is', null)

    let invitedFacultyByIdea = {}
    if (invitationError) {
      console.error('Research idea invitations load error:', invitationError.message)
      setInvitationStatusError('Invitation status could not be loaded. Please try again later.')
    } else {
      setInvitationStatusError('')
      const recipientsByIdea = new Map()
      for (const invitation of ideaInvitations || []) {
        const ideaId = String(invitation.research_idea_id)
        const recipients = recipientsByIdea.get(ideaId) || new Set()
        recipients.add(String(invitation.recipient_id))
        recipientsByIdea.set(ideaId, recipients)
      }

      const recipientIds = [...new Set([...recipientsByIdea.values()].flatMap((ids) => [...ids]))]
      let facultyNamesById = {}
      if (recipientIds.length) {
        const { data: directory, error: directoryError } = await supabase
          .from('message_directory')
          .select('id, full_name')
          .in('id', recipientIds)

        if (directoryError) {
          console.error('Invited faculty names load error:', directoryError.message)
          setInvitationStatusError('Invitation status is available, but faculty names could not be loaded.')
        } else {
          facultyNamesById = (directory || []).reduce((names, person) => ({
            ...names,
            [String(person.id)]: person.full_name || 'Faculty member',
          }), {})
        }
      }

      invitedFacultyByIdea = Object.fromEntries(
        [...recipientsByIdea].map(([ideaId, recipients]) => [
          ideaId,
          [...recipients].map((id) => facultyNamesById[id] || 'Faculty member'),
        ])
      )
    }

    setIdeas((data || []).map((idea) => ({
      ...idea,
      adopter_name: facultyNames[String(idea.id)] || null,
      invited_faculty: invitedFacultyByIdea[String(idea.id)] || [],
    })))
    setIdeasLoading(false)
  }

  useEffect(() => {
    loadIdeas()
  }, [])

  async function submitIdea(event) {
    event.preventDefault()

    const category = draftIdea.category === 'Other'
      ? draftIdea.custom_category.trim()
      : draftIdea.category

    if (
      !draftIdea.title.trim() ||
      !draftIdea.description.trim() ||
      !category
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
            category,

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

    setRecommendationIdea({ title: draftIdea.title.trim(), description: draftIdea.description.trim(), category })
    setDraftIdea({
      title: '',
      category:
        'Artificial Intelligence',
      custom_category: '',
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

  async function deleteIdea(idea) {
    if (
      !profile?.id ||
      idea.student_id !== profile.id
    ) return

    setDeletingIdeaId(idea.id)

    const { error } = await supabase
      .from('research_ideas')
      .delete()
      .eq('id', idea.id)
      .eq('student_id', profile.id)

    if (error) {
      console.error('Research idea deletion error:', error.message)
      alert('Could not delete your research idea.')
      setDeletingIdeaId(null)
      return
    }

    setIdeas((current) => current.filter((item) => item.id !== idea.id))
    setDeletingIdeaId(null)
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
                    custom_category: event.target.value === 'Other'
                      ? draftIdea.custom_category
                      : '',
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

            {draftIdea.category === 'Other' && (
              <label>
                Other research area

                <input
                  value={draftIdea.custom_category}
                  onChange={(event) =>
                    setDraftIdea({
                      ...draftIdea,
                      custom_category: event.target.value,
                    })
                  }
                  placeholder="Enter the research area"
                  required
                  autoFocus
                />
              </label>
            )}

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

      {contact && <div className="modal-backdrop" onClick={() => !contactSending && setContact(null)}><section className="project-modal" role="dialog" aria-modal="true" aria-labelledby="idea-contact-title" onClick={(event) => event.stopPropagation()}>
        <div className="project-modal__heading"><h2 id="idea-contact-title">Message {contact.full_name}</h2></div>
        <form className="idea-form project-modal__body" onSubmit={sendContact}>
          <label className="idea-form__description">Invitation or message<textarea autoFocus value={contactBody} onChange={(event) => setContactBody(event.target.value)} required disabled={contactSending} /></label>
          {contactError && <p role="alert">{contactError}</p>}
          <div className="idea-form__actions"><button className="outline-button" type="button" disabled={contactSending} onClick={() => setContact(null)}>Cancel</button><button className="primary-dashboard-button" type="submit" disabled={contactSending || !contactBody.trim()}>{contactSending ? 'Sending...' : 'Send message'}</button></div>
        </form>
      </section></div>}

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
          <>
          {invitationStatusError && <p role="alert">{invitationStatusError}</p>}
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

                <div className="idea-card-footer">
                  <small>
                    <UsersRound size={15} />
                    Submitted by Student
                  </small>

                  {idea.adopter_name && (
                    <small className="idea-adopted-by">Adopted by {idea.adopter_name}</small>
                  )}

                  {idea.student_id === profile?.id && idea.invited_faculty?.length > 0 && (
                    <small className="idea-invitation-status">Invitation sent to {idea.invited_faculty.join(', ')}</small>
                  )}

                  {idea.student_id && idea.student_id !== profile?.id && (
                    <button
                      className="text-button"
                      type="button"
                      aria-label={`Message the student who submitted ${idea.title}`}
                      onClick={() => onOpenConversation(idea.student_id)}
                    >
                      <MessageSquare size={15} />
                      Message
                    </button>
                  )}

                  {idea.student_id === profile?.id && (
                    <button className="text-button" type="button" onClick={() => { setRecommendationIdea(idea); setShowForm(false); window.requestAnimationFrame(() => recommendationsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })) }}>Find suitable faculty</button>
                  )}
                  {idea.student_id === profile?.id && (
                    <button
                      className="idea-delete-button"
                      type="button"
                      disabled={deletingIdeaId === idea.id}
                      onClick={() => deleteIdea(idea)}
                    >
                      <Trash2 size={14} />
                      {deletingIdeaId === idea.id ? 'Deleting...' : 'Delete'}
                    </button>
                  )}
                </div>
              </article>
            ))}
          </div>
          </>
        )}
      </section>
      <div ref={recommendationsRef}><FindFaculty profile={profile} idea={showForm && (draftIdea.title.trim() || draftIdea.description.trim()) ? { ...draftIdea, category: draftIdea.category === 'Other' ? draftIdea.custom_category : draftIdea.category } : recommendationIdea} onContact={startContact} invitationRefreshKey={inviteRefreshKey} /></div>
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
  const [messageContactId, setMessageContactId] = useState(null)
  const [messageContactRequest, setMessageContactRequest] = useState(0)

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

  const [matchingNotice, setMatchingNotice] = useState('')

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

  const [applyingProjectIds, setApplyingProjectIds] = useState([])

  const [applicationNotice, setApplicationNotice] = useState(null)

  const [deletingApplicationId, setDeletingApplicationId] = useState(null)

  useEffect(() => {
    setStudentProfile(profile)
  }, [profile])

  const studentMatchingKey = [
    studentProfile?.id,
    studentProfile?.major,
    studentProfile?.department,
    studentProfile?.gpa,
    studentProfile?.research_experience,
    studentProfile?.bio,
    studentProfile?.has_research_experience,
    (studentProfile?.skills || []).join('|'),
    (studentProfile?.research_interests || []).join('|'),
    (studentProfile?.relevant_coursework || []).join('|'),
    (studentProfile?.research_tools || []).join('|'),
    JSON.stringify(studentProfile?.experience_entries || []),
  ].join('::')

  async function loadOpportunities(silent = false) {
    if (!silent) setOpportunitiesLoading(true)
    setOpportunitiesError('')

    const { data, error } = await supabase
      .from('student_research_opportunities')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Opportunity load error:', error.message)
      setOpportunitiesError('Could not load research opportunities.')
      setOpportunitiesLoading(false)
      return null
    }

    const publicOpportunities = data || []
    let rankedOpportunities = publicOpportunities
    if (studentProfile?.id) {
      const ranking = await rankProjectsForStudent(studentProfile, publicOpportunities)
      rankedOpportunities = ranking.projects
      setOpportunities(rankedOpportunities)
      setMatchingNotice(ranking.notice)
    } else {
      setOpportunities(publicOpportunities)
      setMatchingNotice('')
    }
    setOpportunitiesLoading(false)
    return rankedOpportunities
  }

  useEffect(() => {
    if (studentProfile?.id) loadOpportunities()
  }, [studentMatchingKey])

  async function loadApplications(silent = false) {
    if (!studentProfile?.id) {
      setApplications([])
      setApplicationsLoading(false)
      return
    }

    if (!silent) setApplicationsLoading(true)
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
      const refreshId = window.setInterval(() => {
        loadApplications(true)
        loadOpportunities(true)
      }, 12000)
      return () => window.clearInterval(refreshId)
    }
  }, [studentMatchingKey])

  const appliedProjectIds =
    applications.map(
      (application) =>
        application.opportunity_id
    )

  async function applyToProject(
    projectId
  ) {
    if (!studentProfile?.id) {
      setApplicationNotice({
        type: 'error',
        message: 'Student profile could not be identified.',
      })
      return
    }

    if (
      appliedProjectIds.includes(
        projectId
      )
    ) {
      setApplicationNotice({
        type: 'error',
        message: 'You have already applied to this project.',
      })
      return
    }

    const project = opportunities.find((item) => item.id === projectId)

    if (!project || getRemainingSlots(project) === 0) {
      setApplicationNotice({
        type: 'error',
        message: 'This project is full or is no longer available for applications.',
      })
      return
    }

    if (project.is_eligible === false) {
      setApplicationNotice({
        type: 'error',
        message: project.eligibility_reason || 'You do not meet this project’s minimum eligibility requirement.',
      })
      return
    }

    if (applyingProjectIds.includes(projectId)) {
      return
    }

    setApplicationNotice(null)
    setApplyingProjectIds((current) => [...current, projectId])

    const { error } = await supabase.rpc(
      'apply_to_research_opportunity',
      { p_opportunity_id: projectId }
    )

    setApplyingProjectIds((current) =>
      current.filter((id) => id !== projectId)
    )

    if (error) {
      console.error('Application submission error:', error.message)
      setApplicationNotice({
        type: 'error',
        message:
          error.message ||
          'Could not submit the application. Please try again.',
      })

      return
    }

    const refreshedOpportunities = await loadOpportunities()
    await loadApplications()
    setSelectedProject((current) =>
      current && refreshedOpportunities
        ? refreshedOpportunities.find((item) => item.id === current.id) || current
        : current
    )
    setApplicationNotice({
      type: 'success',
      message: 'Application submitted. Your place is now reserved for faculty review.',
    })
  }

  async function deleteApplication(application) {
    if (
      !studentProfile?.id
    ) return

    setDeletingApplicationId(application.id)
    setApplicationNotice(null)

    const { error } = await supabase
      .from('applications')
      .delete()
      .eq('id', application.id)
      .eq('student_id', studentProfile.id)

    if (error) {
      console.error('Application deletion error:', error.message)
      setApplicationNotice({
        type: 'error',
        message: 'Could not delete your application.',
      })
      setDeletingApplicationId(null)
      return
    }

    setApplications((current) =>
      current.filter((item) => item.id !== application.id)
    )
    setDeletingApplicationId(null)
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

  const acceptedProjectIds = new Set(applications.filter((item) => item.status === 'Accepted').map((item) => String(item.opportunity_id)))
  const studentProjects = opportunities.filter((item) => acceptedProjectIds.has(String(item.id)))

  const screens = {
    overview: (
      <Overview
        profile={studentProfile}
        opportunities={opportunities}
        onViewProject={setSelectedProject}
        onApply={applyToProject}
        appliedProjectIds={appliedProjectIds}
        applyingProjectIds={applyingProjectIds}
        applicationCount={applications.length}
        projectCount={studentProjects.length}
        onNavigate={setActiveTab}
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
        matchingNotice={matchingNotice}
        onViewProject={setSelectedProject}
        onApply={applyToProject}
        appliedProjectIds={appliedProjectIds}
        applyingProjectIds={applyingProjectIds}
      />
    ),

    applications: (
      <Applications
        applications={applications}
        opportunities={opportunities}
        onViewProject={setSelectedProject}
        onDelete={deleteApplication}
        deletingApplicationId={deletingApplicationId}
        loading={applicationsLoading}
        error={applicationsError}
      />
    ),

    projects: <Projects profile={studentProfile} projects={studentProjects} loading={applicationsLoading} error={applicationsError} onViewProject={setSelectedProject} onInvitationRespond={() => Promise.all([loadApplications(true), loadOpportunities(true)])} />,

    ideas: (
      <Ideas
        profile={studentProfile}
        onOpenConversation={(id) => { setMessageContactId(id); setMessageContactRequest((current) => current + 1); setActiveTab('messages') }}
      />
    ),

    messages: <SupabaseMessages key={messageContactRequest} profile={studentProfile} initialContactId={messageContactId} />,
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
          onNavigate={setActiveTab}
        />

        {applicationNotice && (
          <p
            className={`application-notice application-notice--${applicationNotice.type}`}
            role={applicationNotice.type === 'error' ? 'alert' : 'status'}
          >
            {applicationNotice.message}
          </p>
        )}

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
        isApplying={
          selectedProject
            ? applyingProjectIds.includes(selectedProject.id)
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
