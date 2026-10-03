import { useEffect, useState } from 'react'
import { supabase } from './lib/supabase'
import SupabaseMessages from './SupabaseMessages'
import OrcidImport from './OrcidImport'
import { applyOrcidSelection } from './lib/orcid'
import { rankStudentsForProject } from './lib/matching'
import {
  BarChart3,
  Bell,
  BriefcaseBusiness,
  Check,
  ChevronRight,
  ClipboardCheck,
  FileSearch,
  GraduationCap,
  LayoutDashboard,
  Lightbulb,
  LogOut,
  MessageSquare,
  Pencil,
  Plus,
  Search,
  Send,
  Sparkles,
  Trash2,
  UserRound,
  UsersRound,
  X,
} from 'lucide-react'

import './faculty.css'

const FACULTY_NAV = [
  {
    id: 'overview',
    label: 'Overview',
    icon: LayoutDashboard,
  },
  {
    id: 'profile',
    label: 'Research Profile',
    icon: UserRound,
  },
  {
    id: 'projects',
    label: 'My Projects',
    icon: BriefcaseBusiness,
  },
  {
    id: 'applications',
    label: 'Applications',
    icon: ClipboardCheck,
  },
  {
    id: 'ideas',
    label: 'Research Ideas',
    icon: Lightbulb,
  },
  {
    id: 'analytics',
    label: 'Analytics',
    icon: BarChart3,
  },
  {
    id: 'messages',
    label: 'Messaging',
    icon: MessageSquare,
  },
]

