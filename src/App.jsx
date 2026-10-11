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

function normalizeUaeuEmail(value) {
  const identifier = String(value || '').trim()
  return /^\d{9}$/.test(identifier)
    ? `${identifier}@uaeu.ac.ae`
    : identifier
}

function PasswordResetRequest({ onBack }) {
  const [status, setStatus] = useState('idle')
  const [message, setMessage] = useState('')

  async function handleSubmit(event) {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)
    const email = normalizeUaeuEmail(formData.get('identifier'))

    setStatus('loading')
    setMessage('')
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}${window.location.pathname}`,
    })
    setStatus('idle')

    if (error) {
      console.error('Password reset request error:', error.message)
      setMessage('We could not send the reset email. Please check your UAEU email or ID and try again.')
      return
    }

    setStatus('sent')
    setMessage('If an account matches this UAEU email or ID, a password-reset link has been sent.')
  }

  return (
    <section className="login-card" aria-labelledby="reset-request-title">
      <div className="login-card__heading">
        <span className="eyebrow">UAEU Research Hub</span>
        <h1 id="reset-request-title">Reset your password</h1>
        <p>Enter your UAEU email or nine-digit ID. We will send a secure password-reset link.</p>
      </div>
      <form onSubmit={handleSubmit}>
        <div className="field-group">
          <label htmlFor="reset-identifier">UAEU email or ID</label>
          <div className="input-wrap">
            <Mail size={19} aria-hidden="true" />
            <input id="reset-identifier" name="identifier" type="text" autoComplete="username" placeholder="202312345 or name@uaeu.ac.ae" required />
          </div>
        </div>
        {message && <p className={status === 'sent' ? 'auth-form-message is-success' : 'auth-form-message'} role="status">{message}</p>}
        <button className="primary-button" type="submit" disabled={status === 'loading' || status === 'sent'}>
          <span>{status === 'loading' ? 'Sending…' : status === 'sent' ? 'Reset email sent' : 'Send reset link'}</span>
          {status === 'loading' ? <span className="spinner" /> : <ArrowRight size={19} />}
        </button>
        <button className="auth-text-button" type="button" onClick={onBack}>Back to sign in</button>
      </form>
    </section>
  )
}

function PasswordUpdateForm({ onExit }) {
  const [showPassword, setShowPassword] = useState(false)
  const [status, setStatus] = useState('idle')
  const [message, setMessage] = useState('')

  async function handleSubmit(event) {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)
    const password = String(formData.get('password') || '')
    const confirmation = String(formData.get('confirmation') || '')

    if (password.length < 6) {
      setMessage('Your new password must contain at least 6 characters.')
      return
    }
    if (password !== confirmation) {
      setMessage('The passwords do not match.')
      return
    }

    setStatus('loading')
    setMessage('')
    const { error } = await supabase.auth.updateUser({ password })
    setStatus('idle')

    if (error) {
      console.error('Password update error:', error.message)
      setMessage('This reset link is invalid or has expired. Please request a new one.')
      return
    }

    setStatus('complete')
    setMessage('Your password has been updated. You can now sign in with it.')
  }

  return (
    <section className="login-card" aria-labelledby="new-password-title">
      <div className="login-card__heading">
        <span className="eyebrow">UAEU Research Hub</span>
        <h1 id="new-password-title">Choose a new password</h1>
        <p>Create a new password for your research workspace account.</p>
      </div>
      <form onSubmit={handleSubmit}>
        <div className="field-group">
          <label htmlFor="new-password">New password</label>
          <div className="input-wrap">
            <LockKeyhole size={19} aria-hidden="true" />
            <input id="new-password" name="password" type={showPassword ? 'text' : 'password'} autoComplete="new-password" minLength={6} required />
            <button className="icon-button" type="button" onClick={() => setShowPassword((visible) => !visible)} aria-label={showPassword ? 'Hide password' : 'Show password'}>
              {showPassword ? <EyeOff size={19} /> : <Eye size={19} />}
            </button>
          </div>
        </div>
        <div className="field-group">
          <label htmlFor="confirm-password">Confirm new password</label>
          <div className="input-wrap">
            <LockKeyhole size={19} aria-hidden="true" />
            <input id="confirm-password" name="confirmation" type={showPassword ? 'text' : 'password'} autoComplete="new-password" minLength={6} required />
          </div>
        </div>
        {message && <p className={status === 'complete' ? 'auth-form-message is-success' : 'auth-form-message'} role="status">{message}</p>}
        {status === 'complete' ? (
          <button className="primary-button" type="button" onClick={onExit}>Return to sign in</button>
        ) : (
          <button className="primary-button" type="submit" disabled={status === 'loading'}>
            <span>{status === 'loading' ? 'Updating…' : 'Update password'}</span>
            {status === 'loading' ? <span className="spinner" /> : <ArrowRight size={19} />}
          </button>
        )}
      </form>
    </section>
  )
}

function RegistrationForm({ onBack }) {
  const [registrationEmail, setRegistrationEmail] = useState('')
  const role = /^[0-9]/.test(registrationEmail.trim()) ? 'student' : /^[a-z]/i.test(registrationEmail.trim()) ? 'faculty' : null
  const [consent, setConsent] = useState(false)
  const [status, setStatus] = useState('idle')
  const [message, setMessage] = useState('')

  async function handleSubmit(event) {
    event.preventDefault()
    if (status === 'loading') return
    if (!consent) {
      setMessage('Please accept sharing your research background within UAEU Research Hub to create an account.')
      return
    }
    const form = new FormData(event.currentTarget)
    const identifier = String(form.get('identifier') || '').trim()
    const email = identifier.toLowerCase()
    const password = String(form.get('password') || '')
    const fullName = String(form.get('full_name') || '').trim()
    const universityId = String(form.get('university_id') || '').trim()
    const validId = /^\d{9}$/.test(universityId) || (role === 'faculty' && !universityId)
    if (!role || !fullName || !validId || !/^[a-z0-9][^\s@]*@uaeu\.ac\.ae$/i.test(email)) {
      setMessage(role === 'faculty' ? 'Enter your name and UAEU email. University ID is optional; if provided, it must contain nine digits.' : 'Enter your name and full UAEU email starting with a digit or letter. Students also require a nine-digit university ID.')
      return
    }
    if (password.length < 10 || password !== form.get('confirmation')) {
      setMessage('Use a password of at least 10 characters and make sure both passwords match.')
      return
    }
    setStatus('loading')
    setMessage('')
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}${window.location.pathname}`,
          data: {
            full_name: fullName,
            university_id: universityId,
            role,
            research_background_consent: true,
            research_background_consent_version: 'hub-only-v1',
          },
        },
      })
      if (error) throw error
      if (Array.isArray(data?.user?.identities) && data.user.identities.length === 0) {
        setStatus('idle')
        setMessage('You already have an account. Please sign in.')
        return
      }
      setStatus('complete')
      setMessage('Your account has been created.')
    } catch (error) {
      setStatus('idle')
      const alreadyRegistered = ['user_already_exists', 'email_exists'].includes(error.code)
        || /already registered|already exists/i.test(error.message || '')
      setMessage(alreadyRegistered ? 'You already have an account. Please sign in.' : error.message || 'Could not create your account. Please try again.')
    }
  }

  return <section className="login-card" aria-labelledby="registration-title">
    <div className="login-card__heading"><span className="eyebrow">UAEU Research Hub</span><h1 id="registration-title">Create an account</h1><p>Join as a student or faculty member.</p></div>
    <form onSubmit={handleSubmit}>
      <div className="field-group"><label htmlFor="registration-name">Full name</label><div className="input-wrap"><input id="registration-name" name="full_name" autoComplete="name" required /></div></div>
      <div className="field-group"><label htmlFor="registration-email">UAEU email</label><div className="input-wrap"><Mail size={19} aria-hidden="true" /><input id="registration-email" name="identifier" type="email" autoComplete="username" value={registrationEmail} onChange={(event) => setRegistrationEmail(event.target.value)} placeholder="202312345@uaeu.ac.ae or name@uaeu.ac.ae" required /></div></div>
      {role && <p className="auth-form-message" role="status">Account type: {role === 'student' ? 'Student' : 'Faculty'}</p>}
      <div className="field-group"><label htmlFor="registration-id">University ID{role === 'faculty' ? ' (optional)' : ''}</label><div className="input-wrap"><input id="registration-id" name="university_id" inputMode="numeric" pattern="[0-9]{9}" maxLength={9} placeholder="Nine-digit university ID" required={role !== 'faculty'} /></div></div>
      <div className="field-group"><label htmlFor="registration-password">Password</label><div className="input-wrap"><LockKeyhole size={19} aria-hidden="true" /><input id="registration-password" name="password" type="password" autoComplete="new-password" minLength={10} placeholder="At least 10 characters" required /></div></div>
      <div className="field-group"><label htmlFor="registration-confirmation">Confirm password</label><div className="input-wrap"><input id="registration-confirmation" name="confirmation" type="password" autoComplete="new-password" minLength={10} required /></div></div>
      <label className="checkbox-row"><input type="checkbox" name="research_background_consent" checked={consent} onChange={(event) => setConsent(event.target.checked)} required disabled={status !== 'idle'} /><span className="checkbox-ui" aria-hidden="true" /><span>I accept sharing my research background within UAEU Research Hub only, for research matching and collaboration.</span></label>
      {message && <p className={status === 'complete' ? 'auth-form-message is-success' : 'auth-form-message'} role="status">{message}</p>}
      {status === 'complete' ? (
        <button className="primary-button" type="button" onClick={onBack}>Back to sign in</button>
      ) : <>
        <button className="primary-button registration-submit" type="submit" aria-busy={status === 'loading'} disabled={!consent || status === 'loading'}>{status === 'loading' ? 'Creating account...' : 'Create account'}</button>
        <button className="auth-text-button" type="button" onClick={onBack} disabled={status === 'loading'}>Back to sign in</button>
      </>}
    </form>
  </section>
}

