import { useEffect, useState } from 'react'
import { supabase } from './lib/supabase'
import {
  ArrowRight,
  Eye,
  EyeOff,
  FlaskConical,
  HelpCircle,
  LockKeyhole,
  Mail,
  ShieldCheck,
} from 'lucide-react'

import StudentDashboard from './StudentDashboard.jsx'
import FacultyDashboard from './FacultyDashboard.jsx'
import AdminDashboard from './AdminDashboard.jsx'

import './dashboard.css'

function BrandMark() {
  return (
    <div
      className="brand"
      aria-label="United Arab Emirates University"
    >
      <div
        className="brand__mark"
        aria-hidden="true"
      >
        <FlaskConical
          size={26}
          strokeWidth={1.8}
        />
      </div>

      <div className="brand__copy">
        <strong>UAEU</strong>
        <span>Research Hub</span>
      </div>

      <span className="brand__arabic">
        United Arab Emirates University
      </span>
    </div>
  )
}

function LoginForm() {
  const [showPassword, setShowPassword] =
    useState(false)

  const [status, setStatus] =
    useState('idle')

  async function handleSubmit(event) {
    event.preventDefault()

    setStatus('loading')

    const formData =
      new FormData(event.currentTarget)

    const email = formData.get('email')
    const password =
      formData.get('password')

    const { data, error } =
      await supabase.auth.signInWithPassword({
        email,
        password,
      })

    if (error) {
      console.error(
        'Login error:',
        error.message
      )

      setStatus('idle')

      alert(
        'Invalid email or password.'
      )

      return
    }

    console.log(
      'Logged in user:',
      data.user
    )

    /*
     * We do not manually navigate here.
     * onAuthStateChange() below detects
     * the successful login automatically.
     */
    setStatus('idle')
  }

  return (
    <section
      className="login-card"
      aria-labelledby="login-title"
    >
      <div className="login-card__heading">
        <span className="eyebrow">
          UAEU Research Hub
        </span>

        <h1 id="login-title">
          Welcome to the Hub
        </h1>

        <p>
          Use your UAEU credentials to
          access your research workspace.
        </p>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="field-group">
          <label htmlFor="email">
            UAEU email or ID
          </label>

          <div className="input-wrap">
            <Mail
              size={19}
              aria-hidden="true"
            />

            <input
              id="email"
              name="email"
              type="text"
              autoComplete="username"
              placeholder="name@uaeu.ac.ae"
              required
            />
          </div>
        </div>

        <div className="field-group">
          <div className="label-row">
            <label htmlFor="password">
              Password
            </label>

            <a href="#forgot-password">
              Forgot password?
            </a>
          </div>

          <div className="input-wrap">
            <LockKeyhole
              size={19}
              aria-hidden="true"
            />

            <input
              id="password"
              name="password"
              type={
                showPassword
                  ? 'text'
                  : 'password'
              }
              autoComplete="current-password"
              placeholder="Enter your password"
              minLength={6}
              required
            />

            <button
              className="icon-button"
              type="button"
              onClick={() =>
                setShowPassword(
                  (visible) => !visible
                )
              }
              aria-label={
                showPassword
                  ? 'Hide password'
                  : 'Show password'
              }
            >
              {showPassword ? (
                <EyeOff size={19} />
              ) : (
                <Eye size={19} />
              )}
            </button>
          </div>
        </div>

        <label className="checkbox-row">
          <input
            type="checkbox"
            name="remember"
          />

          <span
            className="checkbox-ui"
            aria-hidden="true"
          />

          <span>
            Keep me signed in on this
            device
          </span>
        </label>

        <button
          className="primary-button"
          type="submit"
          disabled={
            status === 'loading'
          }
        >
          <span>
            {status === 'loading'
              ? 'Signing in…'
              : 'Sign in to portal'}
          </span>

          {status === 'loading' ? (
            <span className="spinner" />
          ) : (
            <ArrowRight size={19} />
          )}
        </button>

        <div className="secure-note">
          <ShieldCheck
            size={17}
            aria-hidden="true"
          />

          <span>
            For UAEU students, faculty,
            and administrators
          </span>
        </div>
      </form>

      <div className="login-card__footer">
        <span>
          Need help accessing your
          account?
        </span>

        <a href="#support">
          <HelpCircle size={16} />
          Contact IT support
        </a>
      </div>
    </section>
  )
}