function getInitials(name) {
  if (!name) return 'FA'

  return name
    .split(' ')
    .filter(Boolean)
    .map((part) => part[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()
}

/*
 * Converts the Supabase profile row into values
 * that are easy to edit inside the Faculty UI.
 */
function createFacultyDraft(profile) {
  return {
    department: profile?.department || '',
    bio:
      profile?.research_experience || '',

    interests: Array.isArray(
      profile?.research_interests
    )
      ? profile.research_interests.join(', ')
      : '',

    expertise: Array.isArray(
      profile?.skills
    )
      ? profile.skills.join(', ')
      : '',
  }
}

function splitProjectList(value) {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

function getRemainingSlots(project) {
  const capacity = Number(project.student_capacity) || 0
  const reserved = Number(project.reserved_places) || 0

  return Math.max(capacity - reserved, 0)
}

function getRemainingSlotsLabel(project) {
  const remaining = getRemainingSlots(project)

  if (remaining === 0) return 'Full'

  return `${remaining} student${remaining === 1 ? '' : 's'} remaining`
}

function formatStudentPayment(payment) {
  const amount = Number(payment)

  return new Intl.NumberFormat('en-AE', {
    maximumFractionDigits: 2,
  }).format(amount)
}

function FacultySidebar({
  activeTab,
  onTabChange,
  onSignOut,
}) {
  return (
    <aside className="student-sidebar faculty-sidebar">
      <div
        className="student-sidebar__brand"
        aria-label="UAEU Research Hub faculty portal"
      >
        <GraduationCap size={25} />
      </div>

      <nav aria-label="Faculty dashboard">
        {FACULTY_NAV.map(
          ({
            id,
            label,
            icon: Icon,
          }) => (
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
              onClick={() =>
                onTabChange(id)
              }
            >
              <Icon
                size={21}
                strokeWidth={1.8}
              />
            </button>
          )
        )}
      </nav>

      <button
        className="sidebar-action sidebar-action--signout"
        type="button"
        aria-label="Sign out"
        data-tooltip="Sign out"
        onClick={onSignOut}
      >
        <LogOut size={21} />
      </button>
    </aside>
  )
}

function MessageNotificationBell({ profile, onNavigate }) {
  const [notifications, setNotifications] = useState([])
  const [isOpen, setIsOpen] = useState(false)

  useEffect(() => {
    async function loadNotifications() {
      if (!profile?.id) return

      const [messagesResult, applicationsResult, announcementsResult] = await Promise.all([
        supabase
          .from('direct_messages')
          .select('id, sender_id, body, attachment_name, created_at, project_invitation_id')
          .eq('recipient_id', profile.id)
          .is('read_at', null)
          .order('created_at', { ascending: false })
          .limit(6),
        supabase
          .from('faculty_project_applications')
          .select('id, student_name, project_title, created_at')
          .eq('status', 'Submitted')
          .order('created_at', { ascending: false })
          .limit(6),
        supabase
          .from('announcements')
          .select('id, title, message, published_at, audience')
          .eq('is_active', true)
          .in('audience', ['everyone', 'faculty'])
          .order('published_at', { ascending: false })
          .limit(4),
      ])

      const messages = messagesResult.data || []
      const senderIds = [...new Set(messages.map((message) => message.sender_id))]
      const { data: senders } = senderIds.length
        ? await supabase.from('message_directory').select('id, full_name').in('id', senderIds)
        : { data: [] }
      const senderNames = new Map((senders || []).map((sender) => [sender.id, sender.full_name]))

      const messageNotifications = messages.map((message) => ({
        id: `message-${message.id}`,
        message_id: message.id,
        kind: message.project_invitation_id ? 'Invitation' : 'Message',
        title: senderNames.get(message.sender_id) || 'University user',
        preview: message.body || `Attachment: ${message.attachment_name || 'file'}`,
        created_at: message.created_at,
        target: message.project_invitation_id ? 'projects' : 'messages',
      }))
      const applicationNotifications = (applicationsResult.data || []).map((application) => ({
        id: `application-${application.id}`,
        kind: 'Application',
        title: `New application for ${application.project_title || 'your project'}`,
        preview: application.student_name || 'Student applicant',
        created_at: application.created_at,
        target: 'applications',
      }))
      const announcementNotifications = (announcementsResult.data || []).map((announcement) => ({
        id: `announcement-${announcement.id}`,
        kind: 'Announcement',
        title: announcement.title,
        preview: announcement.message,
        created_at: announcement.published_at,
        target: 'overview',
      }))

      setNotifications([...messageNotifications, ...applicationNotifications, ...announcementNotifications]
        .sort((first, second) => new Date(second.created_at) - new Date(first.created_at))
        .slice(0, 10))
    }

    loadNotifications()
    const refreshId = window.setInterval(loadNotifications, 12000)
    return () => window.clearInterval(refreshId)
  }, [profile?.id])

  return (
    <div className="header-notifications">
      <button
        className="header-icon-button"
        type="button"
        aria-label={`Notifications${notifications.length ? ` (${notifications.length} new)` : ''}`}
        onClick={() => setIsOpen((current) => !current)}
      >
        <Bell size={20} />
        {notifications.length > 0 && <span className="notification-dot" />}
      </button>

      {isOpen && (
        <div className="notification-menu" role="dialog" aria-label="Notifications">
          <header><strong>Notifications</strong>{notifications.length > 0 && <span>{notifications.length} new</span>}</header>
          {notifications.length ? notifications.map((notification) => (
            <button
              key={notification.id}
              type="button"
              onClick={() => {
                setIsOpen(false)
                if (notification.kind === 'Invitation') {
                  supabase.rpc('mark_project_invitation_notification_read', { p_message_id: notification.message_id }).then(({ error }) => {
                    if (!error) setNotifications((current) => current.filter((item) => item.id !== notification.id))
                  })
                }
                onNavigate(notification.target)
              }}
            >
              <span className="notification-menu__avatar">{notification.kind === 'Message' ? getInitials(notification.title) : notification.kind[0]}</span>
              <span><strong>{notification.title}</strong><small>{notification.kind} · {notification.preview}</small></span>
              <time>{new Date(notification.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time>
            </button>
          )) : <p>No new messages.</p>}
        </div>
      )}
    </div>
  )
}

function FacultyHeader({
  activeTab,
  profile,
  onNavigate,
}) {
  const current =
    FACULTY_NAV.find(
      (item) =>
        item.id === activeTab
    )

  return (
    <header className="dashboard-header">
      <div>
        <span className="dashboard-header__eyebrow">
          Faculty workspace
        </span>

        <h1>
          {current?.label}
        </h1>
      </div>

      <div className="dashboard-header__actions">
        <MessageNotificationBell profile={profile} onNavigate={onNavigate} />

        <div className="student-identity">
          <span className="student-avatar">
            {getInitials(
              profile?.full_name
            )}
          </span>

          <span>
            <strong>
              {profile?.full_name ||
                'Faculty Member'}
            </strong>

            <small>
              {profile?.department ||
                'UAEU'}
              {' · Faculty'}
            </small>
          </span>
        </div>
      </div>
    </header>
  )
}

function Heading({
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

function Overview({
  projects,
  candidates,
  projectsLoading,
  projectsError,
  applicationsLoading,
  applicationsError,
  onNavigate,
  onViewProject,
}) {
  const [selectedStudentId, setSelectedStudentId] = useState(null)

  const openProjects =
    projects.filter(
      (project) =>
        project.visibility === 'public' &&
        getRemainingSlots(project) > 0
    ).length

  const pending =
    candidates.filter(
      (candidate) =>
        candidate.status === 'Submitted'
    ).length

  const projectCount = (count) => projectsLoading ? 'Loading…' : projectsError ? 'Unavailable' : count
  const applicationCount = (count) => applicationsLoading ? 'Loading…' : applicationsError ? 'Unavailable' : count

  return (
    <div className="dashboard-section">
      <section className="student-hero faculty-hero">
        <div>
          <span>
            Faculty Interface
          </span>

          <h2>
            Lead research. Discover talent.
          </h2>

          <p>
            Manage research postings,
            review applicants, track
            supervision capacity, and
            collaborate with students.
          </p>
        </div>

        <div
          className="hero-orbit"
          aria-hidden="true"
        >
          <GraduationCap size={42} />
        </div>
      </section>

      <div className="metric-grid faculty-metrics">
        <button className="metric-card-button" type="button" onClick={() => onNavigate('projects')}>
          <span className="metric-icon metric-icon--gold">
            <BriefcaseBusiness />
          </span>

          <div>
            <strong>
              {projectCount(openProjects)}
            </strong>

            <span>
              Open projects
            </span>
          </div>

          <small>
            {projectsLoading ? 'Loading research postings…' : projectsError || `${projects.length} total research postings`}
          </small>
        </button>

        <button className="metric-card-button" type="button" onClick={() => onNavigate('applications')}>
          <span className="metric-icon metric-icon--blue">
            <UsersRound />
          </span>

          <div>
            <strong>
              {applicationCount(pending)}
            </strong>

            <span>
              Applications to review
            </span>
          </div>

          <small>
            {applicationsError || 'Candidate decisions awaiting you'}
          </small>
        </button>

        <button className="metric-card-button" type="button" onClick={() => onNavigate('projects')}>
          <span className="metric-icon metric-icon--green">
            <Sparkles />
          </span>

          <div>
            <strong>
              Ready
            </strong>

            <span>
              Compatibility matching
            </span>
          </div>

          <small>
            Rank eligible students from each project
          </small>
        </button>
      </div>

      <section className="content-card">
        <Heading
          eyebrow="Application review"
          title="Recent applicants"
          action={
            <button
              className="text-button"
              type="button"
              onClick={() =>
                onNavigate(
                  'applications'
                )
              }
            >
              Review all
              <ChevronRight size={16} />
            </button>
          }
        />

        <div className="faculty-candidate-grid">
          {candidates.map(
            (candidate) => (
              <CandidateCard
                key={candidate.id}
                candidate={candidate}
                project={projects.find(
                  (project) =>
                    project.id ===
                    candidate.projectId
                )}
                onViewStudent={setSelectedStudentId}
                onViewProject={onViewProject}
              />
            )
          )}
        </div>
        <StudentProfileDialog
          studentId={selectedStudentId}
          onClose={() => setSelectedStudentId(null)}
        />
      </section>
    </div>
  )
}

/*
 * FACULTY PROFILE
 *
 * This section now reads from and writes to
 * public.profiles in Supabase.
 */
function FacultyProfile({
  profile,
  onProfileUpdate,
}) {
  const [editing, setEditing] =
    useState(false)

  const [draft, setDraft] =
    useState(
      createFacultyDraft(profile)
    )

  const [saving, setSaving] =
    useState(false)

  const [message, setMessage] =
    useState('')

  const [errorMessage, setErrorMessage] =
    useState('')

  /*
   * If the profile changes outside this component,
   * update the displayed form values.
   */
  useEffect(() => {
    setDraft(
      createFacultyDraft(profile)
    )
  }, [profile])

  function beginEditing() {
    setDraft(
      createFacultyDraft(profile)
    )

    setMessage('')
    setErrorMessage('')
    setEditing(true)
  }

  function cancelEditing() {
    setDraft(
      createFacultyDraft(profile)
    )

    setMessage('')
    setErrorMessage('')
    setEditing(false)
  }

  async function saveProfile() {
    setSaving(true)
    setMessage('')
    setErrorMessage('')

    try {
      /*
       * Check the currently logged-in Supabase user.
       * This also helps us verify that we are updating
       * the same profile that belongs to the session.
       */
      const {
        data: userData,
        error: userError,
      } =
        await supabase.auth.getUser()

      if (userError) {
        throw userError
      }

      const user =
        userData?.user

      if (!user) {
        throw new Error(
          'No authenticated user was found.'
        )
      }

      if (
        !profile?.id ||
        user.id !== profile.id
      ) {
        throw new Error(
          'The authenticated user does not match this faculty profile.'
        )
      }

      /*
       * Convert comma-separated strings back into arrays
       * before saving them to Supabase.
       */
      const researchInterests =
        draft.interests
          .split(',')
          .map((item) =>
            item.trim()
          )
          .filter(Boolean)

      const skills =
        draft.expertise
          .split(',')
          .map((item) =>
            item.trim()
          )
          .filter(Boolean)

      /*
       * Only update columns that we know already exist
       * in your profiles table.
       *
       * We intentionally do NOT send updated_at here.
       */
      const updates = {
        department: draft.department.trim(),
        research_experience:
          draft.bio.trim(),

        research_interests:
          researchInterests,

        skills,
      }

      console.log(
        'Updating faculty profile:',
        {
          userId: user.id,
          updates,
        }
      )

      const {
        data,
        error,
      } =
        await supabase
          .from('profiles')
          .update(updates)
          .eq('id', user.id)
          .select('*')
          .single()

      if (error) {
        console.error(
          'Faculty profile Supabase error:',
          error
        )

        throw error
      }

      if (!data) {
        throw new Error(
          'Supabase returned no updated profile.'
        )
      }

      console.log(
        'Faculty profile saved successfully:',
        data
      )

      /*
       * Immediately update the FacultyDashboard's
       * copy of the profile.
       */
      onProfileUpdate(data)

      setDraft(
        createFacultyDraft(data)
      )

      setEditing(false)

      setMessage(
        'Profile saved successfully.'
      )
    } catch (error) {
      console.error(
        'Faculty profile update error:',
        error
      )

      setErrorMessage(
        error?.message ||
          'Could not save the faculty profile.'
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="dashboard-section faculty-profile-layout">
      <section className="content-card">
        <Heading
          eyebrow="Academic identity"
          title="Research profile"
          action={
            editing ? (
              <div className="edit-actions">
                <button
                  className="outline-button"
                  type="button"
                  disabled={saving}
                  onClick={
                    cancelEditing
                  }
                >
                  Cancel
                </button>

                <button
                  className="save-button"
                  type="button"
                  disabled={saving}
                  onClick={
                    saveProfile
                  }
                >
                  <Check size={15} />

                  {saving
                    ? 'Saving...'
                    : 'Save'}
                </button>
              </div>
            ) : (
              <button
                className="outline-button"
                type="button"
                onClick={
                  beginEditing
                }
              >
                <Pencil size={14} />
                Edit profile
              </button>
            )
          }
        />

        {message && (
          <p role="status">
            {message}
          </p>
        )}

        {errorMessage && (
          <p role="alert">
            {errorMessage}
          </p>
        )}

        <div className="faculty-profile-summary">
          <span>
            {getInitials(
              profile?.full_name
            )}
          </span>

          <div>
            <h3>
              {profile?.full_name ||
                'Faculty Member'}
            </h3>

            <p>
              {profile?.department ||
                'Department not specified'}
              {' · Faculty'}
            </p>

            <small>
              United Arab Emirates University
            </small>
          </div>
        </div>

        {editing && !saving && <OrcidImport draft={draft} onApply={(record, selected) => {
          setDraft(current => applyOrcidSelection(current, record, selected))
          setMessage('ORCID information added to the form. Review it, then click Save.')
          setErrorMessage('')
        }} />}

        <h4 className="faculty-profile-section-title">Academic details</h4>
        <div className="faculty-profile-fields faculty-profile-fields--academic">
          <label>
            UAEU email
            <input value={profile?.email || ''} readOnly />
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
              value={draft.department}
              readOnly={!editing || saving}
              onChange={(event) => setDraft({ ...draft, department: event.target.value })}
            />
          </label>
        </div>

        <h4 className="faculty-profile-section-title">Research background</h4>
        <div className="faculty-profile-fields">
          <label>
            Research biography

            <textarea
              value={draft.bio}
              readOnly={!editing || saving}
              onChange={(event) =>
                setDraft({
                  ...draft,
                  bio:
                    event.target.value,
                })
              }
              placeholder="Describe your research background and experience."
            />
          </label>

          <label>
            Research interests

            <textarea
              value={
                draft.interests
              }
              readOnly={!editing || saving}
              onChange={(event) =>
                setDraft({
                  ...draft,
                  interests:
                    event.target.value,
                })
              }
              placeholder="Artificial Intelligence, NLP, Recommender Systems"
            />
          </label>

          <label>
            Areas of expertise

            <textarea
              value={
                draft.expertise
              }
              readOnly={!editing || saving}
              onChange={(event) =>
                setDraft({
                  ...draft,
                  expertise:
                    event.target.value,
                })
              }
              placeholder="Python, Machine Learning, Data Science"
            />
          </label>
        </div>

        <small>
          Separate research interests and
          expertise with commas.
        </small>
      </section>

      <aside className="content-card faculty-capacity">
        <Heading
          eyebrow="Supervision"
          title="Current capacity"
        />

        <div className="capacity-ring">
          <strong>
            0/10
          </strong>

          <span>
            Students supervised
          </span>
        </div>

        <div className="capacity-row">
          <span>
            Active projects
          </span>

          <strong>
            0
          </strong>
        </div>

        <div className="capacity-row">
          <span>
            Available spaces
          </span>

          <strong>
            10
          </strong>
        </div>

        <p>
          Supervision statistics will be
          connected to project data later.
        </p>
      </aside>
    </div>
  )
}

function FacultyProjects({
  profile,
  projects,
  applications,
  loading,
  error,
  onProjectsChanged,
  selectedProjectId,
  onProjectOpened,
  onStudentRemoved,
}) {
  const [showForm, setShowForm] =
    useState(false)

  const [editingProjectId, setEditingProjectId] =
    useState(null)

  const [draft, setDraft] = useState({
    title: '',
    program: 'SGP',
    department: '',
    deadline: '',
    description: '',
    skills: '',
    visibility: 'draft',
    student_capacity: '1',
    student_payment_aed: '',
    minimum_gpa: '',
  })

  const [isSaving, setIsSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [formSuccess, setFormSuccess] = useState('')
  const [rankingProject, setRankingProject] = useState(null)
  const [rankedStudents, setRankedStudents] = useState([])
  const [studentRankingQuery, setStudentRankingQuery] = useState('')
  const [selectedStudentIds, setSelectedStudentIds] = useState([])
  const [rankingLoading, setRankingLoading] = useState(false)
  const [rankingNotice, setRankingNotice] = useState('')
  const [inviteNotice, setInviteNotice] = useState('')
  const [selectedProject, setSelectedProject] = useState(null)
  const [groupChatNotice, setGroupChatNotice] = useState('')
  const [creatingGroupChat, setCreatingGroupChat] = useState(false)

  const normalizedRankingQuery = studentRankingQuery.trim().toLowerCase()
  const filteredRankedStudents = rankedStudents
    .map((student, index) => {
      const isRegistered = applications.some((application) =>
        application.opportunity_id === rankingProject?.id &&
        application.student_id === student.student_id &&
        application.status !== 'Rejected'
      )
      const invitationStatus = isRegistered || student.invitation_status === 'Accepted'
        ? 'Accepted'
        : student.invitation_status ? 'Pending' : 'Not invited'
      return { student: { ...student, invitation_status: invitationStatus }, rank: index + 1 }
    })
    .filter(({ student }) =>
      [student.full_name, student.university_id].some((value) =>
        String(value ?? '').toLowerCase().includes(normalizedRankingQuery)
      )
    )

  function createEmptyDraft() {
    return {
      title: '',
      program: 'SGP',
      department: '',
      deadline: '',
      description: '',
      skills: '',
      visibility: 'draft',
      student_capacity: '1',
      student_payment_aed: '',
      minimum_gpa: '',
    }
  }

  function closeForm() {
    setShowForm(false)
    setEditingProjectId(null)
    setFormError('')
  }

  function startCreatingProject() {
    setDraft(createEmptyDraft())
    setEditingProjectId(null)
    setFormError('')
    setFormSuccess('')
    setShowForm(true)
  }

  function startEditingProject(project) {
    setDraft({
      title: project.title || '',
      program: project.type || 'SGP',
      department: project.department || '',
      deadline: project.deadline || '',
      description: project.description || '',
      skills: Array.isArray(project.tags)
        ? project.tags.join(', ')
        : '',
      visibility: project.visibility || 'draft',
      student_capacity: String(project.student_capacity || 1),
      student_payment_aed:
        project.student_payment_aed === null ||
        project.student_payment_aed === undefined
          ? ''
          : String(project.student_payment_aed),
      minimum_gpa:
        project.minimum_gpa === null ||
        project.minimum_gpa === undefined
          ? ''
          : String(project.minimum_gpa),
    })
    setEditingProjectId(project.id)
    setFormError('')
    setFormSuccess('')
    setShowForm(true)
  }

  useEffect(() => {
    if (!selectedProjectId) return

    const project = projects.find((item) => item.id === selectedProjectId)
    if (!project) return

    setSelectedProject(project)
    onProjectOpened?.()
  }, [selectedProjectId, projects])

  async function saveProject(event) {
    event.preventDefault()
    setFormError('')
    setFormSuccess('')

    if (!profile?.id) {
      setFormError('Your faculty profile could not be identified.')
      return
    }

    const studentCapacity = Number(draft.student_capacity)
    const payment =
      draft.student_payment_aed === ''
        ? null
        : Number(draft.student_payment_aed)
    const minimumGpa =
      draft.minimum_gpa === ''
        ? null
        : Number(draft.minimum_gpa)

    if (!Number.isInteger(studentCapacity) || studentCapacity < 1) {
      setFormError('Number of students needed must be a whole number of at least 1.')
      return
    }

    if (payment !== null && (!Number.isFinite(payment) || payment < 0)) {
      setFormError('Student payment must be a non-negative amount in AED.')
      return
    }

    if (minimumGpa !== null && (!Number.isFinite(minimumGpa) || minimumGpa < 0 || minimumGpa > 4)) {
      setFormError('Minimum GPA must be a number from 0.00 to 4.00.')
      return
    }

    const projectPayload = {
      owner_id: profile.id,
      title: draft.title.trim(),
      type: draft.program,
      department: draft.department.trim(),
      description: draft.description.trim(),
      tags: splitProjectList(draft.skills),
      requirements: splitProjectList(draft.skills),
      supervisor: profile.full_name || 'Faculty member',
      deadline: draft.deadline || null,
      visibility: draft.visibility,
      student_capacity: studentCapacity,
      student_payment_aed: payment,
      minimum_gpa: minimumGpa,
    }

    setIsSaving(true)

    const request = editingProjectId
      ? supabase
          .from('research_opportunities')
          .update(projectPayload)
          .eq('id', editingProjectId)
          .select('id')
          .single()
      : supabase
          .from('research_opportunities')
          .insert(projectPayload)
          .select('id')
          .single()

    const { error: saveError } = await request
    setIsSaving(false)

    if (saveError) {
      console.error('Project save error:', saveError.message)
      setFormError(saveError.message || 'Could not save the project. Please try again.')
      return
    }

    await onProjectsChanged()
    setFormSuccess(
      editingProjectId
        ? 'Project updated successfully.'
        : draft.visibility === 'public'
          ? 'Project published and open for student applications.'
          : 'Project saved as a private draft.'
    )
    setDraft(createEmptyDraft())
    setEditingProjectId(null)
    setShowForm(false)
  }

  async function deleteProject(project) {
    if (!window.confirm(`Remove “${project.title}”? This cannot be undone.`)) {
      return false
    }

    setFormError('')
    setFormSuccess('')

    const { error: deleteError } = await supabase
      .from('research_opportunities')
      .delete()
      .eq('id', project.id)

    if (deleteError) {
      console.error('Project delete error:', deleteError.message)
      setFormError(deleteError.message || 'Could not remove the project.')
      return false
    }

    await onProjectsChanged()
    setFormSuccess('Project removed.')
    return true
  }

  async function createProjectGroupChat(project) {
    setCreatingGroupChat(true)
    setGroupChatNotice('')
    const { error: groupError } = await supabase.rpc('create_project_group_chat', {
      p_opportunity_id: project.id,
    })
    setCreatingGroupChat(false)

    if (groupError) {
      setGroupChatNotice(groupError.message || 'Could not create the project group chat.')
      return
    }
    setGroupChatNotice('Group chat created. Accepted students have been invited.')
  }

  async function openStudentRanking(project) {
    if (rankingProject?.id !== project.id) setStudentRankingQuery('')
    setRankingProject(project)
    setRankedStudents([])
    setSelectedStudentIds([])
    setInviteNotice('')
    setRankingNotice('')
    setRankingLoading(true)

    let { data, error: rankingError } = await supabase
      .rpc('get_match_candidates_for_project', {
        p_opportunity_id: project.id,
      })

    // Existing installations can still open the pre-matching ranking while
    // the new SQL migration is being applied. Its result is scored by the
    // same shared matching helper once available.
    if (rankingError) {
      const fallback = await supabase
        .rpc('get_ranked_students_for_project', {
          p_opportunity_id: project.id,
        })
      data = fallback.data
      rankingError = fallback.error
    }

    if (rankingError) {
      console.error('Student ranking error:', rankingError.message)
      setInviteNotice('Could not load the student ranking. Run the matching database migration first.')
    } else {
      const ranking = await rankStudentsForProject(project, data || [])
      setRankedStudents(ranking.students)
      setRankingNotice(ranking.notice)
    }
    setRankingLoading(false)
  }

  function toggleStudent(student) {
    if (!student?.is_eligible || student.invitation_status === 'Accepted') return
    const studentId = student.student_id
    setSelectedStudentIds((current) =>
      current.includes(studentId)
        ? current.filter((id) => id !== studentId)
        : [...current, studentId]
    )
  }

  async function sendInvitations() {
    if (!rankingProject || !selectedStudentIds.length) return
    setInviteNotice('')

    const { error: inviteError } = await supabase
      .rpc('invite_ranked_students', {
        p_opportunity_id: rankingProject.id,
        p_student_ids: selectedStudentIds,
      })

    if (inviteError) {
      console.error('Project invitation error:', inviteError.message)
      setInviteNotice('Could not send the invitations.')
      return
    }

    await openStudentRanking(rankingProject)
    setInviteNotice(`${selectedStudentIds.length} invitation${selectedStudentIds.length === 1 ? '' : 's'} sent.`)
  }

  const projectForm = (showForm && (
          <form
            className="faculty-project-form"
            onSubmit={saveProject}
          >
            <label>
              Project title

              <input
                value={draft.title}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    title: event.target.value,
                  })
                }
                required
              />
            </label>

            <label>
              Program

              <select
                value={draft.program}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    program: event.target.value,
                  })
                }
              >
                <option>
                  SGP
                </option>

                <option>
                  SURE+
                </option>

                <option>
                  Research Assistant
                </option>
              </select>
            </label>

            <label>
              Department

              <input
                value={draft.department}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    department: event.target.value,
                  })
                }
                placeholder="Computer Science"
                required
              />
            </label>

            <label>
              Application deadline

              <input
                type="date"
                value={draft.deadline}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    deadline: event.target.value,
                  })
                }
                required
              />
            </label>

            <label>
              Required skills

              <input
                value={draft.skills}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    skills: event.target.value,
                  })
                }
                placeholder="Python, NLP, Machine Learning"
                required
              />
            </label>

            <label>
              Number of students needed

              <input
                type="number"
                value={draft.student_capacity}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    student_capacity: event.target.value,
                  })
                }
                min="1"
                step="1"
                required
              />

              <small>Set the total number of places for student applicants.</small>
            </label>

            <label>
              Student payment (AED)

              <input
                type="number"
                value={draft.student_payment_aed}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    student_payment_aed: event.target.value,
                  })
                }
                min="0"
                step="0.01"
                inputMode="decimal"
                placeholder="Optional"
              />

              <small>Leave blank when the project is unpaid or funding is not stated.</small>
            </label>

            <label>
              Minimum GPA

              <input
                type="number"
                value={draft.minimum_gpa}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    minimum_gpa: event.target.value,
                  })
                }
                min="0"
                max="4"
                step="0.01"
                inputMode="decimal"
                placeholder="Optional"
              />

              <small>Optional hard rule. Students below this GPA cannot apply or be invited.</small>
            </label>

            <label>
              Project visibility

              <select
                value={draft.visibility}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    visibility: event.target.value,
                  })
                }
                required
              >
                <option value="draft">Private</option>
                <option value="public">Public / Open for applications</option>
              </select>

              <small>
                Private projects are visible to you and invited students. Public projects appear to eligible students and accept applications.
              </small>
            </label>

            <label className="faculty-project-form__wide">
              Description

              <textarea
                value={draft.description}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    description: event.target.value,
                  })
                }
                minLength={20}
                required
              />
            </label>

            {formError && (
              <p className="faculty-project-form__feedback is-error" role="alert">
                {formError}
              </p>
            )}

            {formSuccess && (
              <p className="faculty-project-form__feedback is-success" role="status">
                {formSuccess}
              </p>
            )}

            <div className="faculty-project-form__actions">
              <button
                className="primary-dashboard-button"
                type="submit"
                disabled={isSaving}
              >
                {isSaving
                  ? 'Saving…'
                  : editingProjectId
                    ? 'Save project changes'
                    : draft.visibility === 'public'
                      ? 'Publish project'
                      : 'Save private draft'}
              </button>
            </div>
          </form>
        ))
  const rankingPanel = (rankingProject && (
          <section className="faculty-ranking-panel">
            <Heading
              eyebrow="Pre-publication invitations"
              title={`Students ranked by compatibility for ${rankingProject.title}`}
              action={<button className="text-button" type="button" onClick={() => setRankingProject(null)}>Close</button>}
            />
            <p className="faculty-ranking-note">{rankingNotice || 'This ranking combines research-topic relevance, skills, major fit, GPA, and experience. The score supports—not replaces—faculty judgement.'}</p>
            <label className="dashboard-search faculty-ranking-search">
              <Search size={18} aria-hidden="true" />
              <input
                type="search"
                value={studentRankingQuery}
                onChange={(event) => setStudentRankingQuery(event.target.value)}
                placeholder="Search students by name or ID"
                aria-label="Search ranked students by name or university ID"
              />
            </label>
            {!rankingLoading && rankedStudents.length > 0 && (
              <p className="faculty-ranking-note" role="status">
                Showing {filteredRankedStudents.length} of {rankedStudents.length} students · {selectedStudentIds.length} selected
              </p>
            )}
            {rankingLoading ? <p>Loading students...</p> : !rankedStudents.length ? <p>No active student profiles are available yet.</p> : !filteredRankedStudents.length ? <p>No students match your search. Try another name or ID.</p> : (
              <div className="faculty-ranking-list">
                {filteredRankedStudents.map(({ student, rank }) => (
                  <label className="faculty-ranking-row" key={student.student_id}>
                    <input type="checkbox" checked={selectedStudentIds.includes(student.student_id)} onChange={() => toggleStudent(student)} disabled={!student.is_eligible || student.invitation_status === 'Accepted'} />
                    <strong>#{rank}</strong>
                    <span className="candidate-avatar">{getInitials(student.full_name)}</span>
                    <span><b>{student.full_name || 'Student'}</b><small>{student.major || student.department || 'Academic details not provided'}</small>{student.match_reasons?.length > 0 && <small className="faculty-ranking-reasons">{student.match_reasons.join(' · ')}</small>}</span>
                    <em>{student.is_eligible ? `${student.match_score ?? '—'}% match` : 'Not eligible'}</em>
                    <small className={`faculty-invitation-status ${student.invitation_status === 'Accepted' ? 'is-accepted' : student.invitation_status === 'Pending' ? 'is-pending' : ''}`}>{student.invitation_status}</small>
                  </label>
                ))}
              </div>
            )}
            {inviteNotice && <p className="faculty-project-form__feedback is-success">{inviteNotice}</p>}
            <button className="primary-dashboard-button" type="button" disabled={!selectedStudentIds.length || rankingLoading} onClick={sendInvitations}>Invite selected students</button>
          </section>
        ))

  if (selectedProject) {
    return (
      <ProjectDetails
        project={projects.find((project) => project.id === selectedProject.id) || selectedProject}
        applications={applications}
        onStudentRemoved={onStudentRemoved}
        onBack={() => { setSelectedProject(null); closeForm(); setRankingProject(null) }}
        onEdit={() => {
          setRankingProject(null)
          startEditingProject(projects.find((p) => p.id === selectedProject.id) || selectedProject)
        }}
        onRank={() => {
          closeForm()
          openStudentRanking(projects.find((p) => p.id === selectedProject.id) || selectedProject)
        }}
        onRemove={async () => {
          if (await deleteProject(selectedProject)) setSelectedProject(null)
        }}
        onCreateGroup={() => createProjectGroupChat(selectedProject)}
        creatingGroup={creatingGroupChat}
        groupNotice={groupChatNotice}
        managementPanel={<>{showForm && <button className="text-button" type="button" onClick={closeForm}>Cancel editing</button>}{projectForm}{rankingPanel}{formSuccess && !showForm && <p role="status">{formSuccess}</p>}</>}
      />
    )
  }

  return (
    <div className="dashboard-section">
      <section className="content-card">
        <Heading
          eyebrow="Research portfolio"
          title="My research projects"
          action={
            <button
              className="primary-dashboard-button faculty-create-button"
              type="button"
              onClick={() => (showForm ? closeForm() : startCreatingProject())}
            >
              {showForm ? (
                <>
                  <X size={15} />
                  Close form
                </>
              ) : (
                <>
                  <Plus size={15} />
                  Create project
                </>
              )}
            </button>
          }
        />

        {projectForm}

        {formError && !showForm && (
          <p className="faculty-project-form__feedback is-error" role="alert">
            {formError}
          </p>
        )}

        {formSuccess && !showForm && (
          <p className="faculty-project-form__feedback is-success" role="status">
            {formSuccess}
          </p>
        )}

        <div className="faculty-project-grid">
          {loading && <p>Loading your research projects…</p>}

          {!loading && error && <p className="faculty-project-form__feedback is-error">{error}</p>}

          {!loading && !error && !projects.length && (
            <div className="empty-state">
              <BriefcaseBusiness size={30} />
              <h3>No projects yet</h3>
              <p>Create a private draft now, then publish it when it is ready for students.</p>
            </div>
          )}

          {!loading && !error && projects.map(
            (project) => (
              <article
                className="faculty-project-card"
                key={project.id}
                onClick={() => setSelectedProject(project)}
              >
                <div>
                  <span className="project-id">
                    {`PRJ-${String(project.id).slice(0, 8)}`}
                    {' · '}
                    {project.type}
                  </span>

                  <em
                    className={`faculty-project-status faculty-project-status--${
                      project.visibility === 'draft'
                        ? 'draft'
                        : getRemainingSlots(project) === 0
                          ? 'full'
                          : 'open'
                    }`}
                  >
                    {project.visibility === 'draft'
                      ? 'Private'
                      : getRemainingSlots(project) === 0
                        ? 'Full'
                        : 'Public / Open'}
                  </em>
                </div>

                <h3>
                  {project.title}
                </h3>

                <p>
                  {project.description}
                </p>

                <div className="tag-list">
                  {(Array.isArray(project.tags) ? project.tags : []).map(
                    (skill) => (
                      <span
                        key={skill}
                      >
                        {skill}
                      </span>
                    )
                  )}
                </div>

                <footer>
                  <span>
                    <UsersRound
                      size={16}
                    />

                    {getRemainingSlotsLabel(project)}
                  </span>

                  <button className="text-button" type="button" onClick={(event) => { event.stopPropagation(); setSelectedProject(project) }}>Open project <ChevronRight size={14} /></button>
                </footer>

                {project.student_payment_aed !== null &&
                  project.student_payment_aed !== undefined && (
                    <small className="faculty-project-payment">
                      Student stipend: AED {formatStudentPayment(project.student_payment_aed)}
                    </small>
                  )}
              </article>
            )
          )}
        </div>


      </section>
    </div>
  )
}

