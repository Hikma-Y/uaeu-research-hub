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

test('per-project priorities reverse candidate rankings without changing eligibility rules', async () => {
  const skillExpert = { id: 'skills', skills: ['Python'], gpa: 2.5 }
  const highGpa = { id: 'grades', skills: [], gpa: 4 }
  const base = { id: 'weighted', requirements: ['Python'] }
  const skills = { semantic: 0, skills: 100, academic: 0, gpa: 0, experience: 0 }
  const grades = { semantic: 0, skills: 0, academic: 0, gpa: 100, experience: 0 }
  const students = [skillExpert, highGpa]
  const skillsRanking = await rankStudentsForProject({ ...base, matching_weights: skills }, students)
  assert.deepEqual(skillsRanking.students.map((student) => [student.id, student.match_score]), [['skills', 100], ['grades', 0]])
  assert.deepEqual(skillsRanking.students[0].match_reasons, ['1/1 required skills matched'])
  assert.deepEqual(skillsRanking.students[1].match_reasons, [])
  const gradesRanking = await rankStudentsForProject({ ...base, matching_weights: grades }, students)
  assert.deepEqual(gradesRanking.students.map((student) => [student.id, student.match_score]), [['grades', 100], ['skills', 63]])
  const eligibilityRanking = await rankStudentsForProject({ ...base, minimum_gpa: 3, matching_weights: skills }, students)
  assert.equal(eligibilityRanking.students[0].id, 'grades')
  assert.equal(eligibilityRanking.students[1].match_score, 100)
  assert.equal(eligibilityRanking.students[1].is_eligible, false)
  assert.match(eligibilityRanking.students[1].match_reasons[0], /Minimum GPA/)
})

test('student project recommendations use each project’s weights independently', async () => {
  const student = { id: 'student', skills: ['Python'], gpa: 2.5 }
  const projects = [
    { id: 'grades', requirements: ['Python'], matching_weights: { semantic: 0, skills: 0, academic: 0, gpa: 100, experience: 0 } },
    { id: 'skills', requirements: ['Python'], matching_weights: { semantic: 0, skills: 100, academic: 0, gpa: 0, experience: 0 } },
  ]
  const before = structuredClone(projects)
  const result = await rankProjectsForStudent(student, projects)
  assert.deepEqual(result.projects.map((project) => [project.id, project.match]), [['skills', 100], ['grades', 63]])
  assert.deepEqual(projects, before)
})

test('omitted and explicit default weights preserve legacy candidate scores', async () => {
  const defaults = { semantic: 40, skills: 25, academic: 10, gpa: 10, experience: 15 }
  const legacy = await rankStudentsForProject(project, [strongStudent])
  const explicit = await rankStudentsForProject({ ...project, matching_weights: defaults }, [strongStudent])
  assert.deepEqual(explicit.students, legacy.students)
})

test('experience and academic weights can be configured without skill or GPA contributions', async () => {
  const expert = { id: 'expert', department: 'Computer Science', research_experience: 'Research internship' }
  const beginner = { id: 'beginner', department: 'Biology' }
  for (const factor of ['experience', 'academic']) {
    const weights = { semantic: 0, skills: 0, academic: 0, gpa: 0, experience: 0, [factor]: 100 }
    const ranking = await rankStudentsForProject({ department: 'Computer Science', matching_weights: weights }, [beginner, expert])
    assert.deepEqual(ranking.students.map((student) => [student.id, student.match_score]), [['expert', 100], ['beginner', 0]])
  }
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
