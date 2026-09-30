import 'dotenv/config'
import bcrypt from 'bcryptjs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { pool, transaction } from './db.js'

const here = dirname(fileURLToPath(import.meta.url))
const schema = await readFile(join(here, 'schema.sql'), 'utf8')
await pool.query(schema)
const uploadPath = join(here, '..', 'uploads')
await mkdir(uploadPath, { recursive: true })

const passwordHash = await bcrypt.hash('Demo123!', 12)
await transaction(async (db) => {
  const demoUsers = [
    ['student@uaeu.ac.ae', 'Alya Al Nuaimi', 'student'],
    ['omar.student@uaeu.ac.ae', 'Omar Al Mansoori', 'student'],
    ['mariam.student@uaeu.ac.ae', 'Mariam Al Shamsi', 'student'],
    ['faculty@uaeu.ac.ae', 'Dr. Sara Al Mansoori', 'faculty'],
    ['admin@uaeu.ac.ae', 'Research Administration', 'admin'],
  ]
  for (const [email, name, role] of demoUsers) {
    await db.query(`INSERT INTO users (email,password_hash,full_name,role) VALUES ($1,$2,$3,$4)
      ON CONFLICT (email) DO UPDATE SET full_name=EXCLUDED.full_name, role=EXCLUDED.role`, [email, passwordHash, name, role])
  }
  const users = await db.query('SELECT id,email FROM users WHERE email = ANY($1)', [demoUsers.map(([email]) => email)])
  const ids = Object.fromEntries(users.rows.map((u) => [u.email, u.id]))
  await db.query(`INSERT INTO student_profiles (user_id,major,academic_standing,gpa,skills,research_interests,experience)
    VALUES ($1,'Information Technology','Senior',3.87,ARRAY['Python','React','Research Writing'],ARRAY['Artificial Intelligence','Educational Technology'],'UAEU course and prototype research experience')
    ON CONFLICT (user_id) DO NOTHING`, [ids['student@uaeu.ac.ae']])
  await db.query(`INSERT INTO student_profiles (user_id,major,academic_standing,gpa,skills,research_interests,experience)
    VALUES ($1,'Computer Science','Senior',3.65,ARRAY['Python','Machine Learning','Data Analysis'],ARRAY['Artificial Intelligence','Data Science'],'Completed a machine-learning course project and participated in the UAEU innovation challenge.')
    ON CONFLICT (user_id) DO NOTHING`, [ids['omar.student@uaeu.ac.ae']])
  await db.query(`INSERT INTO student_profiles (user_id,major,academic_standing,gpa,skills,research_interests,experience)
    VALUES ($1,'Information Technology','Senior',3.72,ARRAY['React','UI/UX','PostgreSQL'],ARRAY['Educational Technology','Human-Computer Interaction'],'Developed a student-services dashboard and assisted with usability testing.')
    ON CONFLICT (user_id) DO NOTHING`, [ids['mariam.student@uaeu.ac.ae']])
  await db.query(`INSERT INTO faculty_profiles (user_id,research_interests,expertise,publications,office_number,google_scholar_url,supervision_status,supervision_capacity)
    VALUES ($1,ARRAY['Artificial Intelligence','NLP'],ARRAY['Machine Learning','Data Science'],ARRAY['Selected UAEU research publications'],'CIT-2-148','https://scholar.google.com/','Available for new SGP students',4)
    ON CONFLICT (user_id) DO NOTHING`, [ids['faculty@uaeu.ac.ae']])
  await db.query(`INSERT INTO projects (title,abstract,program_type,department,research_centre,funding_type,required_skills,owner_id,capacity,start_date,end_date,application_deadline,status)
    SELECT 'AI-Based Research Collaboration Platform','Design and evaluate a centralized platform supporting UAEU research collaboration.','SGP','Computer Science','CIT Research Lab','Volunteer',ARRAY['React','Node.js','PostgreSQL'],$1,5,'2026-09-01','2027-05-15','2026-09-30','open'
    WHERE NOT EXISTS (SELECT 1 FROM projects)`, [ids['faculty@uaeu.ac.ae']])
  const project = await db.query('SELECT id FROM projects ORDER BY id LIMIT 1')
  if (project.rows[0]) {
    await db.query(`INSERT INTO milestones (project_id,title,description,due_date,status)
      SELECT $1,'Requirements and database design','Confirm requirements and implement the initial data model.','2026-10-15','in_progress'
      WHERE NOT EXISTS (SELECT 1 FROM milestones WHERE project_id=$1)`, [project.rows[0].id])
    const applicants = [
      ['student@uaeu.ac.ae','shortlisted','Interested in applying full-stack development and research-writing skills.'],
      ['omar.student@uaeu.ac.ae','under_review','Interested in the data analysis and machine-learning components.'],
      ['mariam.student@uaeu.ac.ae','under_review','Interested in interface design and platform evaluation.'],
    ]
    for (const [email,status,note] of applicants) {
      await db.query(`INSERT INTO applications (project_id,student_id,status,cover_note) VALUES ($1,$2,$3,$4)
        ON CONFLICT (project_id,student_id) DO UPDATE SET status=EXCLUDED.status,cover_note=EXCLUDED.cover_note`, [project.rows[0].id,ids[email],status,note])
    }
  }
  const demoDocuments = [
    ['student@uaeu.ac.ae','CV','Alya_Al_Nuaimi_CV.txt','alya-cv.txt','Alya Al Nuaimi - Curriculum Vitae\nMajor: Information Technology\nSkills: Python, React, Research Writing\n'],
    ['student@uaeu.ac.ae','Transcript','Alya_Al_Nuaimi_Transcript.txt','alya-transcript.txt','Alya Al Nuaimi - Academic Transcript\nGPA: 3.87\nAcademic standing: Senior\n'],
    ['omar.student@uaeu.ac.ae','CV','Omar_Al_Mansoori_CV.txt','omar-cv.txt','Omar Al Mansoori - Curriculum Vitae\nMajor: Computer Science\nSkills: Python, Machine Learning, Data Analysis\n'],
    ['mariam.student@uaeu.ac.ae','CV','Mariam_Al_Shamsi_CV.txt','mariam-cv.txt','Mariam Al Shamsi - Curriculum Vitae\nMajor: Information Technology\nSkills: React, UI/UX, PostgreSQL\n'],
  ]
  for (const [email,type,originalName,storedName,contents] of demoDocuments) {
    await writeFile(join(uploadPath, storedName), contents, 'utf8')
    await db.query(`INSERT INTO documents (owner_id,document_type,original_name,stored_name,mime_type,size_bytes)
      VALUES ($1,$2,$3,$4,'text/plain',$5) ON CONFLICT (owner_id,document_type,original_name)
      DO UPDATE SET stored_name=EXCLUDED.stored_name,size_bytes=EXCLUDED.size_bytes`, [ids[email],type,originalName,storedName,Buffer.byteLength(contents)])
  }
  await db.query(`INSERT INTO announcements (author_id,title,body,announcement_type,event_date)
    SELECT $1,'SURE+ application window','Students can submit SURE+ applications through the Research Hub.','Deadline','2026-09-24'
    WHERE NOT EXISTS (SELECT 1 FROM announcements)`, [ids['admin@uaeu.ac.ae']])
  let chat = await db.query(`SELECT c.id FROM chats c JOIN chat_members cm ON cm.chat_id=c.id
    WHERE c.chat_type='direct' GROUP BY c.id HAVING array_agg(cm.user_id ORDER BY cm.user_id) = ARRAY[$1,$2]::bigint[]`,
    [Math.min(ids['student@uaeu.ac.ae'], ids['faculty@uaeu.ac.ae']), Math.max(ids['student@uaeu.ac.ae'], ids['faculty@uaeu.ac.ae'])])
  if (!chat.rows[0]) {
    chat = await db.query("INSERT INTO chats (name,chat_type) VALUES ('Student and Faculty','direct') RETURNING id")
    await db.query('INSERT INTO chat_members (chat_id,user_id) VALUES ($1,$2),($1,$3)', [chat.rows[0].id, ids['student@uaeu.ac.ae'], ids['faculty@uaeu.ac.ae']])
  }
})

console.log('Database schema and demo data are ready.')
await pool.end()
