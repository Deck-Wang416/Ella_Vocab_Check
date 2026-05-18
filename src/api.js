import { child, get, ref, serverTimestamp, update } from 'firebase/database'
import { database } from './firebase'

function normalizeRecordMap(record) {
  if (!record) {
    return []
  }

  return Object.values(record)
}

export async function loginWithVocabAccount(username, password) {
  const trimmedUsername = username.trim()
  const accountRef = child(ref(database), `vocabAccounts/${trimmedUsername}`)
  const accountSnapshot = await get(accountRef)

  if (!accountSnapshot.exists()) {
    throw new Error('Invalid username or password.')
  }

  const account = accountSnapshot.val()

  if (account.password !== password) {
    throw new Error('Invalid username or password.')
  }

  if (account.submitted) {
    throw new Error('This account has already submitted the assessment.')
  }

  return {
    username: trimmedUsername,
    assessmentId: account.assessmentId,
  }
}

export async function fetchAssessmentForUser(username) {
  const accountRef = child(ref(database), `vocabAccounts/${username}`)
  const accountSnapshot = await get(accountRef)

  if (!accountSnapshot.exists()) {
    throw new Error('Account record was not found.')
  }

  const account = accountSnapshot.val()

  if (!account.assessmentId) {
    throw new Error('No assessment has been assigned to this account.')
  }

  if (account.submitted) {
    throw new Error('This account has already submitted the assessment.')
  }

  const assessmentRef = child(ref(database), `vocabAssessments/${account.assessmentId}`)
  const assessmentSnapshot = await get(assessmentRef)

  if (!assessmentSnapshot.exists()) {
    throw new Error('Assigned assessment was not found.')
  }

  const assessment = assessmentSnapshot.val()
  const questions = normalizeRecordMap(assessment.questions).sort((a, b) => a.order - b.order)
  const normalizedQuestions = questions.map((question) => ({
    ...question,
    options: normalizeRecordMap(question.options),
  }))

  return {
    account: {
      username,
      assessmentId: account.assessmentId,
    },
    assessment: {
      id: assessment.id,
      title: assessment.title,
      questions: normalizedQuestions,
    },
  }
}

export async function submitAssessment({ username, assessmentId, answers }) {
  const submittedAt = serverTimestamp()
  const accountPath = `vocabAccounts/${username}`
  const resultPath = `vocabResults/${username}`

  await update(ref(database), {
    [`${resultPath}/username`]: username,
    [`${resultPath}/assessmentId`]: assessmentId,
    [`${resultPath}/answers`]: answers,
    [`${resultPath}/submittedAt`]: submittedAt,
    [`${accountPath}/submitted`]: true,
    [`${accountPath}/submittedAt`]: submittedAt,
  })
}
