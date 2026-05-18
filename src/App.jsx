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
        <p className="eyebrow">Ella Vocabulary Assessment</p>
        <h1>Sign in</h1>
        <p className="support-copy">Use the assigned child account to begin the assessment.</p>
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
    isSubmitting: false,
    error: '',
    assessment: null,
    answers: {},
    currentIndex: 0,
    showIncompleteWarning: false,
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

        setState((current) => ({
          ...current,
          isLoading: false,
          assessment: data.assessment,
          error: '',
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

  const assessment = state.assessment
  const questions = assessment?.questions ?? []
  const question = questions[state.currentIndex]
  const isLastQuestion = state.currentIndex === questions.length - 1
  const answeredCount = questions.filter((item) => state.answers[item.id]).length

  function selectOption(questionId, optionId) {
    setState((current) => ({
      ...current,
      answers: {
        ...current.answers,
        [questionId]: optionId,
      },
      showIncompleteWarning: false,
    }))
  }

  function goToPrevious() {
    setState((current) => ({
      ...current,
      currentIndex: Math.max(0, current.currentIndex - 1),
    }))
  }

  function goToNext() {
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
        showIncompleteWarning: true,
        showConfirmModal: false,
      }))
      return
    }

    setState((current) => ({
      ...current,
      showIncompleteWarning: false,
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
      onLogout({
        type: 'success',
        text: 'Assessment submitted successfully.',
      })
    } catch (submissionError) {
      setState((current) => ({
        ...current,
        isSubmitting: false,
        showConfirmModal: false,
        error: submissionError.message || 'Submission failed.',
      }))
    }
  }

  if (state.isLoading) {
    return (
      <section className="status-page">
        <div className="status-card">Loading assessment...</div>
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
      <header className="assessment-header">
        <div>
          <p className="eyebrow">Assessment</p>
          <h1>{assessment.title || 'Vocabulary Check'}</h1>
        </div>
        <button className="ghost-button" type="button" onClick={() => onLogout()}>
          Log out
        </button>
      </header>

      <article className="question-card">
        <div className="question-meta">
          <p className="question-progress">
            Question {state.currentIndex + 1} of {questions.length}
          </p>
          <p className="question-word">{question.word}</p>
        </div>

        <div className="option-grid">
          {question.options.map((option) => {
            const selected = state.answers[question.id] === option.id

            return (
              <button
                key={option.id}
                className={`option-card${selected ? ' selected' : ''}`}
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

      <footer className="bottom-bar">
        <button
          className="secondary-button"
          disabled={state.currentIndex === 0 || state.isSubmitting}
          type="button"
          onClick={goToPrevious}
        >
          Previous
        </button>
        <div className="bottom-status">
          <p>
            Question {state.currentIndex + 1} of {questions.length}
          </p>
          <p>
            {answeredCount} / {questions.length} answered
          </p>
        </div>
        {isLastQuestion ? (
          <button
            className="primary-button"
            disabled={state.isSubmitting}
            type="button"
            onClick={handleSubmitIntent}
          >
            Submit
          </button>
        ) : (
          <button className="primary-button" disabled={state.isSubmitting} type="button" onClick={goToNext}>
            Next
          </button>
        )}
      </footer>

      {state.showIncompleteWarning ? (
        <div className="toast-warning" role="alert">
          Answer all questions before submitting.
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
