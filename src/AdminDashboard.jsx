import { useState } from 'react'
import {
  BarChart3,
  Bell,
  BriefcaseBusiness,
  ClipboardList,
  FlaskConical,
  GraduationCap,
  LayoutDashboard,
  LogOut,
  Megaphone,
  Search,
  TrendingUp,
  UserPlus,
  UsersRound,
} from 'lucide-react'

import './admin.css'

const ADMIN_NAV = [
  {
    id: 'overview',
    label: 'Overview',
    icon: LayoutDashboard,
  },
  {
    id: 'projects',
    label: 'Project Management',
    icon: BriefcaseBusiness,
  },
  {
    id: 'users',
    label: 'User Management',
    icon: UserPlus,
  },
  {
    id: 'progress',
    label: 'Progress Tracking',
    icon: ClipboardList,
  },
  {
    id: 'oversight',
    label: 'Project Oversight',
    icon: Search,
  },
  {
    id: 'analytics',
    label: 'Impact Analytics',
    icon: BarChart3,
  },
  {
    id: 'announcements',
    label: 'Announcements',
    icon: Megaphone,
  },
]

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

function Sidebar({
  activeTab,
  onTabChange,
  onSignOut,
}) {
  return (
    <aside className="student-sidebar admin-sidebar">
      <div className="student-sidebar__brand">
        <FlaskConical size={25} />
      </div>

      <nav
        aria-label="Administration dashboard"
      >
        {ADMIN_NAV.map(
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
              data-tooltip={label}
              onClick={() =>
                onTabChange(id)
              }
            >
              <Icon size={21} />
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

function Header({
  activeTab,
  profile,
}) {
  const current =
    ADMIN_NAV.find(
      (item) =>
        item.id === activeTab
    )

  return (
    <header className="dashboard-header">
      <div>
        <span className="dashboard-header__eyebrow">
          Administration workspace
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
                'Research Administrator'}
            </strong>

            <small>
              Administrator
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
}) {
  return (
    <div className="section-heading">
      <div>
        <span>{eyebrow}</span>
        <h2>{title}</h2>
      </div>
    </div>
  )
}

function PlaceholderSection({
  eyebrow,
  title,
  description,
  icon: Icon,
}) {
  return (
    <div className="dashboard-section">
      <section className="content-card">
        <Heading
          eyebrow={eyebrow}
          title={title}
        />

        <div className="empty-state">
          <Icon size={34} />

          <h3>
            Interface ready
          </h3>

          <p>
            {description}
          </p>
        </div>
      </section>
    </div>
  )
}

function Overview() {
  return (
    <div className="dashboard-section">
      <section className="student-hero admin-hero">
        <div>
          <span>
            Administration Interface
          </span>

          <h2>
            One view of UAEU
            research.
          </h2>

          <p>
            Coordinate opportunities,
            monitor research activity,
            manage users, and keep the
            research community
            informed.
          </p>
        </div>

        <div
          className="hero-orbit"
          aria-hidden="true"
        >
          <GraduationCap
            size={42}
          />
        </div>
      </section>

      <div className="metric-grid admin-metrics">
        <article>
          <span className="metric-icon metric-icon--gold">
            <BriefcaseBusiness />
          </span>

          <div>
            <strong>—</strong>

            <span>
              Research projects
            </span>
          </div>

          <small>
            Supabase connection pending
          </small>
        </article>

        <article>
          <span className="metric-icon metric-icon--blue">
            <UsersRound />
          </span>

          <div>
            <strong>—</strong>

            <span>
              Registered users
            </span>
          </div>

          <small>
            Supabase connection pending
          </small>
        </article>

        <article>
          <span className="metric-icon metric-icon--green">
            <TrendingUp />
          </span>

          <div>
            <strong>—</strong>

            <span>
              Research activity
            </span>
          </div>

          <small>
            Analytics will be connected
            later
          </small>
        </article>
      </div>

      <section className="content-card">
        <Heading
          eyebrow="Integration status"
          title="Admin workspace"
        />

        <p>
          The Admin interface is now
          accessible through Supabase
          role-based authentication.
          Individual Admin functions
          will be connected to Supabase
          next.
        </p>
      </section>
    </div>
  )
}

export default function AdminDashboard({
  profile,
  onSignOut,
}) {
  const [
    activeTab,
    setActiveTab,
  ] = useState('overview')

  const screens = {
    overview: <Overview />,

    projects: (
      <PlaceholderSection
        eyebrow="Research portfolio"
        title="Project Management"
        description="This section will connect to the existing research_opportunities table."
        icon={
          BriefcaseBusiness
        }
      />
    ),

    users: (
      <PlaceholderSection
        eyebrow="Authorized accounts"
        title="User Management"
        description="Supabase Authentication and profiles will provide user management."
        icon={UserPlus}
      />
    ),

    progress: (
      <PlaceholderSection
        eyebrow="Projects"
        title="Progress Tracking"
        description="Project milestones will be connected after the core Faculty workflow."
        icon={
          ClipboardList
        }
      />
    ),

    oversight: (
      <PlaceholderSection
        eyebrow="Research oversight"
        title="Project Oversight"
        description="Administrative project oversight will be connected later."
        icon={Search}
      />
    ),

    analytics: (
      <PlaceholderSection
        eyebrow="University research"
        title="Impact Analytics"
        description="Analytics will be calculated from Supabase data."
        icon={BarChart3}
      />
    ),

    announcements: (
      <PlaceholderSection
        eyebrow="Communication"
        title="Announcements"
        description="Announcement persistence will be implemented after the primary database workflows."
        icon={Megaphone}
      />
    ),
  }

  return (
    <div className="student-app">
      <Sidebar
        activeTab={activeTab}
        onTabChange={
          setActiveTab
        }
        onSignOut={onSignOut}
      />

      <div className="student-app__main">
        <Header
          activeTab={activeTab}
          profile={profile}
        />

        <main className="dashboard-content">
          {Object.entries(
            screens
          ).map(
            ([id, screen]) => (
              <div
                key={id}
                hidden={
                  activeTab !== id
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