function ProjectDetails({ project, applications, onBack, onEdit, onRank, onRemove, onCreateGroup, creatingGroup, groupNotice, managementPanel, onStudentRemoved }) {
  const [selectedStudentId, setSelectedStudentId] = useState(null)
  const [removingStudentId, setRemovingStudentId] = useState(null)
  const [studentRemovalError, setStudentRemovalError] = useState('')
  const [studentRemovalNotice, setStudentRemovalNotice] = useState('')
  async function removeStudent(application) {
    if (removingStudentId) return
    setRemovingStudentId(application.student_id)
    setStudentRemovalError('')
    setStudentRemovalNotice('')
    const { error } = await supabase.rpc('remove_project_student', {
      p_opportunity_id: String(project.id),
      p_student_id: application.student_id,
    })
    if (error) {
      setStudentRemovalError(error.message || 'Could not remove this student.')
    } else {
      await onStudentRemoved?.()
      setStudentRemovalNotice(`${application.student_name || 'Student'} removed. Their place is available again.`)
    }
    setRemovingStudentId(null)
  }
  const registeredStudents = applications.filter(
    (application) => application.opportunity_id === project.id && application.status !== 'Rejected'
  )
  const status = project.visibility === 'draft'
    ? 'Private'
    : getRemainingSlots(project) === 0
      ? 'Full'
      : 'Public / Open'

  return (
    <div className="dashboard-section">
      <section className="content-card project-details-page">
        <Heading
          eyebrow="Project details"
          title={project.title || 'Research project'}
          action={<button className="text-button" type="button" onClick={onBack}>Back to projects</button>}
        />

        <div className="project-details-page__meta">
          <span>{`PRJ-${String(project.id).slice(0, 8)}`}</span>
          <span>{project.type || 'Research project'}</span>
          <strong>{status}</strong>
        </div>

        <div className="project-details-page__content">
          <div>
            <h3>About this project</h3>
            <p>{project.description || 'No project description has been provided.'}</p>

            <h3>Required skills</h3>
            <div className="tag-list">
              {(Array.isArray(project.tags) ? project.tags : []).length ? (
                project.tags.map((skill) => <span key={skill}>{skill}</span>)
              ) : <span>No skills listed</span>}
            </div>

            <FacultyMilestones projectId={project.id} />

            <h3>Registered students</h3>
            {studentRemovalError && <p role="alert" className="faculty-project-form__feedback is-error">{studentRemovalError}</p>}
            {studentRemovalNotice && <p role="status" className="faculty-project-form__feedback is-success">{studentRemovalNotice}</p>}
            {registeredStudents.length ? (
              <div className="project-student-list">
                {registeredStudents.map((application) => (
                  <div key={application.id}>
                    <button type="button" onClick={() => setSelectedStudentId(application.student_id)}>
                      {application.student_name || 'Student applicant'}
                    </button>
                    <span>{application.student_major || application.student_department || 'Academic details not provided'}</span>
                    <em>{application.status || 'Submitted'}</em>
                    <button className="project-student-remove" type="button" disabled={Boolean(removingStudentId)} aria-label={`Remove ${application.student_name || 'student'} from this project`} onClick={() => removeStudent(application)}>
                      <Trash2 size={14} aria-hidden="true" />{removingStudentId === application.student_id ? 'Removing...' : 'Remove'}
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="project-student-list__empty">No students have registered for this project yet.</p>
            )}
          </div>

          <aside>
            <div><small>Department</small><strong>{project.department || 'Not set'}</strong></div>
            <div><small>Application deadline</small><strong>{project.deadline || 'Not set'}</strong></div>
            {project.minimum_gpa !== null && project.minimum_gpa !== undefined && (
              <div><small>Minimum GPA</small><strong>{project.minimum_gpa}</strong></div>
            )}
            <div><small>Student places</small><strong>{getRemainingSlotsLabel(project)}</strong></div>
            {project.student_payment_aed !== null && project.student_payment_aed !== undefined && (
              <div><small>Student stipend</small><strong>AED {formatStudentPayment(project.student_payment_aed)}</strong></div>
            )}
          </aside>
        </div>

        <footer className="project-details-page__actions">
          <button className="text-button" type="button" onClick={onEdit}><Pencil size={14} /> Edit project</button>
          <button className="text-button" type="button" onClick={onRank}><UsersRound size={14} /> Invite</button>
          <button className="text-button" type="button" disabled={creatingGroup} onClick={onCreateGroup}><MessageSquare size={14} /> {creatingGroup ? 'Creating group…' : 'Create group chat'}</button>
          <button className="delete-project-button" type="button" onClick={onRemove}><Trash2 size={14} /> Remove</button>
        </footer>
        {managementPanel}
        {groupNotice && <p className="faculty-project-form__feedback is-success">{groupNotice}</p>}
        <StudentProfileDialog
          studentId={selectedStudentId}
          onClose={() => setSelectedStudentId(null)}
        />
      </section>
    </div>
  )
}

function FacultyMilestones({ projectId }) {
  const [milestones, setMilestones] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [editing, setEditing] = useState(null)
  const [draft, setDraft] = useState(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError('')
    setDraft(null)
    async function load() {
      const { data, error: loadError } = await supabase.from('project_milestones').select('*').eq('opportunity_id', String(projectId)).order('due_date', { ascending: true, nullsFirst: false }).order('created_at')
      if (cancelled) return
      if (loadError) setError(loadError.message)
      else setMilestones(data || [])
      setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [projectId])

  async function save(event) {
    event.preventDefault()
    if (saving) return
    if (!draft.title.trim()) { setError('Enter a milestone title.'); return }
    setSaving(true)
    setError('')
    const payload = {
      opportunity_id: String(projectId), title: draft.title.trim(), description: draft.description.trim() || null,
      due_date: draft.due_date || null, status: draft.status,
      completed_at: draft.status === 'Completed' ? (editing?.completed_at || new Date().toISOString()) : null,
      updated_at: new Date().toISOString(),
    }
    const request = editing
      ? supabase.from('project_milestones').update(payload).eq('id', editing.id).eq('opportunity_id', String(projectId))
      : supabase.from('project_milestones').insert(payload)
    const { data, error: saveError } = await request.select('*').single()
    if (saveError) setError(saveError.message)
    else {
      setMilestones((items) => editing ? items.map((item) => item.id === editing.id ? data : item) : [...items, data])
      setDraft(null)
      setEditing(null)
    }
    setSaving(false)
  }

  async function remove(item) {
    if (saving || !window.confirm(`Delete milestone “${item.title}”?`)) return
    setSaving(true)
    setError('')
    const { error: deleteError } = await supabase.from('project_milestones').delete().eq('id', item.id).eq('opportunity_id', String(projectId)).select('id').single()
    if (deleteError) setError(deleteError.message)
    else {
      setMilestones((items) => items.filter((entry) => entry.id !== item.id))
      if (editing?.id === item.id) { setDraft(null); setEditing(null) }
    }
    setSaving(false)
  }

  return <section className="faculty-milestones">
    <div className="faculty-milestones-heading"><h3>Milestones</h3><button className="text-button" type="button" disabled={saving || loading} onClick={() => { setEditing(null); setError(''); setDraft({ title: '', description: '', due_date: '', status: 'Pending' }) }}><Plus size={15} /> Add milestone</button></div>
    {error && <p role="alert">{error}</p>}
    {draft && <form className="faculty-project-form" onSubmit={save}>
      <label>Title<input required value={draft.title} disabled={saving} onChange={(event) => setDraft({ ...draft, title: event.target.value })} /></label>
      <label>Description<textarea value={draft.description} disabled={saving} onChange={(event) => setDraft({ ...draft, description: event.target.value })} /></label>
      <label>Due date<input type="date" value={draft.due_date} disabled={saving} onChange={(event) => setDraft({ ...draft, due_date: event.target.value })} /></label>
      <label>Status<select value={draft.status} disabled={saving} onChange={(event) => setDraft({ ...draft, status: event.target.value })}>{['Pending', 'In Progress', 'Completed'].map((status) => <option key={status}>{status}</option>)}</select></label>
      <div className="faculty-project-form__actions"><button className="primary-dashboard-button" type="submit" disabled={saving}>{saving ? 'Saving…' : editing ? 'Save changes' : 'Add milestone'}</button><button className="text-button" type="button" disabled={saving} onClick={() => { setDraft(null); setEditing(null); setError('') }}>Cancel</button></div>
    </form>}
    {loading ? <p role="status">Loading milestones…</p> : !milestones.length ? <p>No milestones recorded for this project.</p> : <div className="faculty-milestone-list">{[...milestones].sort((a, b) => (a.due_date || '9999').localeCompare(b.due_date || '9999') || a.created_at.localeCompare(b.created_at)).map((item) => <article key={item.id}>
      <div><strong>{item.title}</strong><small>{item.due_date ? `Due ${item.due_date}` : 'No due date'} · {item.status}</small>{item.description && <p>{item.description}</p>}</div>
      <div className="faculty-project-actions"><button className="text-button" type="button" disabled={saving} onClick={() => { setEditing(item); setError(''); setDraft({ title: item.title, description: item.description || '', due_date: item.due_date || '', status: item.status }) }}><Pencil size={14} /> Edit</button><button className="delete-project-button" type="button" disabled={saving} onClick={() => remove(item)}><Trash2 size={14} /> Delete</button></div>
    </article>)}</div>}
  </section>
}

function CandidateCard({
  application,
  candidate,
  project,
  onReview,
  isReviewing,
  onViewStudent,
  onViewProject,
}) {
  // Overview still uses the existing candidate summary shape, while the
  // Applications tab supplies a real database application.  Supporting both
  // preserves the overview and lets the Applications tab show live data.
  const entry = application || candidate

  if (!entry) return null

  const studentName = entry.student_name || entry.name || 'Student applicant'
  const isSubmitted = Boolean(application) && entry.status === 'Submitted'
  const appliedDate = entry.created_at
    ? `Applied ${new Date(entry.created_at).toLocaleDateString()}`
    : `GPA ${entry.gpa || 'Not provided'} · ${entry.status || 'Pending'}`

  return (
    <article className="candidate-card">
      <div className="candidate-card__top">
        <span className="candidate-avatar">
          {getInitials(studentName)}
        </span>

        <span className={`candidate-match candidate-match--${(entry.status || 'Pending').toLowerCase().replace(/\s+/g, '-')}`}>
          <Sparkles size={14} />
          {entry.status || 'Pending'}
        </span>
      </div>

      <h3><button className="candidate-name-button" type="button" onClick={() => onViewStudent?.(entry.student_id)}>{studentName}</button></h3>

      <p>
        {entry.project_title || project?.title ? onViewProject ? (
          <button
            className="candidate-project-button"
            type="button"
            onClick={() => onViewProject?.(entry.opportunity_id || entry.projectId)}
          >
            {entry.project_title || project?.title}
          </button>
        ) : (entry.project_title || project?.title) : 'Project not specified'}
        {(entry.student_major || entry.student_department) && (
          <><br />{entry.student_major || entry.student_department}</>
        )}
        {entry.student_email && (
          <><br />{entry.student_email}</>
        )}
      </p>

      <footer>
        <span>
          {appliedDate}
        </span>
      </footer>

      {entry.student_id && (
        <button
          className="candidate-view-profile"
          type="button"
          onClick={() => onViewStudent?.(entry.student_id)}
        >
          View student profile
        </button>
      )}

      {isSubmitted && (
        <div className="candidate-quick-actions">
          <button
            className="candidate-accept"
            type="button"
            disabled={isReviewing}
            onClick={() => onReview(entry.id, 'Accepted')}
          >
            <Check size={14} />
            Accept
          </button>

          <button
            className="candidate-reject"
            type="button"
            disabled={isReviewing}
            onClick={() => onReview(entry.id, 'Rejected')}
          >
            <X size={14} />
            Reject
          </button>
        </div>
      )}
    </article>
  )
}

function StudentProfileDialog({ studentId, onClose }) {
  const [student, setStudent] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!studentId) return
    supabase.rpc('get_student_profile_for_faculty', { p_student_id: studentId }).then(({ data, error: loadError }) => {
      if (loadError) setError(loadError.message || 'Could not load this student profile.')
      else setStudent(data)
    })
  }, [studentId])

  if (!studentId) return null
  return <div className="faculty-modal-backdrop" onClick={onClose}><section className="candidate-modal" role="dialog" aria-modal="true" aria-label="Student profile" onClick={(event) => event.stopPropagation()}><button className="candidate-modal__close" type="button" onClick={onClose}><X size={18} /></button>{error ? <p className="faculty-modal-message">{error}</p> : !student ? <p className="faculty-modal-message">Loading student profile…</p> : <><header><span className="candidate-avatar candidate-avatar--large">{getInitials(student.full_name)}</span><div><span>Student profile</span><h2>{student.full_name}</h2><p>{student.headline || student.major || 'UAEU student researcher'}</p></div></header><div className="candidate-modal__body"><div><h3>Academic details</h3><p><strong>Major:</strong> {student.major || 'Not set'}<br /><strong>Department:</strong> {student.department || 'Not set'}<br /><strong>Year of study:</strong> {student.year_of_study || 'Not set'}<br /><strong>GPA:</strong> {student.gpa ?? 'Not set'}</p><h3>About</h3><p>{student.bio || 'No biography provided.'}</p></div><aside><div><small>Skills</small><strong>{Array.isArray(student.skills) && student.skills.length ? student.skills.join(', ') : 'Not set'}</strong></div><div><small>Research interests</small><strong>{Array.isArray(student.research_interests) && student.research_interests.length ? student.research_interests.join(', ') : 'Not set'}</strong></div></aside></div></>}</section></div>
}

function FacultyApplications({
  applications,
  loading,
  error,
  reviewingApplicationIds,
  reviewNotice,
  onReview,
}) {
  const [query, setQuery] =
    useState('')
  const [selectedStudentId, setSelectedStudentId] = useState(null)
  const [selectedProject, setSelectedProject] = useState('')
  const [selectedStatus, setSelectedStatus] = useState('')
  const projectNames = [...new Set(applications.map((application) => application.project_title).filter(Boolean))]
    .sort((first, second) => first.localeCompare(second))

  const visible =
    applications.filter(
      (application) =>
        (!selectedProject || application.project_title === selectedProject) &&
        (!selectedStatus || application.status === selectedStatus) &&
        `${application.student_name || ''} ${application.student_email || ''} ${application.project_title || ''}`
          .toLowerCase()
          .includes(
            query.toLowerCase()
          )
    )

  return (
    <div className="dashboard-section">
      <section className="content-card">
        <Heading
          eyebrow="Candidate review"
          title="Student applications"
          action={
            <span className="count-pill">
              {visible.length}{' '}
              applications
            </span>
          }
        />

        <div className="faculty-application-filters">
        <label className="dashboard-search">
          <Search size={18} />

          <input
            value={query}
            onChange={(event) =>
              setQuery(
                event.target.value
              )
            }
            placeholder="Search students or projects"
            aria-label="Search students or projects"
          />
        </label>
        <label className="faculty-application-project-filter">
          <span>Project</span>
          <select value={selectedProject} onChange={(event) => setSelectedProject(event.target.value)}>
            <option value="">All projects</option>
            {projectNames.map((name) => <option key={name} value={name}>{name}</option>)}
          </select>
        </label>
        <label className="faculty-application-project-filter faculty-application-status-filter">
          <span>Status</span>
          <select value={selectedStatus} onChange={(event) => setSelectedStatus(event.target.value)}>
            <option value="">All statuses</option>
            <option value="Submitted">Pending</option>
            <option value="Accepted">Accepted</option>
            <option value="Rejected">Rejected</option>
          </select>
        </label>
        </div>

        {reviewNotice && (
          <p
            className={`faculty-project-form__feedback ${
              reviewNotice.type === 'error' ? 'is-error' : 'is-success'
            }`}
            role={reviewNotice.type === 'error' ? 'alert' : 'status'}
          >
            {reviewNotice.message}
          </p>
        )}

        {loading ? (
          <p>Loading student applications...</p>
        ) : error ? (
          <p className="faculty-project-form__feedback is-error" role="alert">
            {error}
          </p>
        ) : (
          <div className="faculty-application-list">
            {visible.map(
              (application) => (
                <CandidateCard
                  key={application.id}
                  application={application}
                  onReview={onReview}
                  isReviewing={reviewingApplicationIds.includes(application.id)}
                  onViewStudent={setSelectedStudentId}
                />
              )
            )}
          </div>
        )}

        {!loading && !error && !visible.length && (
          <div className="empty-state">
            <FileSearch
              size={30}
            />

            <h3>No student applications found</h3>

            <p>
              Submitted applications for your projects will appear here.
            </p>
          </div>
        )}
        <StudentProfileDialog studentId={selectedStudentId} onClose={() => setSelectedStudentId(null)} />
      </section>
    </div>
  )
}

function FacultyIdeas({ facultyProfile, onIdeaAdopted }) {
  const [selectedIdeaId, setSelectedIdeaId] = useState(null)
  const [ideas, setIdeas] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [invitationStatusError, setInvitationStatusError] = useState('')
  const [selectedStudentId, setSelectedStudentId] = useState(null)
  const [adoptingIdeaId, setAdoptingIdeaId] = useState(null)
  const [removingAdoptionId, setRemovingAdoptionId] = useState(null)
  const selectedIdea = ideas.find((idea) => idea.id === selectedIdeaId)

  useEffect(() => {
    if (!selectedIdeaId) return
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') setSelectedIdeaId(null)
    }
    document.addEventListener('keydown', closeOnEscape)
    return () => document.removeEventListener('keydown', closeOnEscape)
  }, [selectedIdeaId])

  async function loadIdeas() {
    setLoading(true)
    setError('')
    setInvitationStatusError('')

    const { data, error: loadError } = await supabase
      .from('research_ideas')
      .select(`
        id,
        title,
        category,
        description,
        student_id,
        adopted_by,
        created_at,
        profiles!research_ideas_student_id_fkey (
          full_name,
          major
        )
      `)
      .order('created_at', { ascending: false })

    if (loadError) {
      console.error('Faculty research ideas load error:', loadError.message)
      setError(`Could not load research ideas: ${loadError.message || 'Please try again.'}`)
      setLoading(false)
      return
    }

    const { data: invitations, error: invitationError } = await supabase
      .from('direct_messages')
      .select('research_idea_id')
      .eq('recipient_id', facultyProfile?.id)
      .not('research_idea_id', 'is', null)

    if (invitationError) {
      console.error('Faculty idea invitations load error:', invitationError.message)
      setInvitationStatusError('Invitation status could not be loaded. Please try again later.')
    }

    const invitedIdeaIds = new Set((invitations || []).map((invitation) => String(invitation.research_idea_id)))
    setIdeas((data || []).map((idea) => ({
      ...idea,
      has_adoption_invite: invitedIdeaIds.has(String(idea.id)),
    })))
    setLoading(false)
  }

  useEffect(() => {
    loadIdeas()
  }, [])

  async function adoptIdea(idea) {
    setAdoptingIdeaId(idea.id)
    const { error: adoptError } = await supabase.rpc('adopt_research_idea', { p_idea_id: idea.id })
    if (adoptError) setError(adoptError.message || 'Could not adopt this idea.')
    else { await loadIdeas(); onIdeaAdopted?.() }
    setAdoptingIdeaId(null)
  }

  async function removeAdoption(idea) {
    if (idea.adopted_by !== facultyProfile?.id || removingAdoptionId !== null) return
    setRemovingAdoptionId(idea.id)
    try {
      const { error: removalError } = await supabase.rpc('remove_research_idea_adoption', { p_idea_id: idea.id })
      if (removalError) {
        setError(removalError.message || 'Could not remove this adoption.')
      } else {
        await loadIdeas()
        onIdeaAdopted?.()
      }
    } catch (removalError) {
      setError(removalError.message || 'Could not remove this adoption.')
    } finally {
      setRemovingAdoptionId(null)
    }
  }

  return (
    <div className="dashboard-section">
      <section className="content-card">
        <Heading
          eyebrow="Idea discovery"
          title="Research ideas"
          action={
            !loading ? (
              <span className="count-pill">
                {ideas.length} total
              </span>
            ) : null
          }
        />

        {loading ? (
          <p>Loading research ideas...</p>
        ) : error ? (
          <p role="alert">{error}</p>
        ) : !ideas.length ? (
          <div className="empty-state">
            <Lightbulb size={30} />
            <h3>No research ideas yet</h3>
            <p>Student-submitted research ideas will appear here.</p>
          </div>
        ) : (
          <>
          {invitationStatusError && <p role="alert">{invitationStatusError}</p>}
          <div className="faculty-idea-grid">
            {ideas.map((idea) => (
              <article key={idea.id} onClick={(event) => {
                if (!event.target.closest('button')) setSelectedIdeaId(idea.id)
              }}>
                <div className="faculty-idea-summary">
                <h3><button className="idea-details-title" type="button" onClick={() => setSelectedIdeaId(idea.id)}>{idea.title}</button></h3>
                <small>Submitted by <button className="idea-student-button" type="button" onClick={() => setSelectedStudentId(idea.student_id)}>{idea.profiles?.full_name || 'Student'}</button>
                  {idea.profiles?.major
                    ? ` · ${idea.profiles.major}`
                    : ''}
                </small>
                {idea.has_adoption_invite && <small className="faculty-idea-invitation">A student invited you to adopt this idea</small>}
                </div>
                <div className="faculty-idea-actions">
                {idea.adopted_by === facultyProfile?.id && (
                  <button type="button" disabled={removingAdoptionId !== null} onClick={() => removeAdoption(idea)}>{removingAdoptionId === idea.id ? 'Removing…' : 'Remove adoption'}</button>
                )}
                <button type="button" onClick={() => setSelectedIdeaId(idea.id)}>View details</button>
                <button type="button" disabled={Boolean(idea.adopted_by) || adoptingIdeaId === idea.id} className={idea.adopted_by ? 'idea-adopted' : ''} onClick={() => adoptIdea(idea)}>{idea.adopted_by ? (idea.adopted_by === facultyProfile?.id ? 'Adopted by you' : 'Already adopted') : adoptingIdeaId === idea.id ? 'Adopting…' : 'Adopt idea'}</button>
                </div>
              </article>
            ))}
          </div>
          </>
        )}
        <StudentProfileDialog studentId={selectedStudentId} onClose={() => setSelectedStudentId(null)} />
        {selectedIdea && (
          <div className="faculty-modal-backdrop" onClick={() => setSelectedIdeaId(null)}>
            <section className="candidate-modal idea-details-modal" role="dialog" aria-modal="true" aria-labelledby="idea-details-title" onClick={(event) => event.stopPropagation()}>
              <button className="candidate-modal__close" type="button" autoFocus aria-label="Close idea details" onClick={() => setSelectedIdeaId(null)}><X size={18} /></button>
              <header><div><span>Research idea · {selectedIdea.category}</span><h2 id="idea-details-title">{selectedIdea.title}</h2><p>Submitted by {selectedIdea.profiles?.full_name || 'Student'}</p></div></header>
              <div className="candidate-modal__body">
                <div><h3>Description</h3><p className="idea-details-description">{selectedIdea.description}</p></div>
                <aside>
                  {selectedIdea.adopted_by === facultyProfile?.id && (
                    <button type="button" className="outline-button" disabled={removingAdoptionId !== null} onClick={() => removeAdoption(selectedIdea)}>{removingAdoptionId === selectedIdea.id ? 'Removing…' : 'Remove adoption'}</button>
                  )}
                  <div><small>Submitted</small><strong>{new Date(selectedIdea.created_at).toLocaleDateString()}</strong></div>
                  <div><small>Status</small><strong>{selectedIdea.adopted_by ? selectedIdea.adopted_by === facultyProfile?.id ? 'Adopted by you' : 'Already adopted' : selectedIdea.has_adoption_invite ? 'You have been invited to adopt this idea' : 'Available for adoption'}</strong></div>
                  <button type="button" className="outline-button" disabled={Boolean(selectedIdea.adopted_by) || adoptingIdeaId === selectedIdea.id} onClick={() => adoptIdea(selectedIdea)}>{selectedIdea.adopted_by ? 'Adopted' : adoptingIdeaId === selectedIdea.id ? 'Adopting…' : 'Adopt idea'}</button>
                </aside>
              </div>
            </section>
          </div>
        )}
      </section>
    </div>
  )
}

