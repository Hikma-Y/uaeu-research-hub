CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY,
  email TEXT UNIQUE NOT NULL CHECK (email = lower(email)),
  password_hash TEXT NOT NULL,
  full_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('student', 'faculty', 'admin')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS student_profiles (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  major TEXT,
  academic_standing TEXT,
  gpa NUMERIC(3,2) CHECK (gpa IS NULL OR (gpa BETWEEN 0 AND 4)),
  skills TEXT[] NOT NULL DEFAULT '{}',
  research_interests TEXT[] NOT NULL DEFAULT '{}',
  experience TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS faculty_profiles (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expertise TEXT[] NOT NULL DEFAULT '{}',
  research_interests TEXT[] NOT NULL DEFAULT '{}',
  publications TEXT[] NOT NULL DEFAULT '{}',
  office_number TEXT,
  google_scholar_url TEXT,
  supervision_status TEXT,
  supervision_capacity INTEGER CHECK (supervision_capacity IS NULL OR supervision_capacity >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One-time compatibility migration for databases created by earlier project versions.
DO $$
BEGIN
  IF to_regclass('public.profiles') IS NOT NULL THEN
    INSERT INTO student_profiles (user_id,major,academic_standing,gpa,skills,research_interests,experience,updated_at)
    SELECT p.user_id,p.major,p.academic_standing,p.gpa,p.skills,p.research_interests,p.experience,p.updated_at
    FROM profiles p JOIN users u ON u.id=p.user_id WHERE u.role='student'
    ON CONFLICT (user_id) DO NOTHING;
    INSERT INTO faculty_profiles (user_id,expertise,research_interests,publications,office_number,google_scholar_url,supervision_status,supervision_capacity,updated_at)
    SELECT p.user_id,p.expertise,p.research_interests,p.publications,p.office_number,p.google_scholar_url,p.supervision_status,p.supervision_capacity,p.updated_at
    FROM profiles p JOIN users u ON u.id=p.user_id WHERE u.role='faculty'
    ON CONFLICT (user_id) DO NOTHING;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS documents (
  id BIGSERIAL PRIMARY KEY,
  owner_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  document_type TEXT NOT NULL,
  original_name TEXT NOT NULL,
  stored_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL CHECK (size_bytes <= 10485760),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS projects (
  id BIGSERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  abstract TEXT NOT NULL,
  program_type TEXT NOT NULL,
  department TEXT NOT NULL,
  research_centre TEXT,
  funding_type TEXT NOT NULL,
  required_skills TEXT[] NOT NULL DEFAULT '{}',
  qualifications TEXT,
  owner_id BIGINT NOT NULL REFERENCES users(id),
  capacity INTEGER NOT NULL CHECK (capacity > 0),
  start_date DATE,
  end_date DATE,
  application_deadline DATE,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','open','closed','archived')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (end_date IS NULL OR start_date IS NULL OR end_date >= start_date)
);

CREATE TABLE IF NOT EXISTS applications (
  id BIGSERIAL PRIMARY KEY,
  project_id BIGINT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  student_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'under_review' CHECK (status IN ('under_review','shortlisted','accepted','rejected','withdrawn')),
  cover_note TEXT,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(project_id, student_id)
);

CREATE TABLE IF NOT EXISTS milestones (
  id BIGSERIAL PRIMARY KEY,
  project_id BIGINT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  due_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'not_started' CHECK (status IN ('not_started','in_progress','submitted','completed','overdue')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS deliverables (
  id BIGSERIAL PRIMARY KEY,
  milestone_id BIGINT NOT NULL REFERENCES milestones(id) ON DELETE CASCADE,
  student_id BIGINT NOT NULL REFERENCES users(id),
  document_id BIGINT REFERENCES documents(id),
  note TEXT,
  feedback TEXT,
  evaluation TEXT,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS research_ideas (
  id BIGSERIAL PRIMARY KEY,
  student_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  category TEXT NOT NULL,
  description TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted','under_review','adopted','closed')),
  faculty_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS announcements (
  id BIGSERIAL PRIMARY KEY,
  author_id BIGINT NOT NULL REFERENCES users(id),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  announcement_type TEXT NOT NULL,
  event_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS notifications (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  notification_type TEXT NOT NULL,
  is_read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS chats (
  id BIGSERIAL PRIMARY KEY,
  name TEXT,
  chat_type TEXT NOT NULL CHECK (chat_type IN ('direct','group')),
  project_id BIGINT REFERENCES projects(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS chat_members (
  chat_id BIGINT NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (chat_id, user_id)
);

CREATE TABLE IF NOT EXISTS messages (
  id BIGSERIAL PRIMARY KEY,
  chat_id BIGINT NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  sender_id BIGINT NOT NULL REFERENCES users(id),
  body TEXT,
  document_id BIGINT REFERENCES documents(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (body IS NOT NULL OR document_id IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS project_updates (
  id BIGSERIAL PRIMARY KEY,
  project_id BIGINT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  author_id BIGINT NOT NULL REFERENCES users(id),
  update_type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);
CREATE INDEX IF NOT EXISTS idx_projects_filters ON projects(program_type, department, funding_type);
CREATE INDEX IF NOT EXISTS idx_applications_project ON applications(project_id);
CREATE INDEX IF NOT EXISTS idx_applications_student ON applications(student_id);
CREATE INDEX IF NOT EXISTS idx_messages_chat_created ON messages(chat_id, created_at);
CREATE INDEX IF NOT EXISTS idx_notifications_user_read ON notifications(user_id, is_read);
CREATE UNIQUE INDEX IF NOT EXISTS idx_documents_seed_unique ON documents(owner_id, document_type, original_name);

CREATE OR REPLACE FUNCTION close_full_or_expired_projects() RETURNS trigger AS $$
BEGIN
  UPDATE projects p
  SET status = 'closed', updated_at = now()
  WHERE p.status = 'open'
    AND (p.application_deadline < CURRENT_DATE OR
      (SELECT count(*) FROM applications a WHERE a.project_id = p.id AND a.status = 'accepted') >= p.capacity);
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS applications_auto_close_projects ON applications;
CREATE TRIGGER applications_auto_close_projects
AFTER INSERT OR UPDATE ON applications
FOR EACH STATEMENT EXECUTE FUNCTION close_full_or_expired_projects();
