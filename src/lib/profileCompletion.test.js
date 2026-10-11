import test from 'node:test'
import assert from 'node:assert/strict'
import { missingProfileFields } from './profileCompletion.js'

test('new profiles are incomplete and faculty do not need a university ID', () => {
  assert.ok(missingProfileFields({ role: 'faculty' }).length)
  const faculty = { role: 'faculty', department: 'CS', research_experience: 'AI research', skills: ['Python'], research_interests: ['AI'] }
  assert.deepEqual(missingProfileFields(faculty), [])
  assert.ok(missingProfileFields({ ...faculty, skills: [' '] }).includes('Skills / expertise'))
})
test('students need academic details and a valid GPA including zero', () => {
  const student = { role: 'student', department: 'CS', bio: 'Interested in research', skills: ['Python'], research_interests: ['AI'], major: 'CS', year_of_study: 'Senior', gpa: 0 }
  assert.deepEqual(missingProfileFields(student), [])
  assert.ok(missingProfileFields({ ...student, gpa: null }).includes('GPA'))
  assert.ok(missingProfileFields({ ...student, major: '' }).includes('Major'))
})
