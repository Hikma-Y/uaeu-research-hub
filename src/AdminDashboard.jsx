import { useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle,
  BarChart3,
  Bell,
  BriefcaseBusiness,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  CircleUserRound,
  ClipboardList,
  Clock3,
  Edit3,
  Eye,
  EyeOff,
  FlaskConical,
  LayoutDashboard,
  LogOut,
  Megaphone,
  MessageSquare,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
  TrendingUp,
  UserPlus,
  UsersRound,
  X,
} from 'lucide-react'

import { supabase } from './lib/supabase.js'
import SupabaseMessages from './SupabaseMessages.jsx'
import './admin.css'

const ADMIN_NAV_GROUPS = [
  {
    label: 'Overview',
    items: [{ id: 'overview', label: 'Overview', icon: LayoutDashboard }],
  },
  {
    label: 'Research',
    items: [
      { id: 'projects', label: 'Project Management', icon: BriefcaseBusiness },
      { id: 'progress', label: 'Progress Tracking', icon: ClipboardList },
      { id: 'oversight', label: 'Project Oversight', icon: Search },
    ],
  },
  {
    label: 'Administration',
    items: [
      { id: 'users', label: 'User Management', icon: UserPlus },
      { id: 'announcements', label: 'Announcements', icon: Megaphone },
      { id: 'messages', label: 'Messaging', icon: MessageSquare },
    ],
  },
  {
    label: 'Insights',
    items: [{ id: 'analytics', label: 'Impact Analytics', icon: BarChart3 }],
  },
]

const ADMIN_NAV = ADMIN_NAV_GROUPS.flatMap((group) => group.items)

