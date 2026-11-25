const PREFERENCE_KEY = 'uaeu-auth-persistence'

export function createAuthStorage(local, session) {
  return {
    setRememberSession(remember) {
      session.setItem(PREFERENCE_KEY, remember ? 'local' : 'session')
    },
    getItem(key) {
      const temporary = session.getItem(key)
      if (temporary !== null) return temporary
      return session.getItem(PREFERENCE_KEY) === 'session' ? null : local.getItem(key)
    },
    setItem(key, value) {
      if (session.getItem(PREFERENCE_KEY) === 'session') {
        session.setItem(key, value)
        local.removeItem(key)
      } else {
        local.setItem(key, value)
        session.removeItem(key)
      }
    },
    removeItem(key) {
      local.removeItem(key)
      session.removeItem(key)
    },
  }
}