export default function App() {
  const [session, setSession] =
    useState(null)

  const [profile, setProfile] =
    useState(null)

  const [
    authLoading,
    setAuthLoading,
  ] = useState(true)

  const [
    profileLoading,
    setProfileLoading,
  ] = useState(false)

  const [
    profileError,
    setProfileError,
  ] = useState('')

  useEffect(() => {
    async function checkSession() {
      const { data, error } =
        await supabase.auth.getSession()

      if (error) {
        console.error(
          'Session error:',
          error.message
        )
      }

      setSession(data.session)
      setAuthLoading(false)
    }

    checkSession()

    const {
      data: { subscription },
    } =
      supabase.auth.onAuthStateChange(
        (_event, newSession) => {
          setSession(newSession)

          /*
           * Clear the previous user's
           * profile whenever they log out.
           */
          if (!newSession) {
            setProfile(null)
            setProfileError('')
          }
        }
      )

    return () => {
      subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    async function loadProfile() {
      const userId =
        session?.user?.id

      if (!userId) {
        setProfile(null)
        return
      }

      setProfileLoading(true)
      setProfileError('')

      /*
       * The role column is included
       * automatically because we select
       * the complete profile row.
       */
      const { data, error } =
        await supabase
          .from('profiles')
          .select('*')
          .eq('id', userId)
          .single()

      if (error) {
        console.error(
          'Profile load error:',
          error.message
        )

        setProfile(null)

        setProfileError(
          'Your account is authenticated, but no profile could be loaded.'
        )

        setProfileLoading(false)
        return
      }

      setProfile(data)
      setProfileLoading(false)
    }

    loadProfile()
  }, [session])

  async function handleSignOut() {
    const { error } =
      await supabase.auth.signOut()

    if (error) {
      console.error(
        'Logout error:',
        error.message
      )

      alert(
        'Could not sign out. Please try again.'
      )
    }
  }

  /*
   * Supabase is still checking whether
   * a previous authenticated session
   * exists.
   */
  if (authLoading) {
    return (
      <main className="page-shell">
        <div
          style={{
            minHeight: '100vh',
            display: 'grid',
            placeItems: 'center',
          }}
        >
          <p>Checking session...</p>
        </div>
      </main>
    )
  }

  /*
   * User is authenticated but we are
   * still retrieving their profile/role.
   */
  if (
    session &&
    profileLoading
  ) {
    return (
      <main className="page-shell">
        <div
          style={{
            minHeight: '100vh',
            display: 'grid',
            placeItems: 'center',
          }}
        >
          <p>
            Loading your profile...
          </p>
        </div>
      </main>
    )
  }

  /*
   * Authentication succeeded but there
   * is no matching profile row.
   */
  if (
    session &&
    profileError
  ) {
    return (
      <main className="page-shell">
        <div
          style={{
            minHeight: '100vh',
            display: 'grid',
            placeItems: 'center',
            padding: '24px',
            textAlign: 'center',
          }}
        >
          <div>
            <h2>
              Profile not found
            </h2>

            <p>
              {profileError}
            </p>

            <p>
              Make sure this user's
              Authentication UUID matches
              the <strong>id</strong>{' '}
              column in the profiles
              table.
            </p>

            <button
              type="button"
              className="primary-button"
              onClick={
                handleSignOut
              }
            >
              Sign out
            </button>
          </div>
        </div>
      </main>
    )
  }

  /*
   * ROLE-BASED ROUTING
   *
   * Supabase Auth authenticates everyone.
   * profiles.role determines which
   * interface they are allowed to see.
   */
  if (
    session &&
    profile
  ) {
    if (
      profile.account_status === 'suspended'
    ) {
      return (
        <main className="page-shell">
          <div
            style={{
              minHeight: '100vh',
              display: 'grid',
              placeItems: 'center',
              padding: '24px',
              textAlign: 'center',
            }}
          >
            <div>
              <h2>Account suspended</h2>
              <p>
                Your UAEU Research Hub account has been suspended.
                Contact a research administrator if you believe this is an error.
              </p>
              <button
                type="button"
                className="primary-button"
                onClick={handleSignOut}
              >
                Sign out
              </button>
            </div>
          </div>
        </main>
      )
    }

    if (
      profile.role === 'admin'
    ) {
      return (
        <AdminDashboard
          profile={profile}
          onSignOut={
            handleSignOut
          }
        />
      )
    }

    if (
      profile.role === 'faculty'
    ) {
      return (
        <FacultyDashboard
          profile={profile}
          onSignOut={
            handleSignOut
          }
        />
      )
    }

    /*
     * student is also the safe/default
     * role.
     */
    return (
      <StudentDashboard
        profile={profile}
        onSignOut={
          handleSignOut
        }
      />
    )
  }

  /*
   * No authenticated session:
   * display the login interface.
   */
  return (
    <main className="page-shell">
      <header className="topbar">
        <BrandMark />

        <nav
          aria-label="Utility navigation"
        >
          <a href="#accessibility">
            Accessibility
          </a>

          <span
            aria-hidden="true"
          />

          <button
            type="button"
            lang="ar"
          >
            العربية
          </button>
        </nav>
      </header>

      <div className="page-grid">
        <section
          className="story-panel"
          aria-labelledby="story-title"
        >
          <div
            className="story-panel__pattern"
            aria-hidden="true"
          />

          <div className="story-panel__content">
            <span className="story-kicker">
              Research. Match.
              Collaborate.
            </span>

            <h2 id="story-title">
              Where research finds the
              right people.
            </h2>

            <p>
              Discover opportunities,
              connect with research
              teams, and manage every
              step of your UAEU research
              journey in one place.
            </p>

            <div
              className="story-stats"
              aria-label="Platform highlights"
            >
              <div>
                <strong>
                  Discover
                </strong>

                <span>
                  Research opportunities
                </span>
              </div>

              <div>
                <strong>
                  Match
                </strong>

                <span>
                  Skills with projects
                </span>
              </div>

              <div>
                <strong>
                  Collaborate
                </strong>

                <span>
                  Across one platform
                </span>
              </div>
            </div>
          </div>

          <p
            className="story-panel__motto"
            lang="ar"
          >
            الريادة والتميز
          </p>
        </section>

        <section className="form-panel">
          <LoginForm />

          <p className="copyright">
            © 2026 UAEU Research Hub ·
            Project 31
          </p>
        </section>
      </div>
    </main>
  )
}