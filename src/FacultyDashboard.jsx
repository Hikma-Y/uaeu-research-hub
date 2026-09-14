import { useEffect, useState } from 'react'
import { supabase } from './lib/supabase'
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

/*
 * Projects and applications are still temporary.
 * We will connect these sections to Supabase after
 * confirming that the faculty profile works correctly.
 */
const INITIAL_PROJECTS = [
  {
    id: 'FP001',
    title:
      'AI-Based Matching for Senior Graduation Projects',
    program: 'SGP',
    status: 'Open',
    applicants: 8,
    deadline: 'September 18, 2026',
    description:
      'Develop and evaluate a matching model that connects students with research opportunities based on skills, interests, and academic background.',
    skills: [
      'Python',
      'NLP',
      'Machine Learning',
    ],
  },
  {
    id: 'FP002',
    title:
      'Smart Water Monitoring for Sustainable Campuses',
    program: 'SURE+',
    status: 'In Progress',
    applicants: 5,
    deadline: 'Closed',
    description:
      'Build an IoT-supported analytics system for monitoring and improving campus water use.',
    skills: [
      'IoT',
      'Data Analysis',
      'Sustainability',
    ],
  },
]

const INITIAL_CANDIDATES = [
  {
    id: 'C001',
    name: 'Alya Al Nuaimi',
    initials: 'AN',
    projectId: 'FP001',
    gpa: '3.87',
    skills: [
      'Python',
      'NLP',
      'Research Writing',
    ],
    status: 'Pending',
  },
  {
    id: 'C002',
    name: 'Omar Al Mansoori',
    initials: 'OM',
    projectId: 'FP001',
    gpa: '3.65',
    skills: [
      'Python',
      'Machine Learning',
      'Data Analysis',
    ],
    status: 'Pending',
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
        project.status === 'Open'
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

        <div className="faculty-profile-fields">
          <label>
            Research biography

            <textarea
              value={draft.bio}
              readOnly={!editing}
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
              readOnly={!editing}
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
              readOnly={!editing}
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
  projects,
  setProjects,
}) {
  const [showForm, setShowForm] =
    useState(false)

  const [draft, setDraft] =
    useState({
      title: '',
      program: 'SGP',
      deadline: '',
      description: '',
      skills: '',
    })

  function createProject(event) {
    event.preventDefault()

    /*
     * Project creation is still temporary/local.
     * We will replace this with Supabase next.
     */
    const id =
      `TEMP-${Date.now()}`

    setProjects(
      (current) => [
        {
          id,

          title:
            draft.title,

          program:
            draft.program,

          status:
            'Draft',

          applicants:
            0,

          deadline:
            draft.deadline,

          description:
            draft.description,

          skills:
            draft.skills
              .split(',')
              .map((item) =>
                item.trim()
              )
              .filter(Boolean),
        },

        ...current,
      ]
    )

    setDraft({
      title: '',
      program: 'SGP',
      deadline: '',
      description: '',
      skills: '',
    })

    setShowForm(false)
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
              onClick={() =>
                setShowForm(
                  (current) =>
                    !current
                )
              }
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
            onSubmit={
              createProject
            }
          >
            <label>
              Project title

              <input
                value={
                  draft.title
                }
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    title:
                      event.target.value,
                  })
                }
                required
              />
            </label>

            <label>
              Program

              <select
                value={
                  draft.program
                }
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    program:
                      event.target.value,
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
              Application deadline

              <input
                type="date"
                value={
                  draft.deadline
                }
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    deadline:
                      event.target.value,
                  })
                }
                required
              />
            </label>

            <label>
              Required skills

              <input
                value={
                  draft.skills
                }
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    skills:
                      event.target.value,
                  })
                }
                placeholder="Python, NLP, Machine Learning"
                required
              />
            </label>

            <label className="faculty-project-form__wide">
              Description

              <textarea
                value={
                  draft.description
                }
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    description:
                      event.target.value,
                  })
                }
                minLength={20}
                required
              />
            </label>

            <div className="faculty-project-form__actions">
              <button
                className="primary-dashboard-button"
                type="submit"
              >
                Add temporary project
              </button>
            </div>
          </form>
        )}

        <div className="faculty-project-grid">
          {projects.map(
            (project) => (
              <article
                className="faculty-project-card"
                key={project.id}
              >
                <div>
                  <span className="project-id">
                    {project.id}
                    {' · '}
                    {project.program}
                  </span>

                  <em
                    className={`faculty-project-status faculty-project-status--${project.status
                      .toLowerCase()
                      .replaceAll(
                        ' ',
                        '-'
                      )}`}
                  >
                    {project.status}
                  </em>
                </div>

                <h3>
                  {project.title}
                </h3>

                <p>
                  {project.description}
                </p>

                <div className="tag-list">
                  {project.skills.map(
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

                    {
                      project.applicants
                    }{' '}
                    applicants
                  </span>

                  <button
                    className="delete-project-button"
                    type="button"
                    onClick={() =>
                      setProjects(
                        (current) =>
                          current.filter(
                            (item) =>
                              item.id !==
                              project.id
                          )
                      )
                    }
                  >
                    <Trash2
                      size={14}
                    />

                    Remove
                  </button>
                </footer>
              </article>
            )
          )}
        </div>
      </section>
    </div>
  )
}

