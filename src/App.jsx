import { useEffect, useState } from 'react'
import { fetchAssessmentForUser, loginWithVocabAccount, submitAssessment } from './api'
import { clearSession, loadSession, saveSession } from './session'

function App() {
  const [session, setSession] = useState(() => loadSession())
  const [screen, setScreen] = useState(() => (session ? 'assessment' : 'login'))
  const [loginMessage, setLoginMessage] = useState({ type: '', text: '' })

  const handleLogin = async ({ username, password }) => {
    setLoginMessage({ type: '', text: '' })
    const nextSession = await loginWithVocabAccount(username, password)
    saveSession(nextSession)
    setSession(nextSession)
    setScreen('assessment')
  }

  const handleLogout = (message = { type: '', text: '' }) => {
    clearSession()
    setSession(null)
    setScreen('login')
    setLoginMessage(message)
  }

  useEffect(() => {
    if (!session && screen !== 'login') {
      setScreen('login')
    }
  }, [screen, session])

  return (
    <main className="app-shell">
      {screen === 'login' ? (
        <LoginPage message={loginMessage} onLogin={handleLogin} />
      ) : (
        <AssessmentPage session={session} onLogout={handleLogout} />
      )}
    </main>
  )
}

function formatPromptWord(word) {
  if (!word) {
    return ''
  }

  return word.charAt(0).toUpperCase() + word.slice(1)
}