function LoginForm() {
  const [showRegistration, setShowRegistration] = useState(false)
  const [showPassword, setShowPassword] =
    useState(false)

  const [status, setStatus] =
    useState('idle')
  const [showResetRequest, setShowResetRequest] =
    useState(false)

  async function handleSubmit(event) {
    event.preventDefault()

    setStatus('loading')

    const formData =
      new FormData(event.currentTarget)

    const email = normalizeUaeuEmail(
      formData.get('identifier')
    )
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

  if (showRegistration) return <RegistrationForm onBack={() => setShowRegistration(false)} />

  if (showResetRequest) {
    return (
      <PasswordResetRequest
        onBack={() => setShowResetRequest(false)}
      />
    )
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

      <button className="auth-text-button" type="button" onClick={() => setShowRegistration(true)}>New student or faculty member? Create an account</button>

      <form onSubmit={handleSubmit}>
        <div className="field-group">
          <label htmlFor="identifier">
            UAEU email or ID
          </label>

          <div className="input-wrap">
            <Mail
              size={19}
              aria-hidden="true"
            />

            <input
              id="identifier"
              name="identifier"
              type="text"
              autoComplete="username"
              placeholder="202312345 or name@uaeu.ac.ae"
              inputMode="email"
              required
            />
          </div>
        </div>

        <div className="field-group">
          <div className="label-row">
            <label htmlFor="password">
              Password
            </label>

            <button
              className="auth-link-button"
              type="button"
              onClick={() => setShowResetRequest(true)}
            >
              Forgot password?
            </button>
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

  const [passwordRecovery, setPasswordRecovery] = useState(
    () => window.location.hash.includes('type=recovery')
  )

  useEffect(() => {
    // Clear the old placeholder link left behind by earlier versions.
    if (window.location.hash === '#forgot-password') {
      window.history.replaceState({}, document.title, window.location.pathname)
    }
  }, [])

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
        (event, newSession) => {
          setSession(newSession)

          if (event === 'PASSWORD_RECOVERY') {
            setPasswordRecovery(true)
          }

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

  async function exitPasswordRecovery() {
    await supabase.auth.signOut()
    setPasswordRecovery(false)
    window.history.replaceState({}, document.title, window.location.pathname)
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

  if (passwordRecovery) {
    return (
      <main className="page-shell">
        <header className="topbar">
          <BrandMark />
        </header>
        <div className="form-panel auth-recovery-panel">
          <PasswordUpdateForm onExit={exitPasswordRecovery} />
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
