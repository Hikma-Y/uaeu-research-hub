import { useEffect, useState } from 'react'
import { supabase } from './lib/supabase'
import SupabaseMessages from './SupabaseMessages'
import OrcidImport from './OrcidImport'
import { applyOrcidSelection } from './lib/orcid'
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

function FacultyHeader({
  activeTab,
  profile,
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
  onNavigate,
}) {
  const openProjects =
    projects.filter(
      (project) =>
        project.visibility === 'public' &&
        getRemainingSlots(project) > 0
    ).length

  const pending =
    candidates.filter(
      (candidate) =>
        candidate.status === 'Pending'
    ).length

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
        <article>
          <span className="metric-icon metric-icon--gold">
            <BriefcaseBusiness />
          </span>

          <div>
            <strong>
              {openProjects}
            </strong>

            <span>
              Open projects
            </span>
          </div>

          <small>
            {projects.length} total research postings
          </small>
        </article>

        <article>
          <span className="metric-icon metric-icon--blue">
            <UsersRound />
          </span>

          <div>
            <strong>
              {pending}
            </strong>

            <span>
              Applications to review
            </span>
          </div>

          <small>
            Candidate decisions awaiting you
          </small>
        </article>

        <article>
          <span className="metric-icon metric-icon--green">
            <Sparkles />
          </span>

          <div>
            <strong>
              Later
            </strong>

            <span>
              Compatibility matching
            </span>
          </div>

          <small>
            Recommendation algorithm not connected yet
          </small>
        </article>
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
              />
            )
          )}
        </div>
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
  loading,
  error,
  onProjectsChanged,
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
  })

  const [isSaving, setIsSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [formSuccess, setFormSuccess] = useState('')
  const [rankingProject, setRankingProject] = useState(null)
  const [rankedStudents, setRankedStudents] = useState([])
  const [selectedStudentIds, setSelectedStudentIds] = useState([])
  const [rankingLoading, setRankingLoading] = useState(false)
  const [inviteNotice, setInviteNotice] = useState('')

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
    })
    setEditingProjectId(project.id)
    setFormError('')
    setFormSuccess('')
    setShowForm(true)
  }

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

    if (!Number.isInteger(studentCapacity) || studentCapacity < 1) {
      setFormError('Number of students needed must be a whole number of at least 1.')
      return
    }

    if (payment !== null && (!Number.isFinite(payment) || payment < 0)) {
      setFormError('Student payment must be a non-negative amount in AED.')
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
      return
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
      return
    }

    await onProjectsChanged()
    setFormSuccess('Project removed.')
  }

  async function openStudentRanking(project) {
    setRankingProject(project)
    setRankedStudents([])
    setSelectedStudentIds([])
    setInviteNotice('')
    setRankingLoading(true)

    const { data, error: rankingError } = await supabase
      .rpc('get_ranked_students_for_project', {
        p_opportunity_id: project.id,
      })

    if (rankingError) {
      console.error('Student ranking error:', rankingError.message)
      setInviteNotice('Could not load the student ranking. Run the project invitations SQL setup first.')
    } else {
      setRankedStudents(data || [])
    }
    setRankingLoading(false)
  }

  function toggleStudent(studentId) {
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

        {showForm && (
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
                <option value="draft">Draft / Private</option>
                <option value="public">Public / Open for applications</option>
              </select>

              <small>
                Drafts are visible only to you. Public projects appear to eligible students and accept applications.
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
        )}

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
                      ? 'Draft / Private'
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

                  <div className="faculty-project-actions">
                    <button
                      className="text-button"
                      type="button"
                      onClick={() => startEditingProject(project)}
                    >
                      <Pencil size={14} />
                      Edit
                    </button>

                    <button
                      className="text-button"
                      type="button"
                      onClick={() => openStudentRanking(project)}
                    >
                      <UsersRound size={14} />
                      Rank students
                    </button>

                    <button
                      className="delete-project-button"
                      type="button"
                      onClick={() => deleteProject(project)}
                    >
                      <Trash2 size={14} />
                      Remove
                    </button>
                  </div>
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

        {rankingProject && (
          <section className="faculty-ranking-panel">
            <Heading
              eyebrow="Pre-publication invitations"
              title={`Students ranked by GPA for ${rankingProject.title}`}
              action={<button className="text-button" type="button" onClick={() => setRankingProject(null)}>Close</button>}
            />
            <p className="faculty-ranking-note">This temporary ranking uses GPA only. It can later be replaced by the matching algorithm score.</p>
            {rankingLoading ? <p>Loading students...</p> : !rankedStudents.length ? <p>No active student profiles are available yet.</p> : (
              <div className="faculty-ranking-list">
                {rankedStudents.map((student, index) => (
                  <label className="faculty-ranking-row" key={student.student_id}>
                    <input type="checkbox" checked={selectedStudentIds.includes(student.student_id)} onChange={() => toggleStudent(student.student_id)} disabled={student.invitation_status === 'Accepted'} />
                    <strong>#{index + 1}</strong>
                    <span className="candidate-avatar">{getInitials(student.full_name)}</span>
                    <span><b>{student.full_name || 'Student'}</b><small>{student.major || student.department || 'Academic details not provided'}</small></span>
                    <em>GPA {student.gpa ?? '—'}</em>
                    <small>{student.invitation_status || 'Not invited'}</small>
                  </label>
                ))}
              </div>
            )}
            {inviteNotice && <p className="faculty-project-form__feedback is-success">{inviteNotice}</p>}
            <button className="primary-dashboard-button" type="button" disabled={!selectedStudentIds.length || rankingLoading} onClick={sendInvitations}>Invite selected students</button>
          </section>
        )}
      </section>
    </div>
  )
}

