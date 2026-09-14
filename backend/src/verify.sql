SELECT 'users' AS table_name, count(*) AS rows FROM users
UNION ALL SELECT 'student_profiles', count(*) FROM student_profiles
UNION ALL SELECT 'faculty_profiles', count(*) FROM faculty_profiles
UNION ALL SELECT 'projects', count(*) FROM projects
UNION ALL SELECT 'applications', count(*) FROM applications
UNION ALL SELECT 'documents', count(*) FROM documents
UNION ALL SELECT 'messages', count(*) FROM messages;

SELECT
  a.id AS application_id,
  student.full_name AS student,
  sp.major,
  sp.gpa,
  p.title AS project,
  faculty.full_name AS faculty_owner,
  a.status
FROM applications a
JOIN users student ON student.id = a.student_id
JOIN student_profiles sp ON sp.user_id = student.id
JOIN projects p ON p.id = a.project_id
JOIN users faculty ON faculty.id = p.owner_id
ORDER BY a.id;