function LoginPage({ message, onLogin }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [localError, setLocalError] = useState('')

  const activeError = localError || (message.type === 'error' ? message.text : '')
  const activeNotice = !localError && message.type === 'success' ? message.text : ''

  async function handleSubmit(event) {
    event.preventDefault()

    if (!username.trim() || !password) {
      setLocalError('Enter both username and password.')
      return
    }

    setIsSubmitting(true)
    setLocalError('')

    try {
      await onLogin({ username, password })
    } catch (submissionError) {
      setLocalError(submissionError.message || 'Login failed.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <section className="login-page">
      <div className="login-card">
        <h1>Login</h1>
        <form className="login-form" onSubmit={handleSubmit}>
          <label>
            <span>Username</span>
            <input
              autoComplete="username"
              disabled={isSubmitting}
              value={username}
              onChange={(event) => setUsername(event.target.value)}
            />
          </label>
          <label>
            <span>Password</span>
            <input
              autoComplete="current-password"
              disabled={isSubmitting}
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>
          {activeError ? <p className="form-error">{activeError}</p> : null}
          {activeNotice ? <p className="form-notice">{activeNotice}</p> : null}
          <button className="primary-button" disabled={isSubmitting} type="submit">
            {isSubmitting ? 'Signing in...' : 'Start assessment'}
          </button>
        </form>
      </div>
    </section>
  )
}

function AssessmentPage({ session, onLogout }) {
  const [state, setState] = useState({
    isLoading: true,
    isQuestionLoading: true,
    isSubmitting: false,
    isSubmitSuccess: false,
    error: '',
    assessment: null,
    answers: {},
    currentIndex: 0,
    warningMessage: '',
    showConfirmModal: false,
  })

  useEffect(() => {
    let active = true

    async function loadAssessment() {
      if (!session?.username) {
        onLogout()
        return
      }

      try {
        const data = await fetchAssessmentForUser(session.username)

        if (!active) {
          return
        }

        const questionIds = new Set(data.assessment.questions.map((item) => item.id))
        const restoredAnswers = Object.fromEntries(
          Object.entries(session.answers ?? {}).filter(([questionId]) => questionIds.has(questionId)),
        )
        const maxIndex = Math.max(data.assessment.questions.length - 1, 0)
        const restoredIndex = Math.min(session.currentIndex ?? 0, maxIndex)

        setState((current) => ({
          ...current,
          isLoading: false,
          assessment: data.assessment,
          error: '',
          answers: restoredAnswers,
          currentIndex: restoredIndex,
        }))
      } catch (loadError) {
        if (!active) {
          return
        }

        onLogout({
          type: 'error',
          text: loadError.message || 'Unable to load the assessment.',
        })
      }
    }

    loadAssessment()

    return () => {
      active = false
    }
  }, [onLogout, session])

  useEffect(() => {
    if (!session?.username || state.isLoading || !state.assessment) {
      return
    }

    saveSession({
      username: session.username,
      assessmentId: state.assessment.id,
      answers: state.answers,
      currentIndex: state.currentIndex,
    })
  }, [session, state.answers, state.assessment, state.currentIndex, state.isLoading])

  useEffect(() => {
    if (!state.warningMessage) {
      return
    }

    const timeoutId = window.setTimeout(() => {
      setState((current) => ({
        ...current,
        warningMessage: '',
      }))
    }, 2200)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [state.warningMessage])

  const assessment = state.assessment
  const questions = assessment?.questions ?? []
  const question = questions[state.currentIndex]
  const isLastQuestion = state.currentIndex === questions.length - 1

  function selectOption(questionId, optionId) {
    setState((current) => ({
      ...current,
      answers: {
        ...current.answers,
        [questionId]: optionId,
      },
      warningMessage: '',
    }))
  }

  useEffect(() => {
    if (!question) {
      return
    }

    let active = true
    const imageUrls = question.options.map((option) => option.imageUrl).filter(Boolean)

    setState((current) => ({
      ...current,
      isQuestionLoading: true,
      error: '',
    }))

    if (imageUrls.length === 0) {
      setState((current) => ({
        ...current,
        isQuestionLoading: false,
        error: 'Some images for this question are missing.',
      }))
      return
    }

    let loadedCount = 0
    let hasFailed = false

    function handleLoad() {
      loadedCount += 1

      if (!active || hasFailed || loadedCount !== imageUrls.length) {
        return
      }

      setState((current) => ({
        ...current,
        isQuestionLoading: false,
      }))
    }

    function handleError() {
      if (!active || hasFailed) {
        return
      }

      hasFailed = true

      setState((current) => ({
        ...current,
        isQuestionLoading: false,
        error: 'Failed to load the images for this question.',
      }))
    }

    const preloadImages = imageUrls.map((url) => {
      const image = new window.Image()
      image.onload = handleLoad
      image.onerror = handleError
      image.src = url

      if (image.complete) {
        window.setTimeout(() => {
          if (image.naturalWidth > 0) {
            handleLoad()
          } else {
            handleError()
          }
        }, 0)
      }

      return image
    })

    return () => {
      active = false
      preloadImages.forEach((image) => {
        image.onload = null
        image.onerror = null
      })
    }
  }, [question])

  function goToPrevious() {
    setState((current) => ({
      ...current,
      currentIndex: Math.max(0, current.currentIndex - 1),
    }))
  }

  function goToNext() {
    if (!question || !state.answers[question.id]) {
      setState((current) => ({
        ...current,
        warningMessage: 'Answer this question before going to the next one.',
      }))
      return
    }

    setState((current) => ({
      ...current,
      currentIndex: Math.min(questions.length - 1, current.currentIndex + 1),
    }))
  }

  function handleSubmitIntent() {
    const allAnswered = questions.every((item) => state.answers[item.id])

    if (!allAnswered) {
      setState((current) => ({
        ...current,
        warningMessage: 'Answer all questions before submitting.',
        showConfirmModal: false,
      }))
      return
    }

    setState((current) => ({
      ...current,
      warningMessage: '',
      showConfirmModal: true,
    }))
  }

  async function confirmSubmit() {
    setState((current) => ({
      ...current,
      isSubmitting: true,
      error: '',
    }))

    try {
      await submitAssessment({
        username: session.username,
        assessmentId: assessment.id,
        answers: state.answers,
      })
      setState((current) => ({
        ...current,
        isSubmitting: false,
        isSubmitSuccess: true,
        showConfirmModal: false,
      }))

      window.setTimeout(() => {
        onLogout({
          type: 'success',
          text: 'Assessment submitted successfully.',
        })
      }, 1600)
    } catch (submissionError) {
      setState((current) => ({
        ...current,
        isSubmitting: false,
        showConfirmModal: false,
        error: submissionError.message || 'Submission failed.',
      }))
    }
  }

  if (state.isLoading || state.isQuestionLoading) {
    return (
      <section className="status-page">
        <div className="status-card">Loading question...</div>
      </section>
    )
  }

  if (!question) {
    return (
      <section className="status-page">
        <div className="status-card">No questions were found for this assessment.</div>
      </section>
    )
  }

  return (
    <section className="assessment-page">
      <article className="question-card">
        <div className="question-meta">
          <p className="question-word">
            Which picture shows <span className="question-word-keyword">{formatPromptWord(question.word)}</span>?
          </p>
        </div>

        <div className="option-grid">
          {question.options.map((option) => {
            const selected = state.answers[question.id] === option.id

            return (
              <button
                key={option.id}
                className={`option-card${selected ? ' selected' : ''}`}
                disabled={state.isSubmitting || state.isSubmitSuccess}
                type="button"
                onClick={() => selectOption(question.id, option.id)}
              >
                <div className="image-frame">
                  <img alt={`${question.word} option`} src={option.imageUrl} />
                </div>
              </button>
            )
          })}
        </div>
      </article>

      <aside className="desktop-sidebar">
        <button
          className="desktop-nav-button secondary-button"
          disabled={state.currentIndex === 0 || state.isSubmitting || state.isSubmitSuccess}
          type="button"
          onClick={goToPrevious}
        >
          ▲
        </button>

        <div className="desktop-position-label" aria-label="Current question">
          {state.currentIndex + 1}/{questions.length}
        </div>

        {isLastQuestion ? (
          <button
            className="desktop-nav-button primary-button"
            disabled={state.isSubmitting || state.isSubmitSuccess}
            type="button"
            onClick={handleSubmitIntent}
          >
            Submit
          </button>
        ) : (
          <button
            className="desktop-nav-button primary-button"
            disabled={state.isSubmitting || state.isSubmitSuccess}
            type="button"
            onClick={goToNext}
          >
            ▼
          </button>
        )}
      </aside>

      <footer className="bottom-bar">
        <button
          className="secondary-button mobile-nav-button"
          disabled={state.currentIndex === 0 || state.isSubmitting || state.isSubmitSuccess}
          type="button"
          onClick={goToPrevious}
        >
          ◀
        </button>
        <div className="mobile-position-wrap">
          <div className="mobile-position-label" aria-label="Current question">
            {state.currentIndex + 1}/{questions.length}
          </div>
        </div>
        {isLastQuestion ? (
          <button
            className="primary-button mobile-nav-button mobile-submit-button"
            disabled={state.isSubmitting || state.isSubmitSuccess}
            type="button"
            onClick={handleSubmitIntent}
          >
            Submit
          </button>
        ) : (
          <button
            className="primary-button mobile-nav-button"
            disabled={state.isSubmitting || state.isSubmitSuccess}
            type="button"
            onClick={goToNext}
          >
            ▶
          </button>
        )}
      </footer>

      {state.isSubmitSuccess ? (
        <div className="toast-success" role="status">
          Submitted successfully. Preparing to log out...
        </div>
      ) : null}

      {state.warningMessage ? (
        <div className="toast-warning" role="alert">
          {state.warningMessage}
        </div>
      ) : null}

      {state.error ? (
        <div className="toast-error" role="alert">
          {state.error}
        </div>
      ) : null}

      {state.showConfirmModal ? (
        <div className="modal-backdrop" role="presentation">
          <div aria-modal="true" className="modal-card" role="dialog">
            <h2>Submit assessment?</h2>
            <p>You will not be able to return after submission.</p>
            <div className="modal-actions">
              <button
                className="secondary-button"
                disabled={state.isSubmitting}
                type="button"
                onClick={() =>
                  setState((current) => ({
                    ...current,
                    showConfirmModal: false,
                  }))
                }
              >
                Cancel
              </button>
              <button
                className="primary-button"
                disabled={state.isSubmitting}
                type="button"
                onClick={confirmSubmit}
              >
                {state.isSubmitting ? 'Submitting...' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  )
}

export default App