function CandidateCard({
  application,
  candidate,
  project,
  onReview,
  isReviewing,
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

        <span className="candidate-match">
          <Sparkles size={14} />
          {entry.status || 'Pending'}
        </span>
      </div>

      <h3>
        {studentName}
      </h3>

      <p>
        {entry.project_title || project?.title || 'Project not specified'}
        {entry.student_email && (
          <><br />{entry.student_email}</>
        )}
      </p>

      <footer>
        <span>
          {appliedDate}
        </span>
      </footer>

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

  const visible =
    applications.filter(
      (application) =>
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
          />
        </label>

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
          <div className="faculty-candidate-grid">
            {visible.map(
              (application) => (
                <CandidateCard
                  key={application.id}
                  application={application}
                  onReview={onReview}
                  isReviewing={reviewingApplicationIds.includes(application.id)}
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
      </section>
    </div>
  )
}

function FacultyIdeas() {
  const [ideas, setIdeas] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  async function loadIdeas() {
    setLoading(true)
    setError('')

    const { data, error: loadError } = await supabase
      .from('research_ideas')
      .select(`
        id,
        title,
        category,
        description,
        created_at,
        profiles (
          full_name,
          major
        )
      `)
      .order('created_at', { ascending: false })

    if (loadError) {
      console.error('Faculty research ideas load error:', loadError.message)
      setError('Could not load research ideas. Please try again.')
      setLoading(false)
      return
    }

    setIdeas(data || [])
    setLoading(false)
  }

  useEffect(() => {
    loadIdeas()
  }, [])

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
          <div className="faculty-idea-grid">
            {ideas.map((idea) => (
              <article key={idea.id}>
                <span>{idea.category}</span>
                <h3>{idea.title}</h3>
                <p>{idea.description}</p>
                <small>
                  Submitted by {idea.profiles?.full_name || 'Student'}
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

function FacultyAnalytics({
  projects,
  candidates,
}) {
  return (
    <div className="dashboard-section">
      <div className="metric-grid">
        <article>
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
            Temporary project data
          </small>
        </article>

        <article>
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
            Application data will be
            connected to Supabase later
          </small>
        </article>
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

  useEffect(() => {
    setFacultyProfile(profile)
  }, [profile])

  async function loadFacultyProjects() {
    if (!facultyProfile?.id) {
      setProjects([])
      setProjectsLoading(false)
      return
    }

    setProjectsLoading(true)
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

  async function loadFacultyApplications() {
    if (!facultyProfile?.id) {
      setFacultyApplications([])
      setApplicationsLoading(false)
      return
    }

    setApplicationsLoading(true)
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
        candidates={
          candidates
        }
        onNavigate={
          setActiveTab
        }
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
        loading={projectsLoading}
        error={projectsError}
        onProjectsChanged={loadFacultyProjects}
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
      <FacultyIdeas />
    ),

    analytics: (
      <FacultyAnalytics
        projects={projects}
        candidates={
          candidates
        }
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
  )
}
