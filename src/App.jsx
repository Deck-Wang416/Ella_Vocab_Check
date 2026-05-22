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

function buildQuestionSlots(questions, currentIndex, slotCount) {
  const total = questions.length
  const edgeWindow = slotCount - 2
  const middleWindow = slotCount - 4

  if (total <= slotCount) {
    return questions.map((question, index) => ({
      type: 'question',
      question,
      index,
    }))
  }

  if (currentIndex <= edgeWindow - 1) {
    return [
      ...questions.slice(0, edgeWindow).map((question, index) => ({
        type: 'question',
        question,
        index,
      })),
      { type: 'ellipsis', key: `ellipsis-end-${slotCount}` },
      { type: 'question', question: questions[total - 1], index: total - 1 },
    ]
  }

  if (currentIndex >= total - edgeWindow) {
    return [
      { type: 'question', question: questions[0], index: 0 },
      { type: 'ellipsis', key: `ellipsis-start-${slotCount}` },
      ...questions.slice(total - edgeWindow).map((question, offset) => ({
        type: 'question',
        question,
        index: total - edgeWindow + offset,
      })),
    ]
  }

  const middleStart = currentIndex - Math.floor(middleWindow / 2)

  return [
    { type: 'question', question: questions[0], index: 0 },
    { type: 'ellipsis', key: `ellipsis-start-${slotCount}` },
    ...questions.slice(middleStart, middleStart + middleWindow).map((question, offset) => ({
      type: 'question',
      question,
      index: middleStart + offset,
    })),
    { type: 'ellipsis', key: `ellipsis-end-${slotCount}` },
    { type: 'question', question: questions[total - 1], index: total - 1 },
  ]
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
    isSubmitting: false,
    isSubmitSuccess: false,
    error: '',
    assessment: null,
    answers: {},
    currentIndex: 0,
    showIncompleteWarning: false,
    showConfirmModal: false,
    showLogoutModal: false,
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

  const assessment = state.assessment
  const questions = assessment?.questions ?? []
  const question = questions[state.currentIndex]
  const isLastQuestion = state.currentIndex === questions.length - 1
  const answeredCount = questions.filter((item) => state.answers[item.id]).length
  const desktopQuestionSlots = buildQuestionSlots(questions, state.currentIndex, 7)
  const mobileQuestionSlots = buildQuestionSlots(questions, state.currentIndex, 3)

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

  function goToQuestion(index) {
    setState((current) => ({
      ...current,
      currentIndex: index,
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

  function handleLogoutIntent() {
    if (state.isSubmitting || state.isSubmitSuccess) {
      return
    }

    setState((current) => ({
      ...current,
      showLogoutModal: true,
    }))
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
        <div className="assessment-brand">
          <img alt="ELLA logo" className="assessment-brand-logo" src="/ella_logo.png" />
          <span className="assessment-brand-name">ELLA</span>
        </div>
        <button className="ghost-button" type="button" onClick={handleLogoutIntent}>
          Log out
        </button>
      </header>

      <article className="question-card">
        <div className="question-meta">
          <div className="question-progress-row">
            <p className="question-progress">
              Question {state.currentIndex + 1} of {questions.length}
            </p>
            <p className="question-answered">
              {answeredCount} / {questions.length} answered
            </p>
          </div>
          <p className="question-word">{question.word}</p>
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

        <div className="desktop-question-list-wrap">
          <div className="desktop-question-list" aria-label="Question navigation">
            {desktopQuestionSlots.map((slot) => {
              if (slot.type === 'ellipsis') {
                return (
                  <div key={slot.key} aria-hidden="true" className="desktop-question-ellipsis">
                    …
                  </div>
                )
              }

              const isCurrent = slot.index === state.currentIndex
              const isAnswered = Boolean(state.answers[slot.question.id])

              return (
                <button
                  key={slot.question.id}
                  className={`desktop-question-chip${isCurrent ? ' current' : ''}${isAnswered ? ' answered' : ' unanswered'}`}
                  disabled={state.isSubmitting || state.isSubmitSuccess}
                  type="button"
                  onClick={() => goToQuestion(slot.index)}
                >
                  <span className="desktop-question-chip-number">{slot.index + 1}</span>
                </button>
              )
            })}
          </div>
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
        <div className="mobile-question-list-wrap">
          <div className="mobile-question-list" aria-label="Question navigation">
            {mobileQuestionSlots.map((slot) => {
              if (slot.type === 'ellipsis') {
                return (
                  <div key={slot.key} aria-hidden="true" className="mobile-question-ellipsis">
                    …
                  </div>
                )
              }

              const isCurrent = slot.index === state.currentIndex
              const isAnswered = Boolean(state.answers[slot.question.id])

              return (
                <button
                  key={slot.question.id}
                  className={`mobile-question-chip${isCurrent ? ' current' : ''}${isAnswered ? ' answered' : ' unanswered'}`}
                  disabled={state.isSubmitting || state.isSubmitSuccess}
                  type="button"
                  onClick={() => goToQuestion(slot.index)}
                >
                  <span className="mobile-question-chip-inner">
                    <span className="mobile-question-chip-number">{slot.index + 1}</span>
                    <span
                      aria-hidden="true"
                      className={`mobile-question-chip-dot${isAnswered ? ' answered' : ' unanswered'}`}
                    />
                  </span>
                </button>
              )
            })}
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

      {state.showLogoutModal ? (
        <div className="modal-backdrop" role="presentation">
          <div aria-modal="true" className="modal-card" role="dialog">
            <h2>Log out now?</h2>
            <p>Your current progress is saved on this device. You can continue later by logging in again.</p>
            <div className="modal-actions">
              <button
                className="secondary-button"
                type="button"
                onClick={() =>
                  setState((current) => ({
                    ...current,
                    showLogoutModal: false,
                  }))
                }
              >
                Cancel
              </button>
              <button className="primary-button" type="button" onClick={() => onLogout()}>
                Confirm
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  )
}

export default App
