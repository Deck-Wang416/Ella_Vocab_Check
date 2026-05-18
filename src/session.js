const SESSION_KEY = 'ella-vocab-session'

export function loadSession() {
  const raw = window.sessionStorage.getItem(SESSION_KEY)

  if (!raw) {
    return null
  }

  try {
    const parsed = JSON.parse(raw)
    return parsed?.username ? sanitizeSession(parsed) : null
  } catch {
    return null
  }
}

export function saveSession(session) {
  window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(sanitizeSession(session)))
}

export function clearSession() {
  window.sessionStorage.removeItem(SESSION_KEY)
}

function sanitizeSession(session) {
  return {
    username: session.username,
    assessmentId: session.assessmentId ?? '',
    answers: isPlainObject(session.answers) ? session.answers : {},
    currentIndex: Number.isInteger(session.currentIndex) && session.currentIndex >= 0 ? session.currentIndex : 0,
  }
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}