function getInitials(name) {
  if (!name) return 'AD'

  return name
    .split(' ')
    .filter(Boolean)
    .map((part) => part[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()
}

function getGreetingName(name) {
  if (!name) return 'Administrator'

  const parts = name.trim().split(/\s+/)
  const titles = ['dr.', 'dr', 'prof.', 'prof', 'mr.', 'mr', 'mrs.', 'mrs', 'ms.', 'ms']

  if (parts.length >= 2 && titles.includes(parts[0].toLowerCase())) {
    return `${parts[0]} ${parts[1]}`
  }

  return parts[0]
}

function formatDate(value, fallback = 'Not set') {
  if (!value) return fallback

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)

  return new Intl.DateTimeFormat('en-AE', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date)
}

function profileListToText(value) {
  return Array.isArray(value) ? value.join(', ') : ''
}

function textToProfileList(value) {
  return value.split(',').map((item) => item.trim()).filter(Boolean)
}

function createManagedProfileDraft(person) {
  return {
    full_name: person?.full_name || '',
    email: person?.email || '',
    university_id: person?.university_id || '',
    department: person?.department || '',
    major: person?.major || '',
    year_of_study: person?.year_of_study || '',
    gpa: person?.gpa ?? '',
    expected_graduation_year: person?.expected_graduation_year ?? '',
    research_experience: person?.research_experience || '',
    research_interests: profileListToText(person?.research_interests),
    skills: profileListToText(person?.skills),
  }
}

function formatTimeAgo(value) {
  if (!value) return 'Recently'

  const then = new Date(value).getTime()
  if (Number.isNaN(then)) return 'Recently'

  const seconds = Math.max(1, Math.floor((Date.now() - then) / 1000))
  if (seconds < 60) return `${seconds}s ago`

  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`

  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`

  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d ago`

  return formatDate(value)
}

function daysUntil(value) {
  if (!value) return null

  const target = new Date(value)
  if (Number.isNaN(target.getTime())) return null

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  target.setHours(0, 0, 0, 0)

  return Math.ceil((target - today) / 86400000)
}

function normalizeStatus(value, fallback = 'Unknown') {
  return value ? String(value).trim() : fallback
}

function statusClass(value) {
  const status = normalizeStatus(value).toLowerCase().replaceAll(' ', '-')
  return `admin-status admin-status--${status}`
}

function riskForProject(project, milestones = []) {
  const projectMilestones = milestones.filter(
    (item) => String(item.opportunity_id) === String(project.id)
  )

  const overdueMilestones = projectMilestones.filter((item) => {
    const due = daysUntil(item.due_date)
    return due !== null && due < 0 && normalizeStatus(item.status).toLowerCase() !== 'completed'
  })

  if (overdueMilestones.length >= 2) {
    return { level: 'High', reason: `${overdueMilestones.length} overdue milestones` }
  }

  if (overdueMilestones.length === 1) {
    return { level: 'High', reason: 'Milestone overdue' }
  }

  const projectDeadline = daysUntil(project.deadline || project.end_date)

  if (projectDeadline !== null && projectDeadline < 0) {
    return { level: 'High', reason: 'Project deadline passed' }
  }

  if (projectDeadline !== null && projectDeadline <= 14) {
    return { level: 'Medium', reason: `Deadline in ${projectDeadline} days` }
  }

  if (!projectMilestones.length) {
    return { level: 'Medium', reason: 'No milestones recorded' }
  }

  return { level: 'Low', reason: 'On track' }
}

function PageHeading({ eyebrow, title, description, action }) {
  return (
    <div className="admin-page-heading">
      <div>
        <span>{eyebrow}</span>
        <h2>{title}</h2>
        {description && <p>{description}</p>}
      </div>
      {action}
    </div>
  )
}

function LoadingState({ label = 'Loading administration data...' }) {
  return (
    <div className="admin-loading-state">
      <RefreshCw className="admin-spin" size={20} />
      <span>{label}</span>
    </div>
  )
}

function EmptyState({ icon: Icon, title, text, action }) {
  return (
    <div className="admin-empty-state">
      <span><Icon size={24} /></span>
      <h3>{title}</h3>
      <p>{text}</p>
      {action}
    </div>
  )
}

function Sidebar({ activeTab, onTabChange, onSignOut }) {
  return (
    <aside className="student-sidebar admin-sidebar">
      <div className="student-sidebar__brand">
        <FlaskConical size={25} />
      </div>

      <nav aria-label="Administration dashboard">
        {ADMIN_NAV_GROUPS.map((group, groupIndex) => (
          <div className="admin-nav-group" key={group.label}>
            {groupIndex > 0 && <span className="admin-nav-divider" aria-hidden="true" />}
            {group.items.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                className={activeTab === id ? 'sidebar-action is-active' : 'sidebar-action'}
                type="button"
                aria-label={label}
                data-tooltip={label}
                onClick={() => onTabChange(id)}
              >
                <Icon size={21} />
              </button>
            ))}
          </div>
        ))}
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

function Header({ activeTab, profile, adminProfile, notifications, onNavigate, onSignOut }) {
  const current = ADMIN_NAV.find((item) => item.id === activeTab)
  const [showNotifications, setShowNotifications] = useState(false)
  const [showProfile, setShowProfile] = useState(false)

  return (
    <header className="dashboard-header admin-dashboard-header">
      <div>
        <span className="dashboard-header__eyebrow">Administration workspace</span>
        <h1>{current?.label}</h1>
      </div>

      <div className="dashboard-header__actions">
        <div className="admin-header-popover-wrap">
          <button
            className="header-icon-button"
            type="button"
            aria-label="Notifications"
            aria-expanded={showNotifications}
            onClick={() => {
              setShowNotifications((currentValue) => !currentValue)
              setShowProfile(false)
            }}
          >
            <Bell size={20} />
            {notifications.length > 0 && <span className="notification-dot" />}
          </button>

          {showNotifications && (
            <div className="admin-popover admin-notification-popover">
              <div className="admin-popover__header">
                <strong>Notifications</strong>
                <span>{notifications.length}</span>
              </div>
              {notifications.length ? (
                notifications.slice(0, 6).map((item) => (
                  <button
                    className="admin-notification-row"
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setShowNotifications(false)
                      onNavigate(item.target)
                    }}
                  >
                    <span className={`admin-notification-row__icon is-${item.level || 'info'}`}>
                      <Bell size={14} />
                    </span>
                    <div>
                      <strong>{item.title}</strong>
                      <small>{item.text}</small>
                    </div>
                  </button>
                ))
              ) : (
                <p className="admin-popover__empty">No items need your attention.</p>
              )}
            </div>
          )}
        </div>

        <div className="admin-header-popover-wrap">
          <button
            className="student-identity admin-identity-button"
            type="button"
            aria-expanded={showProfile}
            onClick={() => {
              setShowProfile((currentValue) => !currentValue)
              setShowNotifications(false)
            }}
          >
            <span className="student-avatar">{getInitials(profile?.full_name)}</span>
            <span>
              <strong>{profile?.full_name || 'Research Administrator'}</strong>
              <small>{adminProfile?.job_title || 'Administrator'}</small>
            </span>
          </button>

          {showProfile && (
            <div className="admin-popover admin-profile-popover">
              <div>
                <strong>{profile?.full_name || 'Research Administrator'}</strong>
                <small>{adminProfile?.job_title || 'Administrator'}</small>
                <small>{profile?.email || 'No email recorded'}</small>
              </div>

              <div className="admin-profile-popover__details">
                <small><strong>University ID:</strong> {profile?.university_id || 'Not set'}</small>
                <small><strong>Department:</strong> {profile?.department || 'Not set'}</small>
                <small><strong>Office:</strong> {adminProfile?.office || 'Not set'}</small>
                <small><strong>Admin level:</strong> {adminProfile?.admin_level || 'Standard'}</small>
              </div>

              <hr />
              <button type="button" onClick={onSignOut}>
                <LogOut size={15} />
                Sign out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}

function MetricCard({ icon: Icon, value, label, helper, tone = 'gold', onClick, isSelected = false }) {
  const content = <>
      <span className={`metric-icon metric-icon--${tone}`}><Icon size={20} /></span>
      <div>
        <strong>{value}</strong>
        <span>{label}</span>
        <small>{helper}</small>
      </div>
    </>

  return onClick ? (
    <button className={`admin-kpi-card admin-kpi-card--interactive${isSelected ? ' is-selected' : ''}`} type="button" onClick={onClick} aria-pressed={isSelected}>
      {content}
    </button>
  ) : <article className="admin-kpi-card">{content}</article>
}

function MetricResults({ title, items, renderItem }) {
  const [userRoleFilter, setUserRoleFilter] = useState('all')
  const [selectedProject, setSelectedProject] = useState(null)
  const isRegisteredUsers = title === 'Registered users'
  const isProjectMetric = /projects/i.test(title)
  const visibleItems = isRegisteredUsers
    ? items
      .filter((user) => userRoleFilter === 'all' || normalizeStatus(user.role).toLowerCase() === userRoleFilter)
      .sort((firstUser, secondUser) =>
        (firstUser.full_name || firstUser.email || '').localeCompare(
          secondUser.full_name || secondUser.email || '',
          'en',
          { sensitivity: 'base' }
        )
      )
    : items

  return (
    <section className="content-card admin-metric-results" aria-live="polite">
      <div className="admin-metric-results__heading">
        <PageHeading eyebrow="Selected metric" title={title} description={`${visibleItems.length} matching item${visibleItems.length === 1 ? '' : 's'}.`} />
        {isRegisteredUsers && (
          <div className="admin-user-role-filter" role="group" aria-label="Filter registered users by role">
            {['all', 'student', 'faculty'].map((role) => (
              <button
                key={role}
                className={userRoleFilter === role ? 'is-active' : ''}
                type="button"
                aria-pressed={userRoleFilter === role}
                onClick={() => setUserRoleFilter(role)}
              >
                {role === 'all' ? 'All' : role === 'student' ? 'Students' : 'Faculty'}
              </button>
            ))}
          </div>
        )}
      </div>
      {visibleItems.length ? (
        <div className="admin-metric-results__list">
          {visibleItems.map((item) => isProjectMetric ? (
            <button
              className="admin-metric-results__project"
              key={item.id}
              type="button"
              onClick={() => setSelectedProject(item)}
              aria-label={`View details for ${item.title}`}
            >
              {renderItem(item)}
            </button>
          ) : renderItem(item))}
        </div>
      ) : <p className="admin-muted-copy">No matching records found.</p>}

      {selectedProject && (
        <div className="admin-project-modal-backdrop" role="presentation" onClick={() => setSelectedProject(null)}>
          <section className="admin-project-modal" role="dialog" aria-modal="true" aria-labelledby="overview-project-details-title" onClick={(event) => event.stopPropagation()}>
            <header>
              <div>
                <span className={statusClass(selectedProject.status || 'Open')}>{selectedProject.status || 'Open'}</span>
                <h2 id="overview-project-details-title">{selectedProject.title}</h2>
              </div>
              <button type="button" aria-label="Close project details" onClick={() => setSelectedProject(null)}><X size={20} /></button>
            </header>
            <p>{selectedProject.description || 'No project description has been added.'}</p>
            <dl>
              <div><dt>Program type</dt><dd>{selectedProject.type || 'Not set'}</dd></div>
              <div><dt>Department</dt><dd>{selectedProject.department || 'Not set'}</dd></div>
              <div><dt>Supervisor</dt><dd>{selectedProject.supervisor || 'Unassigned'}</dd></div>
              <div><dt>Deadline</dt><dd>{formatDate(selectedProject.deadline || selectedProject.end_date)}</dd></div>
              <div><dt>Commitment</dt><dd>{selectedProject.commitment || 'Not set'}</dd></div>
            </dl>
            <div className="admin-project-modal__section"><h3>Skills / tags</h3><p>{Array.isArray(selectedProject.tags) && selectedProject.tags.length ? selectedProject.tags.join(', ') : 'No skills or tags added.'}</p></div>
            <div className="admin-project-modal__section"><h3>Requirements</h3><p>{Array.isArray(selectedProject.requirements) && selectedProject.requirements.length ? selectedProject.requirements.join(', ') : 'No requirements added.'}</p></div>
          </section>
        </div>
      )}
    </section>
  )
}

function Overview({ data, profile, onNavigate }) {
  const { projects, profiles, applications, milestones, activities } = data
  const [selectedMetric, setSelectedMetric] = useState(null)
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().slice(0, 10))
  const dateInputRef = useRef(null)

  const pendingApplications = applications.filter((item) =>
    ['submitted', 'pending', 'under review'].includes(normalizeStatus(item.status).toLowerCase())
  )

  const activeProjects = projects.filter((item) =>
    !['completed', 'archived', 'closed'].includes(normalizeStatus(item.status, 'Open').toLowerCase())
  )

  const overdueMilestones = milestones.filter((item) => {
    const due = daysUntil(item.due_date)
    return due !== null && due < 0 && normalizeStatus(item.status).toLowerCase() !== 'completed'
  })

  const pendingUsers = profiles.filter((item) =>
    normalizeStatus(item.account_status, 'active').toLowerCase() === 'pending'
  )

  const deadlines = [...projects]
    .filter((project) => {
      const days = daysUntil(project.deadline || project.end_date)
      return days !== null && days >= 0 && days <= 30
    })
    .sort((a, b) => new Date(a.deadline || a.end_date) - new Date(b.deadline || b.end_date))
    .slice(0, 5)

  const statusCounts = projects.reduce((accumulator, project) => {
    const status = normalizeStatus(project.status, 'Open')
    accumulator[status] = (accumulator[status] || 0) + 1
    return accumulator
  }, {})

  const maxStatusCount = Math.max(1, ...Object.values(statusCounts))

  return (
    <div className="dashboard-section admin-dashboard-section">
      <section className="admin-welcome-strip">
        <div>
          <span>Administration overview</span>
          <h2>Good {new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 18 ? 'afternoon' : 'evening'}, {getGreetingName(profile?.full_name)}.</h2>
          <p>Here is what needs attention across the UAEU research community today.</p>
        </div>
        <button className="admin-welcome-date" type="button" onClick={() => {
          const input = dateInputRef.current
          if (input?.showPicker) input.showPicker()
          else input?.focus()
        }}>
          <CalendarDays size={18} />
          <span>{new Intl.DateTimeFormat('en-AE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(`${selectedDate}T00:00:00`))}</span>
        </button>
        <input ref={dateInputRef} className="admin-welcome-date-input" aria-label="Select overview date" type="date" value={selectedDate} onChange={(event) => setSelectedDate(event.target.value)} />
      </section>

      <div className="admin-kpi-grid">
        <MetricCard
          icon={BriefcaseBusiness}
          value={activeProjects.length}
          label="Active projects"
          helper={`${projects.length} total in the portfolio`}
          tone="gold"
          onClick={() => setSelectedMetric('projects')}
          isSelected={selectedMetric === 'projects'}
        />
        <MetricCard
          icon={UsersRound}
          value={profiles.length}
          label="Registered users"
          helper={`${profiles.filter((item) => item.role === 'faculty').length} faculty · ${profiles.filter((item) => item.role === 'student').length} students`}
          tone="blue"
          onClick={() => setSelectedMetric('users')}
          isSelected={selectedMetric === 'users'}
        />
        <MetricCard
          icon={ClipboardList}
          value={pendingApplications.length}
          label="Applications pending"
          helper="Awaiting faculty or admin action"
          tone="green"
          onClick={() => setSelectedMetric('applications')}
          isSelected={selectedMetric === 'applications'}
        />
        <MetricCard
          icon={AlertTriangle}
          value={overdueMilestones.length + pendingUsers.length}
          label="Need attention"
          helper={`${overdueMilestones.length} overdue · ${pendingUsers.length} account reviews`}
          tone="rose"
          onClick={() => setSelectedMetric('attention')}
          isSelected={selectedMetric === 'attention'}
        />
      </div>

      {selectedMetric === 'projects' && <MetricResults title="Active projects" items={activeProjects} renderItem={(project) => <div key={project.id}><strong>{project.title}</strong><span>{project.department || project.type || 'Research project'} · {project.status || 'Open'}</span></div>} />}
      {selectedMetric === 'users' && <MetricResults title="Registered users" items={profiles} renderItem={(user) => <div key={user.id}><strong>{user.full_name || user.email || 'Unnamed user'}</strong><span>{user.role || 'User'} · {user.department || 'No department set'}</span></div>} />}
      {selectedMetric === 'applications' && <MetricResults title="Applications pending" items={pendingApplications} renderItem={(application) => <div key={application.id}><strong>{application.student_name || application.applicant_name || 'Student application'}</strong><span>{application.status || 'Pending'} · {projects.find((project) => String(project.id) === String(application.opportunity_id))?.title || 'Research project'}</span></div>} />}
      {selectedMetric === 'attention' && <MetricResults title="Items needing attention" items={[...overdueMilestones.map((item) => ({ ...item, kind: 'Overdue milestone' })), ...pendingUsers.map((item) => ({ ...item, kind: 'Account review' }))]} renderItem={(item) => <div key={`${item.kind}-${item.id}`}><strong>{item.title || item.full_name || item.email || item.kind}</strong><span>{item.kind} · {item.due_date ? `Due ${formatDate(item.due_date)}` : 'Pending review'}</span></div>} />}

      <div className="admin-overview-grid">
        <section className="content-card admin-attention-card">
          <PageHeading eyebrow="Priority queue" title="Needs attention" description="Items requiring administrative review." />
          <div className="admin-attention-list">
            <button type="button" onClick={() => onNavigate('projects')}>
              <span className="is-red"><AlertTriangle size={17} /></span>
              <div><strong>{overdueMilestones.length} overdue milestones</strong><small>Review delayed project work</small></div>
              <ChevronRight size={17} />
            </button>
            <button type="button" onClick={() => onNavigate('users')}>
              <span className="is-amber"><UserPlus size={17} /></span>
              <div><strong>{pendingUsers.length} accounts pending review</strong><small>Verify user access and role</small></div>
              <ChevronRight size={17} />
            </button>
            <button type="button" onClick={() => onNavigate('projects')}>
              <span className="is-blue"><ClipboardList size={17} /></span>
              <div><strong>{pendingApplications.length} applications awaiting action</strong><small>Review current research applications</small></div>
              <ChevronRight size={17} />
            </button>
          </div>
        </section>

        <section className="content-card">
          <PageHeading eyebrow="Portfolio" title="Project status" description="Current distribution across the research portfolio." />
          <div className="admin-status-chart">
            {Object.entries(statusCounts).length ? Object.entries(statusCounts).map(([status, count]) => (
              <div key={status}>
                <span>{status}</span>
                <div><i style={{ width: `${Math.max(8, (count / maxStatusCount) * 100)}%` }} /></div>
                <strong>{count}</strong>
              </div>
            )) : <p className="admin-muted-copy">No projects have been created yet.</p>}
          </div>
        </section>
      </div>

      <div className="admin-overview-grid admin-overview-grid--bottom">
        <section className="content-card">
          <PageHeading eyebrow="Audit trail" title="Recent activity" description="Latest administrative and research changes." />
          <div className="admin-activity-list">
            {activities.length ? activities.slice(0, 7).map((activity) => (
              <div key={activity.id}>
                <span><ShieldCheck size={15} /></span>
                <div>
                  <strong>{activity.description || activity.action}</strong>
                  <small>{formatTimeAgo(activity.created_at)}</small>
                </div>
              </div>
            )) : (
              <EmptyState
                icon={ShieldCheck}
                title="No administrative activity yet"
                text="Actions such as project updates and announcements will appear here."
              />
            )}
          </div>
        </section>

        <section className="content-card">
          <PageHeading eyebrow="Next 30 days" title="Upcoming deadlines" description="Projects approaching a key deadline." />
          <div className="admin-deadline-list">
            {deadlines.length ? deadlines.map((project) => {
              const remaining = daysUntil(project.deadline || project.end_date)
              return (
                <button key={project.id} type="button" onClick={() => onNavigate('projects')}>
                  <div>
                    <strong>{project.title}</strong>
                    <small>{project.department || project.type || 'Research project'}</small>
                  </div>
                  <span>
                    <strong>{formatDate(project.deadline || project.end_date)}</strong>
                    <small>{remaining === 0 ? 'Today' : `${remaining} days`}</small>
                  </span>
                </button>
              )
            }) : (
              <EmptyState icon={CalendarDays} title="No deadlines approaching" text="No project deadlines fall within the next 30 days." />
            )}
          </div>
        </section>
      </div>
    </div>
  )
}

function ProjectManagement({ data, onReload, logActivity }) {
  const programTypes = ['SURE+', 'SDG', 'District 4.0', 'Research Assistant', 'Other']
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('All')
  const [selectedId, setSelectedId] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [showProjectDetails, setShowProjectDetails] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deletingProject, setDeletingProject] = useState(false)
  const [message, setMessage] = useState('')
  const [otherProgramType, setOtherProgramType] = useState('')
  const [draft, setDraft] = useState({
    title: '', type: 'SURE+', department: 'Computer Science', supervisor: '', description: '',
    deadline: '', commitment: '', tags: '', requirements: '', status: 'Open',
  })

  const projects = data.projects
  const applicationCounts = data.applications.reduce((accumulator, application) => {
    const key = String(application.opportunity_id)
    accumulator[key] = (accumulator[key] || 0) + 1
    return accumulator
  }, {})

  const statuses = ['All', ...new Set(projects.map((item) => normalizeStatus(item.status, 'Open')))]

  const visible = useMemo(() => projects.filter((project) => {
    const haystack = `${project.title || ''} ${project.department || ''} ${project.supervisor || ''}`.toLowerCase()
    const matchesQuery = haystack.includes(query.toLowerCase())
    const matchesStatus = statusFilter === 'All' || normalizeStatus(project.status, 'Open') === statusFilter
    return matchesQuery && matchesStatus
  }), [projects, query, statusFilter])

  const selected = projects.find((project) => String(project.id) === String(selectedId)) || visible[0]

  async function createProject(event) {
    event.preventDefault()
    setSaving(true)
    setMessage('')

    const payload = {
      title: draft.title.trim(),
      type: draft.type === 'Other' ? otherProgramType.trim() : draft.type,
      department: draft.department.trim(),
      supervisor: draft.supervisor.trim(),
      description: draft.description.trim(),
      deadline: draft.deadline || null,
      commitment: draft.commitment.trim() || null,
      tags: draft.tags.split(',').map((item) => item.trim()).filter(Boolean),
      requirements: draft.requirements.split(',').map((item) => item.trim()).filter(Boolean),
      status: draft.status,
    }

    const { data: created, error } = await supabase
      .from('research_opportunities')
      .insert(payload)
      .select('*')
      .single()

    if (error) {
      console.error('Project create error:', error)
      setMessage(error.message)
      setSaving(false)
      return
    }

    await logActivity('project_created', 'project', created?.id, `Created project “${payload.title}”.`)
    setDraft({ title: '', type: 'SURE+', department: 'Computer Science', supervisor: '', description: '', deadline: '', commitment: '', tags: '', requirements: '', status: 'Open' })
    setOtherProgramType('')
    setShowForm(false)
    setSaving(false)
    await onReload()
  }

  async function updateProjectStatus(project, status) {
    if (!project) return

    setMessage('')
    const { error } = await supabase
      .from('research_opportunities')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', project.id)

    if (error) {
      console.error('Project status update error:', error)
      setMessage(error.message)
      return
    }

    await logActivity('project_status_changed', 'project', project.id, `Changed “${project.title}” to ${status}.`)
    await onReload()
  }

  async function deleteProject(project) {
    if (!project || deletingProject) return
    const confirmed = window.confirm(
      `Delete “${project.title}”? This permanently removes the project, its applications, milestones, and project group chat messages.`
    )
    if (!confirmed) return

    setDeletingProject(true)
    setMessage('')

    const { error: deleteError } = await supabase.rpc(
      'admin_delete_project',
      { p_opportunity_id: String(project.id) }
    )

    if (deleteError) {
      console.error('Project delete error:', deleteError)
      setMessage(deleteError.message || 'Could not delete this project.')
      setDeletingProject(false)
      return
    }

    await logActivity('project_deleted', 'project', project.id, `Deleted project “${project.title}”.`)
    setShowProjectDetails(false)
    setSelectedId(null)
    setDeletingProject(false)
    await onReload()
  }

  return (
    <div className="dashboard-section admin-dashboard-section">
      <section className="content-card">
        <PageHeading
          eyebrow="Research portfolio"
          title="Research projects"
          description="Create, review and manage opportunities across UAEU."
          action={(
            <button className="primary-dashboard-button" type="button" onClick={() => setShowForm((current) => !current)}>
              {showForm ? <><X size={15} /> Close form</> : <><Plus size={15} /> New project</>}
            </button>
          )}
        />

        {showForm && (
          <form className="admin-project-form admin-inline-form" onSubmit={createProject}>
            <label className="admin-form-wide">Project title<input required value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} /></label>
            <label>Program type
              <select
                required
                value={draft.type}
                onChange={(event) => {
                  const type = event.target.value
                  setDraft({ ...draft, type })
                  if (type !== 'Other') setOtherProgramType('')
                }}
              >
                {programTypes.map((type) => <option key={type} value={type}>{type}</option>)}
              </select>
            </label>
            {draft.type === 'Other' && (
              <label>Other program type<input required autoFocus value={otherProgramType} onChange={(event) => setOtherProgramType(event.target.value)} placeholder="Enter program type" /></label>
            )}
            <label>Department<input required value={draft.department} onChange={(event) => setDraft({ ...draft, department: event.target.value })} /></label>
            <label>Supervisor<input required value={draft.supervisor} onChange={(event) => setDraft({ ...draft, supervisor: event.target.value })} /></label>
            <label>Status<select value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value })}><option>Open</option><option>Draft</option><option>In Progress</option><option>Completed</option></select></label>
            <label>Deadline<input type="date" value={draft.deadline} onChange={(event) => setDraft({ ...draft, deadline: event.target.value })} /></label>
            <label>Commitment<input placeholder="e.g. 8 hours/week" value={draft.commitment} onChange={(event) => setDraft({ ...draft, commitment: event.target.value })} /></label>
            <label className="admin-form-wide">Description<textarea required value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} /></label>
            <label className="admin-form-wide">Skills / tags<input placeholder="Python, AI, Data Analysis" value={draft.tags} onChange={(event) => setDraft({ ...draft, tags: event.target.value })} /></label>
            <label className="admin-form-wide">Requirements<input placeholder="3.0 GPA, Python experience" value={draft.requirements} onChange={(event) => setDraft({ ...draft, requirements: event.target.value })} /></label>
            <button className="primary-dashboard-button admin-form-submit" type="submit" disabled={saving}>{saving ? 'Creating...' : 'Create project'}</button>
          </form>
        )}

        {message && <p className="admin-inline-error" role="alert">{message}</p>}

        <div className="admin-toolbar">
          <label className="dashboard-search admin-search"><Search size={18} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search projects, faculty or department" /></label>
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>{statuses.map((status) => <option key={status}>{status}</option>)}</select>
        </div>

        <div className="admin-management-grid">
          <div className="admin-table">
            <div className="admin-table__header admin-project-table-grid">
              <span>Project</span><span>Supervisor</span><span>Applicants</span><span>Status</span><span>Action</span>
            </div>
            {visible.length ? visible.map((project) => (
              <button
                type="button"
                key={project.id}
                className={`admin-table__row admin-project-table-grid admin-table-button ${String(selected?.id) === String(project.id) ? 'is-selected' : ''}`}
                onClick={() => setSelectedId(project.id)}
              >
                <span><strong>{project.title}</strong><small>{project.department || project.type || 'Research project'}</small></span>
                <span>{project.supervisor || 'Unassigned'}</span>
                <span>{applicationCounts[String(project.id)] || 0}</span>
                <span><em className={statusClass(project.status || 'Open')}>{project.status || 'Open'}</em></span>
                <span className="admin-row-action">View <ChevronRight size={14} /></span>
              </button>
            )) : <EmptyState icon={BriefcaseBusiness} title="No projects found" text="Create a project or change the current filters." />}
          </div>

          {selected && (
            <aside className="admin-project-detail">
              <div>
                <span className={statusClass(selected.status || 'Open')}>{selected.status || 'Open'}</span>
                <button className="admin-project-more-button" type="button" aria-label={`Open full details for ${selected.title}`} onClick={() => setShowProjectDetails(true)}><MoreHorizontal size={18} /></button>
              </div>
              <h3>{selected.title}</h3>
              <p>{selected.description || 'No project description has been added.'}</p>
              <dl>
                <div><dt>Supervisor</dt><dd>{selected.supervisor || 'Unassigned'}</dd></div>
                <div><dt>Department</dt><dd>{selected.department || 'Not set'}</dd></div>
                <div><dt>Deadline</dt><dd>{formatDate(selected.deadline || selected.end_date)}</dd></div>
                <div><dt>Applications</dt><dd>{applicationCounts[String(selected.id)] || 0}</dd></div>
              </dl>
              <footer className="admin-project-actions">
                <button type="button" onClick={() => updateProjectStatus(selected, 'Completed')}>Complete</button>
                <button className="admin-danger-button" type="button" onClick={() => updateProjectStatus(selected, 'Archived')}>Archive</button>
                <button className="admin-danger-button" type="button" onClick={() => deleteProject(selected)} disabled={deletingProject}>{deletingProject ? 'Deleting…' : 'Delete project'}</button>
              </footer>
            </aside>
          )}
        </div>

        {showProjectDetails && selected && (
          <div className="admin-project-modal-backdrop" role="presentation" onClick={() => setShowProjectDetails(false)}>
            <section className="admin-project-modal" role="dialog" aria-modal="true" aria-labelledby="project-details-title" onClick={(event) => event.stopPropagation()}>
              <header>
                <div><span className={statusClass(selected.status || 'Open')}>{selected.status || 'Open'}</span><h2 id="project-details-title">{selected.title}</h2></div>
                <button type="button" aria-label="Close project details" onClick={() => setShowProjectDetails(false)}><X size={20} /></button>
              </header>
              <p>{selected.description || 'No project description has been added.'}</p>
              <dl>
                <div><dt>Program type</dt><dd>{selected.type || 'Not set'}</dd></div>
                <div><dt>Department</dt><dd>{selected.department || 'Not set'}</dd></div>
                <div><dt>Supervisor</dt><dd>{selected.supervisor || 'Unassigned'}</dd></div>
                <div><dt>Deadline</dt><dd>{formatDate(selected.deadline || selected.end_date)}</dd></div>
                <div><dt>Commitment</dt><dd>{selected.commitment || 'Not set'}</dd></div>
                <div><dt>Applications</dt><dd>{applicationCounts[String(selected.id)] || 0}</dd></div>
              </dl>
              <div className="admin-project-modal__section"><h3>Skills / tags</h3><p>{Array.isArray(selected.tags) && selected.tags.length ? selected.tags.join(', ') : 'No skills or tags added.'}</p></div>
              <div className="admin-project-modal__section"><h3>Requirements</h3><p>{Array.isArray(selected.requirements) && selected.requirements.length ? selected.requirements.join(', ') : 'No requirements added.'}</p></div>
              <div className="admin-project-modal__section"><h3>Milestones</h3>{data.milestones.filter((item) => String(item.opportunity_id) === String(selected.id)).length ? <div className="admin-project-modal__milestones">{data.milestones.filter((item) => String(item.opportunity_id) === String(selected.id)).map((milestone) => <div key={milestone.id}><span><strong>{milestone.title}</strong><small>Due {formatDate(milestone.due_date)}</small></span><em className={statusClass(milestone.status)}>{milestone.status}</em></div>)}</div> : <p>No milestones recorded.</p>}</div>
            </section>
          </div>
        )}
      </section>
    </div>
  )
}

function UserManagement({ data, onReload, logActivity }) {
  const [query, setQuery] = useState('')
  const [roleFilter, setRoleFilter] = useState('All')
  const [selectedId, setSelectedId] = useState(null)
  const [showCreate, setShowCreate] = useState(false)
  const [message, setMessage] = useState('')
  const [creating, setCreating] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [editingProfile, setEditingProfile] = useState(false)
  const [savingProfile, setSavingProfile] = useState(false)
  const [profileDraft, setProfileDraft] = useState(() => createManagedProfileDraft(null))
  const [draft, setDraft] = useState({ full_name: '', email: '', password: '', university_id: '', role: 'student', department: 'Computer Science' })
  const [showTemporaryPassword, setShowTemporaryPassword] = useState(false)

  const visible = useMemo(() => data.profiles.filter((person) => {
    const haystack = `${person.full_name || ''} ${person.email || ''} ${person.university_id || ''} ${person.department || ''}`.toLowerCase()
    const matchesQuery = haystack.includes(query.toLowerCase())
    const matchesRole = roleFilter === 'All' || person.role === roleFilter.toLowerCase()
    return matchesQuery && matchesRole
  }), [data.profiles, query, roleFilter])

  const selected = data.profiles.find((person) => person.id === selectedId) || visible[0]
  const selectedAdminProfile = selected?.role === 'admin'
    ? data.adminProfiles.find((item) => String(item.user_id) === String(selected.id))
    : null

  async function updateUser(person, changes) {
    setMessage('')
    const { error } = await supabase.from('profiles').update({ ...changes, updated_at: new Date().toISOString() }).eq('id', person.id)

    if (error) {
      console.error('User update error:', error)
      setMessage(error.message)
      return
    }

    await logActivity('user_updated', 'profile', person.id, `Updated ${person.full_name || person.email}.`)
    await onReload()
  }

  function beginProfileEdit(person) {
    setProfileDraft(createManagedProfileDraft(person))
    setMessage('')
    setEditingProfile(true)
  }

  function cancelProfileEdit() {
    setEditingProfile(false)
    setMessage('')
  }

  async function saveManagedProfile(event) {
    event.preventDefault()
    if (!selected || !['student', 'faculty'].includes(selected.role)) return

    const gpa = profileDraft.gpa === '' ? null : Number(profileDraft.gpa)
    const graduationYear = profileDraft.expected_graduation_year === '' ? null : Number(profileDraft.expected_graduation_year)
    if (gpa !== null && (!Number.isFinite(gpa) || gpa < 0 || gpa > 4)) {
      setMessage('GPA must be between 0.00 and 4.00.')
      return
    }
    if (graduationYear !== null && (!Number.isInteger(graduationYear) || graduationYear < 2026 || graduationYear > 2100)) {
      setMessage('Expected graduation year must be between 2026 and 2100.')
      return
    }

    const changes = {
      university_id: profileDraft.university_id.trim(),
      department: profileDraft.department.trim(),
      research_experience: profileDraft.research_experience.trim(),
      research_interests: textToProfileList(profileDraft.research_interests),
      skills: textToProfileList(profileDraft.skills),
      updated_at: new Date().toISOString(),
    }

    if (selected.role === 'student') {
      Object.assign(changes, {
        major: profileDraft.major.trim(),
        year_of_study: profileDraft.year_of_study.trim(),
        gpa,
        expected_graduation_year: graduationYear,
      })
    }

    setSavingProfile(true)
    setMessage('')
    const fullName = profileDraft.full_name.trim()
    const email = profileDraft.email.trim()
    const identityChanged = fullName !== (selected.full_name || '').trim()
      || email.toLowerCase() !== (selected.email || '').trim().toLowerCase()

    if (identityChanged) {
      const { error: identityError } = await supabase.functions.invoke('admin-update-user', {
        body: {
          user_id: selected.id,
          full_name: fullName,
          email,
        },
      })

      if (identityError) {
        setSavingProfile(false)
        console.error('Managed user identity update error:', identityError)
        setMessage(identityError.message)
        return
      }
    }

    const { error } = await supabase.from('profiles').update(changes).eq('id', selected.id)
    setSavingProfile(false)

    if (error) {
      console.error('Managed profile update error:', error)
      setMessage(error.message)
      return
    }

    await logActivity('profile_updated', 'profile', selected.id, `Edited ${selected.role} profile for ${profileDraft.full_name.trim() || selected.email}.`)
    setEditingProfile(false)
    await onReload()
  }

  async function createUser(event) {
    event.preventDefault()
    setCreating(true)
    setMessage('')

    const { data: response, error } = await supabase.functions.invoke('admin-create-user', {
      body: draft,
    })

    if (error || response?.error) {
      console.error('Create user error:', error || response?.error)
      setMessage(response?.error || error?.message || 'Could not create the user.')
      setCreating(false)
      return
    }

    await logActivity('user_created', 'profile', response?.user?.id, `Created ${draft.role} account for ${draft.full_name}.`)
    setDraft({ full_name: '', email: '', password: '', university_id: '', role: 'student', department: 'Computer Science' })
    setShowCreate(false)
    setCreating(false)
    await onReload()
  }

  async function deleteUser(person) {
    const name = person.full_name || person.email || 'this user'
    if (!window.confirm(`Delete ${name}? This permanently removes their account and cannot be undone.`)) return

    setDeleting(true)
    setMessage('')
    const { data: response, error } = await supabase.functions.invoke('admin-delete-user', {
      body: { user_id: person.id },
    })

    if (error || response?.error) {
      console.error('Delete user error:', error || response?.error)
      setMessage(response?.error || error?.message || 'Could not delete the user.')
      setDeleting(false)
      return
    }

    await logActivity('user_deleted', 'profile', person.id, `Deleted user account for ${name}.`)
    setSelectedId(null)
    setDeleting(false)
    await onReload()
  }

  return (
    <div className="dashboard-section admin-dashboard-section">
      <section className="content-card">
        <PageHeading
          eyebrow="Authorized accounts"
          title="University users"
          description="Manage students, faculty and administrators."
          action={<button className="primary-dashboard-button" type="button" onClick={() => setShowCreate((current) => !current)}>{showCreate ? <><X size={15} /> Close</> : <><UserPlus size={15} /> Add user</>}</button>}
        />

        {showCreate && (
          <form className="admin-user-create-form admin-inline-form" onSubmit={createUser}>
            <label>Full name<input required value={draft.full_name} onChange={(event) => setDraft({ ...draft, full_name: event.target.value })} /></label>
            <label>University ID
              <input
                required
                type="text"
                inputMode="numeric"
                autoComplete="off"
                maxLength={9}
                pattern="[0-9]{9}"
                placeholder="Enter 9-digit university ID"
                value={draft.university_id}
                onChange={(event) => {
                  const universityId = event.target.value.replace(/\D/g, '').slice(0, 9)
                  setDraft({ ...draft, university_id: universityId })
                }}
              />
            </label>
            <label>Email<input required type="email" value={draft.email} onChange={(event) => setDraft({ ...draft, email: event.target.value })} /></label>
            <label>
              Temporary password
              <span className="admin-password-field">
                <input required minLength="10" type={showTemporaryPassword ? 'text' : 'password'} value={draft.password} onChange={(event) => setDraft({ ...draft, password: event.target.value })} />
                <button type="button" onClick={() => setShowTemporaryPassword((current) => !current)} aria-label={showTemporaryPassword ? 'Hide temporary password' : 'Show temporary password'} title={showTemporaryPassword ? 'Hide password' : 'Show password'}>
                  {showTemporaryPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </span>
            </label>
            <label>Role<select value={draft.role} onChange={(event) => setDraft({ ...draft, role: event.target.value })}><option value="student">Student</option><option value="faculty">Faculty</option><option value="admin">Admin</option></select></label>
            <label>Department<input value={draft.department} onChange={(event) => setDraft({ ...draft, department: event.target.value })} /></label>
            <p className="admin-form-note admin-form-wide">This form requires the <strong>admin-create-user</strong> Supabase Edge Function included with the migration files.</p>
            <button className="primary-dashboard-button admin-form-submit" disabled={creating} type="submit">{creating ? 'Creating...' : 'Create account'}</button>
          </form>
        )}

        {message && <p className="admin-inline-error" role="alert">{message}</p>}

        <div className="admin-toolbar">
          <label className="dashboard-search admin-search"><Search size={18} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name, email or university ID" /></label>
          <select value={roleFilter} onChange={(event) => setRoleFilter(event.target.value)}><option>All</option><option>Student</option><option>Faculty</option><option>Admin</option></select>
        </div>

        <div className="admin-management-grid">
          <div className="admin-table">
            <div className="admin-table__header admin-user-table-grid"><span>User</span><span>University ID</span><span>Role</span><span>Department</span><span>Status</span></div>
            {visible.length ? visible.map((person) => (
              <button type="button" key={person.id} className={`admin-table__row admin-user-table-grid admin-table-button ${selected?.id === person.id ? 'is-selected' : ''}`} onClick={() => { setSelectedId(person.id); setEditingProfile(false); setMessage('') }}>
                <span><strong>{person.full_name || 'Unnamed user'}</strong><small>{person.email || 'No email in profile'}</small></span>
                <span>{person.university_id || '—'}</span>
                <span>{person.role || 'student'}</span>
                <span>{person.department || person.major || '—'}</span>
                <span><em className={statusClass(person.account_status || 'Active')}>{person.account_status || 'Active'}</em></span>
              </button>
            )) : <EmptyState icon={UsersRound} title="No users found" text="Try a different search or role filter." />}
          </div>

          {selected && (
            <aside className="admin-user-detail">
              <div className="admin-user-detail__identity">
                <span>{getInitials(selected.full_name)}</span>
                <div><h3>{selected.full_name || 'Unnamed user'}</h3><p>{selected.email || 'No email recorded'}</p></div>
              </div>
              <dl>
                <div><dt>University ID</dt><dd>{selected.university_id || 'Not set'}</dd></div>
                <div><dt>Department</dt><dd>{selected.department || selected.major || 'Not set'}</dd></div>
                <div><dt>Role</dt><dd>{selected.role || 'student'}</dd></div>
                {selected.role === 'admin' && (
                  <>
                    <div><dt>Job title</dt><dd>{selectedAdminProfile?.job_title || 'Not set'}</dd></div>
                    <div><dt>Office</dt><dd>{selectedAdminProfile?.office || 'Not set'}</dd></div>
                    <div><dt>Admin level</dt><dd>{selectedAdminProfile?.admin_level || 'standard'}</dd></div>
                  </>
                )}
                <div><dt>Joined</dt><dd>{formatDate(selected.created_at)}</dd></div>
              </dl>

              <label className="admin-select-label">Role
                <select value={selected.role || 'student'} onChange={(event) => updateUser(selected, { role: event.target.value })}>
                  <option value="student">Student</option><option value="faculty">Faculty</option><option value="admin">Admin</option>
                </select>
              </label>

              {['student', 'faculty'].includes(selected.role) && (
                editingProfile ? (
                  <form className="admin-managed-profile-form" onSubmit={saveManagedProfile}>
                    <div className="admin-managed-profile-form__heading">
                      <div><h4>Edit {selected.role} profile</h4><p>Changes are visible in the user’s profile immediately after saving.</p></div>
                      <button type="button" onClick={cancelProfileEdit}>Cancel</button>
                    </div>
                    <div className="admin-managed-profile-form__fields">
                      <label>Full name<input required value={profileDraft.full_name} onChange={(event) => setProfileDraft({ ...profileDraft, full_name: event.target.value })} /></label>
                      <label>Email<input required type="email" value={profileDraft.email} onChange={(event) => setProfileDraft({ ...profileDraft, email: event.target.value })} /></label>
                      <label>University ID<input value={profileDraft.university_id} onChange={(event) => setProfileDraft({ ...profileDraft, university_id: event.target.value })} /></label>
                      <label>Department<input value={profileDraft.department} onChange={(event) => setProfileDraft({ ...profileDraft, department: event.target.value })} /></label>
                      {selected.role === 'student' && <label>Major<input value={profileDraft.major} onChange={(event) => setProfileDraft({ ...profileDraft, major: event.target.value })} /></label>}
                      {selected.role === 'student' && <label>Year of study<input placeholder="For example, Year 3" value={profileDraft.year_of_study} onChange={(event) => setProfileDraft({ ...profileDraft, year_of_study: event.target.value })} /></label>}
                      {selected.role === 'student' && <label>GPA<input type="number" min="0" max="4" step="0.01" value={profileDraft.gpa} onChange={(event) => setProfileDraft({ ...profileDraft, gpa: event.target.value })} /></label>}
                      {selected.role === 'student' && <label>Expected graduation year<input type="number" min="2026" max="2100" value={profileDraft.expected_graduation_year} onChange={(event) => setProfileDraft({ ...profileDraft, expected_graduation_year: event.target.value })} /></label>}
                      <label className="admin-managed-profile-form__wide">Research interests<textarea value={profileDraft.research_interests} onChange={(event) => setProfileDraft({ ...profileDraft, research_interests: event.target.value })} placeholder="Separate items with commas" /></label>
                      <label className="admin-managed-profile-form__wide">{selected.role === 'faculty' ? 'Areas of expertise' : 'Skills'}<textarea value={profileDraft.skills} onChange={(event) => setProfileDraft({ ...profileDraft, skills: event.target.value })} placeholder="Separate items with commas" /></label>
                      <label className="admin-managed-profile-form__wide">Research experience / biography<textarea value={profileDraft.research_experience} onChange={(event) => setProfileDraft({ ...profileDraft, research_experience: event.target.value })} /></label>
                    </div>
                    <button className="primary-dashboard-button" disabled={savingProfile} type="submit">{savingProfile ? 'Saving...' : 'Save profile changes'}</button>
                  </form>
                ) : (
                  <button className="admin-edit-profile-button" type="button" onClick={() => beginProfileEdit(selected)}><Edit3 size={14} /> Edit {selected.role} profile</button>
                )
              )}

              <div className="admin-user-actions">
                {(selected.account_status || 'active') !== 'suspended' ? (
                  <button className="admin-danger-button" type="button" onClick={() => updateUser(selected, { account_status: 'suspended' })}>Suspend access</button>
                ) : (
                  <button type="button" onClick={() => updateUser(selected, { account_status: 'active' })}>Restore access</button>
                )}
                <button className="admin-danger-button" type="button" disabled={deleting} onClick={() => deleteUser(selected)}>{deleting ? 'Deleting...' : 'Delete user'}</button>
              </div>
            </aside>
          )}
        </div>
      </section>
    </div>
  )
}

function ProgressTracking({ data, onReload, logActivity }) {
  const [selectedMetric, setSelectedMetric] = useState(null)
  const [selectedProject, setSelectedProject] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [editingMilestone, setEditingMilestone] = useState(null)
  const [message, setMessage] = useState('')
  const [draft, setDraft] = useState({ opportunity_id: '', title: '', due_date: '', status: 'Pending' })

  const projects = data.projects.filter((item) => !['archived', 'completed'].includes(normalizeStatus(item.status).toLowerCase()))

  function resetMilestoneForm() {
    setEditingMilestone(null)
    setDraft({ opportunity_id: '', title: '', due_date: '', status: 'Pending' })
    setShowForm(false)
  }

  function editMilestone(milestone) {
    setEditingMilestone(milestone)
    setDraft({ opportunity_id: String(milestone.opportunity_id), title: milestone.title, due_date: milestone.due_date?.slice(0, 10) || '', status: normalizeStatus(milestone.status) })
    setMessage('')
    setSelectedProject(null)
    setShowForm(true)
  }

  async function deleteMilestone(milestone) {
    if (!window.confirm(`Delete milestone “${milestone.title}”? This permanently removes the milestone.`)) return
    setSaving(true)
    setMessage('')
    try {
      const { data: deleted, error } = await supabase.from('project_milestones').delete().eq('id', milestone.id).select('id').single()
      if (error) throw error
      if (!deleted) throw new Error('The milestone could not be deleted. Refresh and try again.')
      await logActivity('milestone_deleted', 'milestone', milestone.id, `Deleted milestone “${milestone.title}”.`)
      if (editingMilestone?.id === milestone.id) resetMilestoneForm()
      await onReload()
    } catch (error) {
      setMessage(error.message)
    } finally {
      setSaving(false)
    }
  }

  async function createMilestone(event) {
    event.preventDefault()
    if (!draft.title.trim()) {
      setMessage('Enter a milestone title.')
      return
    }
    setSaving(true)
    setMessage('')

    const payload = {
      opportunity_id: String(draft.opportunity_id),
      title: draft.title.trim(),
      due_date: draft.due_date || null,
      status: draft.status,
      completed_at: draft.status === 'Completed' ? (editingMilestone?.completed_at || new Date().toISOString()) : null,
    }
    const query = editingMilestone
      ? supabase.from('project_milestones').update(payload).eq('id', editingMilestone.id)
      : supabase.from('project_milestones').insert(payload)
    const { data: created, error } = await query.select('*').single()

    if (error) {
      console.error('Milestone create error:', error)
      setMessage(error.message)
      setSaving(false)
      return
    }

    const project = data.projects.find((item) => String(item.id) === String(draft.opportunity_id))
    if (!editingMilestone) await logActivity('milestone_created', 'milestone', created?.id, `Added milestone “${draft.title}” to ${project?.title || 'a project'}.`)
    if (editingMilestone) await logActivity('milestone_updated', 'milestone', created.id, `Updated milestone “${draft.title.trim()}”.`)
    resetMilestoneForm()
    setSaving(false)
    await onReload()
  }

  async function completeMilestone(milestone) {
    const { error } = await supabase.from('project_milestones').update({ status: 'Completed', completed_at: new Date().toISOString() }).eq('id', milestone.id)
    if (error) {
      setMessage(error.message)
      return
    }
    await logActivity('milestone_completed', 'milestone', milestone.id, `Marked milestone “${milestone.title}” as completed.`)
    await onReload()
  }

  const overdue = data.milestones.filter((item) => {
    const due = daysUntil(item.due_date)
    return due !== null && due < 0 && normalizeStatus(item.status).toLowerCase() !== 'completed'
  })

  const dueSoon = data.milestones.filter((item) => {
    const due = daysUntil(item.due_date)
    return due !== null && due >= 0 && due <= 14 && normalizeStatus(item.status).toLowerCase() !== 'completed'
  })
  const completed = data.milestones.filter((item) => normalizeStatus(item.status).toLowerCase() === 'completed')

  return (
    <div className="dashboard-section admin-dashboard-section">
      <div className="admin-kpi-grid admin-kpi-grid--compact">
        <MetricCard icon={BriefcaseBusiness} value={projects.length} label="Active projects" helper="Currently underway" tone="gold" onClick={() => setSelectedMetric('projects')} isSelected={selectedMetric === 'projects'} />
        <MetricCard icon={AlertTriangle} value={overdue.length} label="Overdue milestones" helper="Require intervention" tone="rose" onClick={() => setSelectedMetric('overdue')} isSelected={selectedMetric === 'overdue'} />
        <MetricCard icon={Clock3} value={dueSoon.length} label="Due soon" helper="Within the next 14 days" tone="blue" onClick={() => setSelectedMetric('dueSoon')} isSelected={selectedMetric === 'dueSoon'} />
        <MetricCard icon={CheckCircle2} value={completed.length} label="Completed" helper="Milestones finished" tone="green" onClick={() => setSelectedMetric('completed')} isSelected={selectedMetric === 'completed'} />
      </div>

      {selectedMetric === 'projects' && <MetricResults title="Active projects" items={projects} renderItem={(project) => <div key={project.id}><strong>{project.title}</strong><span>{project.supervisor || 'No supervisor'} · {project.status || 'Open'}</span></div>} />}
      {['overdue', 'dueSoon', 'completed'].includes(selectedMetric) && <MetricResults title={selectedMetric === 'overdue' ? 'Overdue milestones' : selectedMetric === 'dueSoon' ? 'Milestones due soon' : 'Completed milestones'} items={selectedMetric === 'overdue' ? overdue : selectedMetric === 'dueSoon' ? dueSoon : completed} renderItem={(milestone) => <div key={milestone.id}><strong>{milestone.title}</strong><span>{projects.find((project) => String(project.id) === String(milestone.opportunity_id))?.title || 'Research project'} · Due {formatDate(milestone.due_date)}</span></div>} />}

      <section className="content-card">
        <PageHeading eyebrow="Projects" title="Progress tracking" description="Monitor milestones, deadlines and project delivery." action={<button className="primary-dashboard-button" type="button" disabled={saving} onClick={() => { resetMilestoneForm(); setMessage(''); setShowForm(true) }}><Plus size={15} /> Milestone</button>} />

        {showForm && (
          <form className="admin-milestone-form admin-inline-form" onSubmit={createMilestone}>
            <label>Project<select required value={draft.opportunity_id} onChange={(event) => setDraft({ ...draft, opportunity_id: event.target.value })}><option value="">Select project</option>{data.projects.map((project) => <option key={project.id} value={project.id}>{project.title}</option>)}</select></label>
            <label>Milestone title<input required value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} /></label>
            <label>Due date<input required type="date" value={draft.due_date} onChange={(event) => setDraft({ ...draft, due_date: event.target.value })} /></label>
            <label>Status<select value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value })}><option>Pending</option><option>In Progress</option><option>Completed</option></select></label>
            <button className="primary-dashboard-button admin-form-submit" disabled={saving} type="submit">{saving ? 'Saving...' : editingMilestone ? 'Save changes' : 'Add milestone'}</button>
            <button type="button" disabled={saving} onClick={resetMilestoneForm}>Cancel</button>
          </form>
        )}
        {message && <p className="admin-inline-error" role="alert">{message}</p>}

        <div className="admin-progress-list">
          {projects.length ? projects.map((project) => {
            const projectMilestones = data.milestones.filter((item) => String(item.opportunity_id) === String(project.id))
            const completed = projectMilestones.filter((item) => normalizeStatus(item.status).toLowerCase() === 'completed').length
            const progress = projectMilestones.length ? Math.round((completed / projectMilestones.length) * 100) : 0
            return (
              <article key={project.id}>
                <header>
                  <div><span className={statusClass(project.status || 'Open')}>{project.status || 'Open'}</span><h3><button className="admin-progress-project-title" type="button" onClick={() => setSelectedProject(project)}>{project.title}</button></h3><p>{project.supervisor || 'No supervisor'} · {project.department || 'Department not set'}</p></div>
                  <strong className="admin-progress-percent">{progress}%</strong>
                </header>
                <div className="admin-progress-track"><i style={{ width: `${progress}%` }} /></div>
                <div className="admin-milestones">
                  {projectMilestones.length ? projectMilestones.map((milestone) => (
                    <div key={milestone.id}>
                      <span><strong>{milestone.title}</strong><small>Due {formatDate(milestone.due_date)}</small></span>
                      <span className="admin-milestone-actions"><em className={statusClass(milestone.status)}>{milestone.status}</em>{normalizeStatus(milestone.status).toLowerCase() !== 'completed' && <button type="button" disabled={saving} onClick={() => completeMilestone(milestone)}>Complete</button>}<button type="button" disabled={saving} onClick={() => editMilestone(milestone)}>Edit</button><button className="admin-danger-button" type="button" disabled={saving} onClick={() => deleteMilestone(milestone)}>Delete</button></span>
                    </div>
                  )) : <p className="admin-muted-copy">No milestones recorded for this project.</p>}
                </div>
              </article>
            )
          }) : <EmptyState icon={ClipboardList} title="No active projects" text="Active projects will appear here when they are created." />}
        </div>

        {selectedProject && (
          <div className="admin-project-modal-backdrop" role="presentation" onClick={() => setSelectedProject(null)}>
            <section className="admin-project-modal" role="dialog" aria-modal="true" aria-labelledby="progress-project-details-title" onClick={(event) => event.stopPropagation()}>
              <header>
                <div>
                  <span className={statusClass(selectedProject.status || 'Open')}>{selectedProject.status || 'Open'}</span>
                  <h2 id="progress-project-details-title">{selectedProject.title}</h2>
                </div>
                <button type="button" aria-label="Close project details" onClick={() => setSelectedProject(null)}><X size={20} /></button>
              </header>
              <p>{selectedProject.description || 'No project description has been added.'}</p>
              <dl>
                <div><dt>Program type</dt><dd>{selectedProject.type || 'Not set'}</dd></div>
                <div><dt>Department</dt><dd>{selectedProject.department || 'Not set'}</dd></div>
                <div><dt>Supervisor</dt><dd>{selectedProject.supervisor || 'Unassigned'}</dd></div>
                <div><dt>Deadline</dt><dd>{formatDate(selectedProject.deadline || selectedProject.end_date)}</dd></div>
                <div><dt>Commitment</dt><dd>{selectedProject.commitment || 'Not set'}</dd></div>
              </dl>
              <div className="admin-project-modal__section"><h3>Skills / tags</h3><p>{Array.isArray(selectedProject.tags) && selectedProject.tags.length ? selectedProject.tags.join(', ') : 'No skills or tags added.'}</p></div>
              <div className="admin-project-modal__section"><h3>Requirements</h3><p>{Array.isArray(selectedProject.requirements) && selectedProject.requirements.length ? selectedProject.requirements.join(', ') : 'No requirements added.'}</p></div>
              <div className="admin-project-modal__section">
                <h3>Milestones</h3>
                {data.milestones.filter((item) => String(item.opportunity_id) === String(selectedProject.id)).length ? (
                  <div className="admin-project-modal__milestones">
                    {data.milestones.filter((item) => String(item.opportunity_id) === String(selectedProject.id)).map((milestone) => <div key={milestone.id}><span><strong>{milestone.title}</strong><small>Due {formatDate(milestone.due_date)}</small></span><em className={statusClass(milestone.status)}>{milestone.status}</em></div>)}
                  </div>
                ) : <p>No milestones recorded.</p>}
              </div>
            </section>
          </div>
        )}
      </section>
    </div>
  )
}

function ProjectOversight({ data }) {
  const [riskFilter, setRiskFilter] = useState('All')
  const [selectedProject, setSelectedProject] = useState(null)

  const rows = data.projects.map((project) => {
    const risk = riskForProject(project, data.milestones)
    const applicationCount = data.applications.filter((application) => String(application.opportunity_id) === String(project.id)).length
    return { project, risk, applicationCount }
  })

  const visible = riskFilter === 'All' ? rows : rows.filter((row) => row.risk.level === riskFilter)

  return (
    <div className="dashboard-section admin-dashboard-section">
      <div className="admin-kpi-grid admin-kpi-grid--compact">
        <MetricCard icon={AlertTriangle} value={rows.filter((row) => row.risk.level === 'High').length} label="High risk" helper="Immediate review" tone="rose" onClick={() => setRiskFilter('High')} isSelected={riskFilter === 'High'} />
        <MetricCard icon={Clock3} value={rows.filter((row) => row.risk.level === 'Medium').length} label="Medium risk" helper="Monitor closely" tone="gold" onClick={() => setRiskFilter('Medium')} isSelected={riskFilter === 'Medium'} />
        <MetricCard icon={CheckCircle2} value={rows.filter((row) => row.risk.level === 'Low').length} label="Healthy" helper="Currently on track" tone="green" onClick={() => setRiskFilter('Low')} isSelected={riskFilter === 'Low'} />
        <MetricCard icon={BriefcaseBusiness} value={rows.length} label="Projects reviewed" helper="Entire portfolio" tone="blue" onClick={() => setRiskFilter('All')} isSelected={riskFilter === 'All'} />
      </div>

      <section className="content-card">
        <PageHeading eyebrow="Research oversight" title="Portfolio risk review" description="Identify delayed or under-managed research projects." />
        <div className="admin-toolbar admin-toolbar--right"><select value={riskFilter} onChange={(event) => setRiskFilter(event.target.value)}><option>All</option><option>High</option><option>Medium</option><option>Low</option></select></div>
        <div className="admin-table">
          <div className="admin-table__header admin-oversight-table-grid"><span>Project</span><span>Supervisor</span><span>Risk</span><span>Reason</span><span>Applications</span></div>
          {visible.map(({ project, risk, applicationCount }) => (
            <button
              className="admin-table__row admin-oversight-table-grid admin-table-button"
              key={project.id}
              type="button"
              onClick={() => setSelectedProject({ project, risk, applicationCount })}
              aria-label={`View details for ${project.title}`}
            >
              <span><strong>{project.title}</strong><small>{project.department || project.type || 'Research project'}</small></span>
              <span>{project.supervisor || 'Unassigned'}</span>
              <span><em className={`admin-risk admin-risk--${risk.level.toLowerCase()}`}>{risk.level}</em></span>
              <span>{risk.reason}</span>
              <span>{applicationCount}</span>
            </button>
          ))}
        </div>
      </section>

      {selectedProject && (
        <div className="admin-project-modal-backdrop" role="presentation" onClick={() => setSelectedProject(null)}>
          <section className="admin-project-modal" role="dialog" aria-modal="true" aria-labelledby="oversight-project-details-title" onClick={(event) => event.stopPropagation()}>
            <header>
              <div>
                <span className={`admin-risk admin-risk--${selectedProject.risk.level.toLowerCase()}`}>{selectedProject.risk.level} risk</span>
                <h2 id="oversight-project-details-title">{selectedProject.project.title}</h2>
              </div>
              <button type="button" aria-label="Close project details" onClick={() => setSelectedProject(null)}><X size={20} /></button>
            </header>
            <p>{selectedProject.project.description || 'No project description has been added.'}</p>
            <dl>
              <div><dt>Supervisor</dt><dd>{selectedProject.project.supervisor || 'Unassigned'}</dd></div>
              <div><dt>Department</dt><dd>{selectedProject.project.department || 'Not set'}</dd></div>
              <div><dt>Program type</dt><dd>{selectedProject.project.type || 'Not set'}</dd></div>
              <div><dt>Deadline</dt><dd>{formatDate(selectedProject.project.deadline || selectedProject.project.end_date)}</dd></div>
              <div><dt>Applications</dt><dd>{selectedProject.applicationCount}</dd></div>
              <div><dt>Risk reason</dt><dd>{selectedProject.risk.reason}</dd></div>
            </dl>
            <div className="admin-project-modal__section"><h3>Skills / tags</h3><p>{Array.isArray(selectedProject.project.tags) && selectedProject.project.tags.length ? selectedProject.project.tags.join(', ') : 'No skills or tags added.'}</p></div>
            <div className="admin-project-modal__section"><h3>Milestones</h3>{data.milestones.filter((item) => String(item.opportunity_id) === String(selectedProject.project.id)).length ? <div className="admin-project-modal__milestones">{data.milestones.filter((item) => String(item.opportunity_id) === String(selectedProject.project.id)).map((milestone) => <div key={milestone.id}><span><strong>{milestone.title}</strong><small>Due {formatDate(milestone.due_date)}</small></span><em className={statusClass(milestone.status)}>{milestone.status}</em></div>)}</div> : <p>No milestones recorded.</p>}</div>
          </section>
        </div>
      )}
    </div>
  )
}

function ImpactAnalytics({ data }) {
  const [selectedMetric, setSelectedMetric] = useState(null)
  const projectDepartments = data.projects.reduce((accumulator, item) => {
    const key = item.department || 'Unspecified'
    accumulator[key] = (accumulator[key] || 0) + 1
    return accumulator
  }, {})

  const roles = data.profiles.reduce((accumulator, item) => {
    const key = normalizeStatus(item.role, 'student')
    accumulator[key] = (accumulator[key] || 0) + 1
    return accumulator
  }, {})

  const applicationStatuses = data.applications.reduce((accumulator, item) => {
    const key = normalizeStatus(item.status, 'Submitted')
    accumulator[key] = (accumulator[key] || 0) + 1
    return accumulator
  }, {})

  const completedProjects = data.projects.filter((item) => normalizeStatus(item.status).toLowerCase() === 'completed').length
  const completionRate = data.projects.length ? Math.round((completedProjects / data.projects.length) * 100) : 0
  const facultyCount = data.profiles.filter((item) => item.role === 'faculty').length
  const studentCount = data.profiles.filter((item) => item.role === 'student').length

  const renderBars = (values) => {
    const maximum = Math.max(1, ...Object.values(values))
    return Object.entries(values).sort((a, b) => b[1] - a[1]).map(([label, count]) => (
      <div key={label}><span>{label}</span><div><i style={{ width: `${Math.max(6, (count / maximum) * 100)}%` }} /></div><strong>{count}</strong></div>
    ))
  }

  return (
    <div className="dashboard-section admin-dashboard-section">
      <div className="admin-kpi-grid">
        <MetricCard icon={BriefcaseBusiness} value={data.projects.length} label="Research projects" helper="Across all departments" tone="gold" onClick={() => setSelectedMetric('projects')} isSelected={selectedMetric === 'projects'} />
        <MetricCard icon={CircleUserRound} value={studentCount} label="Student researchers" helper="Registered student accounts" tone="blue" onClick={() => setSelectedMetric('students')} isSelected={selectedMetric === 'students'} />
        <MetricCard icon={UsersRound} value={facultyCount} label="Faculty supervisors" helper="Registered faculty accounts" tone="green" onClick={() => setSelectedMetric('faculty')} isSelected={selectedMetric === 'faculty'} />
        <MetricCard icon={TrendingUp} value={`${completionRate}%`} label="Completion rate" helper={`${completedProjects} completed projects`} tone="rose" onClick={() => setSelectedMetric('completed')} isSelected={selectedMetric === 'completed'} />
      </div>

      {selectedMetric === 'projects' && <MetricResults title="Research projects" items={data.projects} renderItem={(project) => <div key={project.id}><strong>{project.title}</strong><span>{project.department || 'No department'} · {project.status || 'Open'}</span></div>} />}
      {['students', 'faculty'].includes(selectedMetric) && <MetricResults title={selectedMetric === 'students' ? 'Student researchers' : 'Faculty supervisors'} items={data.profiles.filter((profile) => profile.role === (selectedMetric === 'students' ? 'student' : 'faculty'))} renderItem={(profile) => <div key={profile.id}><strong>{profile.full_name || profile.email || 'Unnamed user'}</strong><span>{profile.department || 'No department set'}</span></div>} />}
      {selectedMetric === 'completed' && <MetricResults title="Completed projects" items={data.projects.filter((project) => normalizeStatus(project.status).toLowerCase() === 'completed')} renderItem={(project) => <div key={project.id}><strong>{project.title}</strong><span>{project.department || 'No department'} · Completed</span></div>} />}

      <div className="admin-analytics-grid">
        <section className="content-card">
          <PageHeading eyebrow="Portfolio distribution" title="Projects by department" description="Where current research activity is concentrated." />
          <div className="admin-bar-chart">{Object.keys(projectDepartments).length ? renderBars(projectDepartments) : <p className="admin-muted-copy">No project data available.</p>}</div>
        </section>
        <section className="content-card">
          <PageHeading eyebrow="Community" title="Users by role" description="Current account composition." />
          <div className="admin-program-list">{Object.entries(roles).map(([role, count]) => <div key={role}><span>{role}</span><strong>{count}</strong></div>)}</div>
        </section>
      </div>

      <section className="content-card">
        <PageHeading eyebrow="Applications" title="Application outcomes" description="Current application pipeline by status." />
        <div className="admin-bar-chart admin-bar-chart--wide">{Object.keys(applicationStatuses).length ? renderBars(applicationStatuses) : <p className="admin-muted-copy">No applications have been submitted yet.</p>}</div>
      </section>
    </div>
  )
}

function Announcements({ data, profile, onReload, logActivity }) {
  const [draft, setDraft] = useState({ title: '', message: '', audience: 'everyone', priority: 'normal', expires_at: '' })
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  async function publish(event) {
    event.preventDefault()
    setSaving(true)
    setMessage('')

    const payload = {
      title: draft.title.trim(),
      message: draft.message.trim(),
      audience: draft.audience,
      priority: draft.priority,
      published_at: new Date().toISOString(),
      expires_at: draft.expires_at || null,
      created_by: profile?.id || null,
      is_active: true,
    }

    const { data: created, error } = await supabase.from('announcements').insert(payload).select('*').single()
    if (error) {
      console.error('Announcement create error:', error)
      setMessage(error.message)
      setSaving(false)
      return
    }

    await logActivity('announcement_published', 'announcement', created?.id, `Published “${payload.title}”.`)
    setDraft({ title: '', message: '', audience: 'everyone', priority: 'normal', expires_at: '' })
    setSaving(false)
    await onReload()
  }

  async function archive(item) {
    const { error } = await supabase.from('announcements').update({ is_active: false }).eq('id', item.id)
    if (error) {
      setMessage(error.message)
      return
    }
    await logActivity('announcement_archived', 'announcement', item.id, `Archived “${item.title}”.`)
    await onReload()
  }

  return (
    <div className="dashboard-section admin-dashboard-section">
      <div className="admin-announcements-grid">
        <section className="content-card">
          <PageHeading eyebrow="Communication" title="New announcement" description="Publish an update to the research community." />
          <form className="admin-announcement-form" onSubmit={publish}>
            <label>Title<input required value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} /></label>
            <label>Message<textarea required value={draft.message} onChange={(event) => setDraft({ ...draft, message: event.target.value })} /></label>
            <div className="admin-form-pair">
              <label>Audience<select value={draft.audience} onChange={(event) => setDraft({ ...draft, audience: event.target.value })}><option value="everyone">Everyone</option><option value="students">Students</option><option value="faculty">Faculty</option></select></label>
              <label>Priority<select value={draft.priority} onChange={(event) => setDraft({ ...draft, priority: event.target.value })}><option value="normal">Normal</option><option value="important">Important</option><option value="urgent">Urgent</option></select></label>
            </div>
            <label>Expiry date<input type="date" value={draft.expires_at} onChange={(event) => setDraft({ ...draft, expires_at: event.target.value })} /></label>
            {message && <p className="admin-inline-error" role="alert">{message}</p>}
            <button className="primary-dashboard-button" disabled={saving} type="submit"><Send size={15} /> {saving ? 'Publishing...' : 'Publish announcement'}</button>
          </form>
        </section>

        <section className="content-card">
          <PageHeading eyebrow="Published communication" title="Announcements" description="Current and archived administration notices." />
          <div className="admin-announcement-list">
            {data.announcements.length ? data.announcements.map((item) => (
              <article key={item.id} className={!item.is_active ? 'is-archived' : ''}>
                <span><Megaphone size={17} /></span>
                <div>
                  <div className="admin-announcement-title-row"><strong>{item.title}</strong><em className={statusClass(item.priority)}>{item.priority}</em></div>
                  <p>{item.message}</p>
                  <small>{item.audience} · Published {formatDate(item.published_at || item.created_at)}{item.expires_at ? ` · Expires ${formatDate(item.expires_at)}` : ''}</small>
                </div>
                {item.is_active && <button type="button" onClick={() => archive(item)}>Archive</button>}
              </article>
            )) : <EmptyState icon={Megaphone} title="No announcements yet" text="Publish the first research community announcement using the form." />}
          </div>
        </section>
      </div>
    </div>
  )
}

export default function AdminDashboard({ profile, onSignOut }) {
  const [activeTab, setActiveTab] = useState('overview')
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [data, setData] = useState({
    profiles: [],
    adminProfiles: [],
    projects: [],
    applications: [],
    ideas: [],
    milestones: [],
    announcements: [],
    activities: [],
  })

  async function loadAdminData() {
    setLoading(true)
    setLoadError('')

    const queries = await Promise.allSettled([
      supabase.from('profiles').select('*'),
      supabase.from('admin_profiles').select('*'),
      supabase.from('research_opportunities').select('*'),
      supabase.from('applications').select('*'),
      supabase.from('research_ideas').select('*'),
      supabase.from('project_milestones').select('*'),
      supabase.from('announcements').select('*'),
      supabase.from('admin_activity_log').select('*'),
    ])

    const names = ['profiles', 'adminProfiles', 'projects', 'applications', 'ideas', 'milestones', 'announcements', 'activities']
    const next = {}
    const errors = []

    queries.forEach((result, index) => {
      const name = names[index]

      if (result.status === 'fulfilled' && !result.value.error) {
        next[name] = result.value.data || []
      } else {
        const error = result.status === 'fulfilled' ? result.value.error : result.reason
        console.error(`Admin ${name} load error:`, error)
        next[name] = []
        errors.push(name)
      }
    })

    next.announcements = [...next.announcements].sort((a, b) => new Date(b.published_at || b.created_at || 0) - new Date(a.published_at || a.created_at || 0))
    next.activities = [...next.activities].sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))

    setData(next)

    if (errors.length) {
      setLoadError(`Some administration data could not be loaded: ${errors.join(', ')}. Run the Supabase admin migration if those tables are not installed yet.`)
    }

    setLoading(false)
  }

  useEffect(() => {
    loadAdminData()
  }, [profile?.id])

  useEffect(() => {
    document.title = 'UAEU Research Hub | Administration'

    return () => {
      document.title = 'UAEU Research Hub'
    }
  }, [])

  async function logActivity(action, entityType, entityId, description) {
    if (!profile?.id) return

    const { error } = await supabase.from('admin_activity_log').insert({
      admin_id: profile.id,
      action,
      entity_type: entityType,
      entity_id: entityId ? String(entityId) : null,
      description,
    })

    if (error) console.warn('Could not write admin activity log:', error.message)
  }

  const currentAdminProfile = useMemo(
    () => data.adminProfiles.find((item) => String(item.user_id) === String(profile?.id)) || null,
    [data.adminProfiles, profile?.id]
  )

  const notifications = useMemo(() => {
    const items = []
    const pendingApplications = data.applications.filter((item) => ['submitted', 'pending', 'under review'].includes(normalizeStatus(item.status).toLowerCase()))
    const overdueMilestones = data.milestones.filter((item) => {
      const due = daysUntil(item.due_date)
      return due !== null && due < 0 && normalizeStatus(item.status).toLowerCase() !== 'completed'
    })
    const pendingUsers = data.profiles.filter((item) => normalizeStatus(item.account_status, 'active').toLowerCase() === 'pending')

    if (pendingApplications.length) items.push({ id: 'applications', target: 'projects', level: 'info', title: `${pendingApplications.length} pending applications`, text: 'Research applications are waiting for review.' })
    if (overdueMilestones.length) items.push({ id: 'milestones', target: 'progress', level: 'danger', title: `${overdueMilestones.length} overdue milestones`, text: 'Project milestones have passed their due date.' })
    if (pendingUsers.length) items.push({ id: 'users', target: 'users', level: 'warning', title: `${pendingUsers.length} account reviews`, text: 'User accounts are awaiting administrative review.' })

    return items
  }, [data])

  const screens = {
    overview: <Overview data={data} profile={profile} onNavigate={setActiveTab} />,
    projects: <ProjectManagement data={data} onReload={loadAdminData} logActivity={logActivity} />,
    users: <UserManagement data={data} onReload={loadAdminData} logActivity={logActivity} />,
    progress: <ProgressTracking data={data} onReload={loadAdminData} logActivity={logActivity} />,
    oversight: <ProjectOversight data={data} />,
    analytics: <ImpactAnalytics data={data} />,
    announcements: <Announcements data={data} profile={profile} onReload={loadAdminData} logActivity={logActivity} />,
    messages: <SupabaseMessages profile={profile} eyebrow="Administration" />,
  }

  return (
    <div className="student-app">
      <Sidebar activeTab={activeTab} onTabChange={setActiveTab} onSignOut={onSignOut} />

      <div className="student-app__main">
        <Header
          activeTab={activeTab}
          profile={profile}
          adminProfile={currentAdminProfile}
          notifications={notifications}
          onNavigate={setActiveTab}
          onSignOut={onSignOut}
        />

        <main className="dashboard-content admin-dashboard-content">
          {loadError && (
            <div className="admin-data-warning" role="status">
              <AlertTriangle size={18} />
              <span>{loadError}</span>
              <button type="button" onClick={loadAdminData}><RefreshCw size={15} /> Retry</button>
            </div>
          )}

          {loading ? <LoadingState /> : Object.entries(screens).map(([id, screen]) => (
            <div key={id} hidden={activeTab !== id}>{screen}</div>
          ))}
        </main>
      </div>
    </div>
  )
}