function FacultyAnalytics({
  projects,
  candidates,
  onNavigate,
}) {
  return (
    <div className="dashboard-section">
      <div className="metric-grid">
        <button className="metric-card-button" type="button" onClick={() => onNavigate('projects')}>
          <span className="metric-icon metric-icon--gold">
            <BriefcaseBusiness />
          </span>

          <div>
            <strong>
              {projects.length}
            </strong>

            <span>
              Projects
            </span>
          </div>

          <small>
            Your research projects
          </small>
        </button>

        <button className="metric-card-button" type="button" onClick={() => onNavigate('applications')}>
          <span className="metric-icon metric-icon--blue">
            <UsersRound />
          </span>

          <div>
            <strong>
              {candidates.length}
            </strong>

            <span>
              Candidates
            </span>
          </div>

          <small>
            Student applications to your projects
          </small>
        </button>
      </div>
    </div>
  )
}


export default function FacultyDashboard({
  profile,
  onSignOut,
}) {
  /*
   * Keep a local copy so changes saved from
   * FacultyProfile immediately update the rest
   * of the Faculty UI.
   */
  const [
    facultyProfile,
    setFacultyProfile,
  ] = useState(profile)

  const [
    activeTab,
    setActiveTab,
  ] = useState('overview')

  const [
    projects,
    setProjects,
  ] = useState([])

  const [projectsLoading, setProjectsLoading] =
    useState(true)

  const [projectsError, setProjectsError] =
    useState('')

  const [facultyApplications, setFacultyApplications] = useState([])
  const [applicationsLoading, setApplicationsLoading] = useState(true)
  const [applicationsError, setApplicationsError] = useState('')
  const [reviewingApplicationIds, setReviewingApplicationIds] = useState([])
  const [applicationReviewNotice, setApplicationReviewNotice] = useState(null)
  const [projectToOpen, setProjectToOpen] = useState(null)

  useEffect(() => {
    setFacultyProfile(profile)
  }, [profile])

  async function loadFacultyProjects(silent = false) {
    if (!facultyProfile?.id) {
      setProjects([])
      setProjectsLoading(false)
      return
    }

    if (!silent) setProjectsLoading(true)
    setProjectsError('')

    const [projectsResult, applicationsResult] = await Promise.all([
      supabase
        .from('research_opportunities')
        .select('*')
        .eq('owner_id', facultyProfile.id)
        .order('created_at', { ascending: false }),
      supabase
        .from('applications')
        .select('opportunity_id, status'),
    ])

    if (projectsResult.error || applicationsResult.error) {
      const loadError = projectsResult.error || applicationsResult.error
      console.error('Faculty project load error:', loadError.message)
      setProjectsError('Could not load your research projects.')
      setProjectsLoading(false)
      return
    }

    const reservations = (applicationsResult.data || [])
      .filter((application) => application.status !== 'Rejected')
      .reduce(
      (counts, application) => ({
        ...counts,
        [application.opportunity_id]:
          (counts[application.opportunity_id] || 0) + 1,
      }),
      {}
      )

    setProjects(
      (projectsResult.data || []).map((project) => ({
        ...project,
        reserved_places: reservations[project.id] || 0,
      }))
    )
    setProjectsLoading(false)
  }

  async function loadFacultyApplications(silent = false) {
    if (!facultyProfile?.id) {
      setFacultyApplications([])
      setApplicationsLoading(false)
      return
    }

    if (!silent) setApplicationsLoading(true)
    setApplicationsError('')

    const { data, error } = await supabase
      .from('faculty_project_applications')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Faculty application load error:', error.message)
      setApplicationsError('Could not load student applications.')
      setApplicationsLoading(false)
      return
    }

    setFacultyApplications(data || [])
    setApplicationsLoading(false)
  }

  useEffect(() => {
    loadFacultyProjects()
    loadFacultyApplications()
    const refreshId = window.setInterval(() => {
      loadFacultyProjects(true)
      loadFacultyApplications(true)
    }, 12000)
    return () => window.clearInterval(refreshId)
  }, [facultyProfile?.id])

  async function reviewApplication(applicationId, decision) {
    if (reviewingApplicationIds.includes(applicationId)) return

    setApplicationReviewNotice(null)
    setReviewingApplicationIds((current) => [...current, applicationId])

    const { error } = await supabase.rpc(
      'review_research_application',
      {
        p_application_id: applicationId,
        p_decision: decision,
      }
    )

    setReviewingApplicationIds((current) =>
      current.filter((id) => id !== applicationId)
    )

    if (error) {
      console.error('Application review error:', error.message)
      setApplicationReviewNotice({
        type: 'error',
        message: error.message || 'Could not update the application.',
      })
      return
    }

    setApplicationReviewNotice({
      type: 'success',
      message: decision === 'Accepted'
        ? 'Application accepted. Its place remains reserved.'
        : 'Application rejected. The project place is available again.',
    })

    await Promise.all([
      loadFacultyProjects(),
      loadFacultyApplications(),
    ])
  }

  const candidates = facultyApplications.map((application) => ({
    id: application.id,
    student_id: application.student_id,
    name: application.student_name || 'Student applicant',
    initials: getInitials(application.student_name || 'Student applicant'),
    projectId: application.opportunity_id,
    gpa: 'Not provided',
    skills: [],
    status: application.status,
  }))

  const screens = {
    overview: (
      <Overview
        projects={projects}
        projectsLoading={projectsLoading}
        projectsError={projectsError}
        applicationsLoading={applicationsLoading}
        applicationsError={applicationsError}
        candidates={
          candidates
        }
        onNavigate={
          setActiveTab
        }
        onViewProject={(projectId) => {
          if (!projectId) return
          setProjectToOpen(projectId)
          setActiveTab('projects')
        }}
      />
    ),

    profile: (
      <FacultyProfile
        profile={
          facultyProfile
        }
        onProfileUpdate={
          setFacultyProfile
        }
      />
    ),

    projects: (
      <FacultyProjects
        profile={facultyProfile}
        projects={projects}
        applications={facultyApplications}
        loading={projectsLoading}
        error={projectsError}
        onProjectsChanged={loadFacultyProjects}
        onStudentRemoved={() => Promise.all([loadFacultyProjects(true), loadFacultyApplications(true)])}
        selectedProjectId={projectToOpen}
        onProjectOpened={() => setProjectToOpen(null)}
      />
    ),

    applications: (
      <FacultyApplications
        applications={facultyApplications}
        loading={applicationsLoading}
        error={applicationsError}
        reviewingApplicationIds={reviewingApplicationIds}
        reviewNotice={applicationReviewNotice}
        onReview={reviewApplication}
      />
    ),

    ideas: (
      <FacultyIdeas facultyProfile={facultyProfile} onIdeaAdopted={loadFacultyProjects} />
    ),

    analytics: (
      <FacultyAnalytics
        projects={projects}
        candidates={
          candidates
        }
        onNavigate={setActiveTab}
      />
    ),

    messages: (
      <SupabaseMessages
        profile={facultyProfile}
        eyebrow="University communication"
      />
    ),
  }

  return (
    <div className="student-app faculty-app">
      <FacultySidebar
        activeTab={activeTab}
        onTabChange={
          setActiveTab
        }
        onSignOut={onSignOut}
      />

      <div className="student-app__main">
        <FacultyHeader
          activeTab={activeTab}
          profile={
            facultyProfile
          }
          onNavigate={setActiveTab}
        />

        <main className="dashboard-content">
          {Object.entries(
            screens
          ).map(
            ([tabId, screen]) => (
              <div
                key={tabId}
                hidden={
                  activeTab !==
                  tabId
                }
              >
                {screen}
              </div>
            )
          )}
        </main>
      </div>
    </div>
  )}
