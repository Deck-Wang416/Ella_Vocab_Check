const SESSION_KEY = 'ella-vocab-session'

export function loadSession() {
  const raw = window.sessionStorage.getItem(SESSION_KEY)

  if (!raw) {
    return null
  }

  try {
    const parsed = JSON.parse(raw)
    return parsed?.username ? parsed : null
  } catch {
    return null
  }
}

export function saveSession(session) {
  window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(session))
}

export function clearSession() {
  window.sessionStorage.removeItem(SESSION_KEY)
}