function CandidateCard({
  candidate,
  project,
}) {
  return (
    <article className="candidate-card">
      <div className="candidate-card__top">
        <span className="candidate-avatar">
          {candidate.initials}
        </span>

        <span className="candidate-match">
          <Sparkles size={14} />
          Not calculated
        </span>
      </div>

      <h3>
        {candidate.name}
      </h3>

      <p>
        {project?.title}
      </p>

      <div className="tag-list">
        {candidate.skills.map(
          (skill) => (
            <span key={skill}>
              {skill}
            </span>
          )
        )}
      </div>

      <footer>
        <span>
          GPA {candidate.gpa}
          {' · '}
          {candidate.status}
        </span>
      </footer>
    </article>
  )
}

function FacultyApplications({
  candidates,
  projects,
}) {
  const [query, setQuery] =
    useState('')

  const visible =
    candidates.filter(
      (candidate) =>
        candidate.name
          .toLowerCase()
          .includes(
            query.toLowerCase()
          ) ||
        candidate.skills
          .join(' ')
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
              candidates
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
            placeholder="Search candidates or skills"
          />
        </label>

        <div className="faculty-candidate-grid">
          {visible.map(
            (candidate) => (
              <CandidateCard
                key={candidate.id}
                candidate={
                  candidate
                }
                project={projects.find(
                  (project) =>
                    project.id ===
                    candidate.projectId
                )}
              />
            )
          )}
        </div>

        {!visible.length && (
          <div className="empty-state">
            <FileSearch
              size={30}
            />

            <h3>
              No candidates found
            </h3>

            <p>
              Try another search.
            </p>
          </div>
        )}
      </section>
    </div>
  )
}

function FacultyIdeas() {
  return (
    <div className="dashboard-section">
      <section className="content-card">
        <Heading
          eyebrow="Idea discovery"
          title="Research ideas"
        />

        <div className="faculty-idea-grid">
          <article>
            <span>
              Artificial Intelligence
            </span>

            <h3>
              Student research ideas will
              be loaded from Supabase here.
            </h3>

            <p>
              Supabase integration for
              ideas will be added after
              faculty projects and
              applications.
            </p>
          </article>
        </div>
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

function FacultyMessages() {
  const [message, setMessage] =
    useState('')

  const [sent, setSent] =
    useState([])

  function submit(event) {
    event.preventDefault()

    if (!message.trim()) {
      return
    }

    setSent(
      (current) => [
        ...current,
        message.trim(),
      ]
    )

    setMessage('')
  }

  return (
    <div className="dashboard-section messaging-layout">
      <aside className="content-card conversation-list">
        <Heading
          eyebrow="Student communication"
          title="Messages"
        />

        <p>
          Socket.IO will be connected
          after the Supabase merge.
        </p>
      </aside>

      <section className="content-card chat-panel">
        <header>
          <div>
            <strong>
              Messaging test
            </strong>
          </div>
        </header>

        <div className="chat-messages">
          {sent.map(
            (item, index) => (
              <div
                className="message-bubble message-bubble--me"
                key={`${item}-${index}`}
              >
                <p>
                  {item}
                </p>

                <time>
                  Now
                </time>
              </div>
            )
          )}
        </div>

        <form
          className="message-composer"
          onSubmit={submit}
        >
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
  ] = useState(
    INITIAL_PROJECTS
  )

  const [candidates] =
    useState(
      INITIAL_CANDIDATES
    )

  useEffect(() => {
    setFacultyProfile(profile)
  }, [profile])

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
        projects={projects}
        setProjects={
          setProjects
        }
      />
    ),

    applications: (
      <FacultyApplications
        candidates={
          candidates
        }
        projects={projects}
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
      <FacultyMessages />
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