import test from 'node:test'
import assert from 'node:assert/strict'
import {
  getProjectEligibility,
  rankFacultyForIdea,
  rankProjectsForStudent,
  rankStudentsForProject,
} from './matching.js'

const project = {
  id: 'project-ai',
  title: 'Arabic NLP for student feedback',
  description: 'Build a natural language processing prototype for Arabic feedback.',
  department: 'Computer Science',
  requirements: ['Python', 'Natural language processing'],
  tags: ['Machine learning'],
  minimum_gpa: 3.25,
}

const strongStudent = {
  id: 'student-strong',
  major: 'Computer Science',
  department: 'Computer Science',
  gpa: 3.8,
  skills: ['Python', 'Natural language processing'],
  research_interests: ['Arabic language technology', 'Machine learning'],
  relevant_coursework: ['Machine learning'],
}

test('minimum GPA is a hard eligibility rule', () => {
  assert.equal(getProjectEligibility(project, { ...strongStudent, gpa: 3.0 }).eligible, false)
  assert.equal(getProjectEligibility(project, strongStudent).eligible, true)
})

test('project and student rankings put ineligible pairs after eligible ones', async () => {
  const lowGpaStudent = { ...strongStudent, id: 'student-low', gpa: 2.8 }
  const students = await rankStudentsForProject(project, [lowGpaStudent, strongStudent])
  assert.equal(students.students[0].id, 'student-strong')
  assert.equal(students.students[0].is_eligible, true)
  assert.equal(students.students[1].is_eligible, false)

  const projects = await rankProjectsForStudent(lowGpaStudent, [project, { ...project, id: 'project-no-cutoff', minimum_gpa: null }])
  assert.equal(projects.projects[0].id, 'project-no-cutoff')
  assert.equal(projects.projects[1].is_eligible, false)
})

test('idea-to-faculty ranking favours related available expertise', async () => {
  const ranking = await rankFacultyForIdea(
    { title: 'Arabic natural language processing for feedback' },
    [
      { id: 'health', full_name: 'Health Faculty', research_interests: ['Public health'], skills: ['Epidemiology'] },
      { id: 'ai', full_name: 'AI Faculty', research_interests: ['Natural language processing'], skills: ['Arabic NLP'], supervision_status: 'available' },
    ]
  )
  assert.equal(ranking.faculty[0].id, 'ai')
  assert.equal(ranking.faculty[0].is_available, true)
})
