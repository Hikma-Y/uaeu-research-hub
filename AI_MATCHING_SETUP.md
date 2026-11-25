# Matching setup

This build uses the same matching logic in every relevant place:

- Faculty project → suitable students before invitations
- Student profile → recommended public projects
- Student profile → recommended faculty supervisors
- Student research idea → suitable faculty supervisors

It combines Sentence-BERT semantic relevance with skills, academic-area fit, GPA, experience, and faculty availability. The score is an explainable ranking aid; it never accepts or rejects anyone automatically.

## 1. Run the matching database migration

In Supabase SQL Editor, run this file once **after the existing project and invitation migrations**:

```text
supabase/migrations/20261004_complete_matching.sql
```

It adds the optional project `minimum_gpa` field, a secure candidate-data RPC, and server-side GPA enforcement for both applications and invitations. It does not create duplicate profile or project tables.

## 2. Connect the React app

Add this to the root `.env` file with the Supabase variables:

```text
VITE_MATCHING_API_URL=http://localhost:8000
```

Restart the React app after changing `.env`.

## 3. Start the local matching service

Open a second PowerShell window in the project folder:

```powershell
cd matching-service
py -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --port 8000
```

The first start downloads the pre-trained Sentence-BERT model, so it needs internet access and can take a few minutes. Leave this window open while testing. Check it at [http://localhost:8000/api/health](http://localhost:8000/api/health).

If the service is unavailable, the app deliberately keeps working with its transparent structured fallback instead of claiming AI is running.

## 4. Test every matching surface

1. As faculty, create a project with skills, description, and an optional minimum GPA. Open the project, choose **Invite / Rank students**, and confirm eligible students appear first with match reasons.
2. As a student, open **Opportunities**. Projects should be ordered by compatibility, with a score and reasons. A project whose minimum GPA is not met is clearly marked and cannot be applied for.
3. As a student, open **Idea Portal → Find faculty**. Faculty should be ranked by the saved profile. Submit or select an idea to see idea-specific faculty rankings.
4. Try an application or invitation below the minimum GPA. Supabase must reject it even if the page is manually altered.

## Per-project matching priorities

Faculty can configure **Matching priorities** while creating or editing a project. Each factor accepts a whole-number percentage from 0 to 100; all five must total exactly 100%. A live total, validation, and **Reset to defaults** are available in the form.

| Factor | Default | Meaning |
| --- | --- | --- |
| Research relevance (`semantic`) | 40% | Sentence-BERT similarity; text overlap in the structured fallback |
| Skills (`skills`) | 25% | Coverage of required project skills |
| Academic alignment (`academic`) | 10% | Department/major alignment |
| GPA (`gpa`) | 10% | GPA normalized to the 4.0 scale |
| Experience / coursework (`experience`) | 15% | Listed experience or relevant coursework |

For example, a skills-focused project could use **30 / 45 / 5 / 5 / 15** in the order above. An exploratory project could put more emphasis on relevance and less on prior experience. These are prioritization choices, not validated predictions or automated acceptance decisions.

The saved `matching_weights` apply consistently to **faculty → candidate students** and **student → project recommendations**, in both the semantic service and structured fallback. Supervisor/idea matching has no project context and remains unchanged. Zero excludes a factor from the score and positive match reasons, but **minimum GPA remains a separate hard eligibility rule** even at 0% GPA weight. Existing projects retain the original default weighting.

### Deployment order

1. In Supabase SQL Editor, apply `supabase/migrations/20261125_project_matching_weights.sql` after the existing complete-matching and private-project invitation migrations. It adds the validated JSONB project setting and exposes the weights and minimum GPA through the existing student view, preserving its filters, security options, and grants. It does not change project ownership policies or invitation/application rules.
2. Redeploy the Python matching service with its updated requirements. Both project ranking endpoints now return `project_weights_applied: true`; `/api/health` reports `matching_weights_supported: true`.
3. Rebuild/redeploy the frontend. Faculty can then save priorities in **My Projects → Create/Edit project → Matching priorities**. Reload recommendations after changing saved priorities.

If a frontend with custom project weights contacts an older semantic deployment, it explicitly uses the correctly weighted structured fallback and displays an update notice. It never silently accepts fixed-weight AI scores for a custom-weight project. Default-weight projects continue to work with older service versions.

### Verification

- Run `npm test` for defaults, strict validation, project-specific rank changes, zero weights, and unchanged GPA eligibility.
- In `matching-service`, install `requirements.txt` and `requirements-test.txt`, then run `python -m unittest discover -s tests -v`. Tests use a fake encoder and do not download a model.
- Run the Supabase tests, including `supabase/tests/project_matching_weights.test.mjs`, with the temporary PGlite setup described in the README. They check database constraints, ownership, and preservation of student-view visibility/security.
- Create two projects with different priorities and compare the same students' rankings. Edit/save/reopen a project to confirm persistence; verify student recommendations use the same saved weights.

## Fine-tune later

Do not train on scores generated by this app. Copy the data template to a local file, collect faculty-reviewed and anonymised pairs, then train:

```powershell
Copy-Item data\faculty_labelled_pairs.template.csv data\faculty_labelled_pairs.local.csv
.\.venv\Scripts\python.exe -m app.train
```

Read `matching-service/DATASET_GUIDE.md` before collecting labels. The service automatically uses `matching-service/models/uaeu-sbert-matcher` after training.
