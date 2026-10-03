"""Local semantic matching API for the UAEU Research Hub.

The browser sends only the profile fields already available to the signed-in
user. The service does not connect to Supabase and does not need a service key.
It combines Sentence-BERT similarity with explainable profile criteria.
"""

from __future__ import annotations

import os
from pathlib import Path
from typing import Any

import numpy as np
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from sentence_transformers import SentenceTransformer


SERVICE_DIRECTORY = Path(__file__).resolve().parents[1]
DEFAULT_MODEL = "sentence-transformers/all-MiniLM-L6-v2"
TRAINED_MODEL_DIRECTORY = SERVICE_DIRECTORY / "models" / "uaeu-sbert-matcher"


class ProjectInput(BaseModel):
    title: str = ""
    description: str = ""
    type: str = ""
    department: str = ""
    tags: list[str] = Field(default_factory=list)
    requirements: list[str] = Field(default_factory=list)
    minimum_gpa: float | None = None


class ProjectCandidate(ProjectInput):
    project_id: str


class StudentInput(BaseModel):
    student_id: str
    major: str | None = None
    department: str | None = None
    gpa: float | None = None
    skills: list[str] = Field(default_factory=list)
    research_interests: list[str] = Field(default_factory=list)
    relevant_coursework: list[str] = Field(default_factory=list)
    research_tools: list[str] = Field(default_factory=list)
    has_research_experience: bool = False
    research_experience: str | None = None
    bio: str | None = None
    experience_entries: list[dict[str, Any]] = Field(default_factory=list)


class FacultyInput(BaseModel):
    faculty_id: str
    full_name: str = ""
    department: str | None = None
    research_interests: list[str] = Field(default_factory=list)
    skills: list[str] = Field(default_factory=list)
    research_experience: str | None = None
    supervision_status: str | None = "available"
    supervision_capacity: float | None = None


class IdeaInput(BaseModel):
    title: str = ""
    category: str = ""
    description: str = ""


class RankRequest(BaseModel):
    project: ProjectInput
    students: list[StudentInput] = Field(default_factory=list)


class RankProjectsRequest(BaseModel):
    student: StudentInput
    projects: list[ProjectCandidate] = Field(default_factory=list)


class RankFacultyRequest(BaseModel):
    student: StudentInput
    faculty: list[FacultyInput] = Field(default_factory=list)


class RankFacultyForIdeaRequest(BaseModel):
    idea: IdeaInput
    faculty: list[FacultyInput] = Field(default_factory=list)


class CandidateResult(BaseModel):
    student_id: str
    match_score: int
    semantic_score: int
    skill_score: int
    major_score: int
    gpa_score: int
    experience_score: int
    eligible: bool
    eligibility_reason: str | None = None
    reasons: list[str]


class ProjectResult(BaseModel):
    project_id: str
    match_score: int
    semantic_score: int
    skill_score: int
    major_score: int
    gpa_score: int
    experience_score: int
    eligible: bool
    eligibility_reason: str | None = None
    reasons: list[str]


class FacultyResult(BaseModel):
    faculty_id: str
    match_score: int
    semantic_score: int
    topic_score: int
    skills_score: int
    department_score: int
    available: bool
    availability_reason: str | None = None
    reasons: list[str]


class RankResponse(BaseModel):
    engine: str
    trained: bool
    results: list[CandidateResult]


class RankProjectsResponse(BaseModel):
    engine: str
    trained: bool
    results: list[ProjectResult]


class FacultyRankResponse(BaseModel):
    engine: str
    trained: bool
    results: list[FacultyResult]


def clean_text(value: object) -> str:
    return " ".join(str(value or "").lower().split())


SKILL_ALIASES = {
    "ai": "artificial intelligence",
    "artificial intelligence": "artificial intelligence",
    "ml": "machine learning",
    "machine learning": "machine learning",
    "dl": "deep learning",
    "deep learning": "deep learning",
    "nlp": "natural language processing",
    "natural language processing": "natural language processing",
    "natural-language processing": "natural language processing",
    "cv": "computer vision",
    "computer vision": "computer vision",
    "iot": "internet of things",
    "internet of things": "internet of things",
    "js": "javascript",
    "javascript": "javascript",
    "ts": "typescript",
    "typescript": "typescript",
    "node": "node.js",
    "nodejs": "node.js",
    "node.js": "node.js",
    "reactjs": "react",
    "react": "react",
    "postgres": "postgresql",
    "postgresql": "postgresql",
    "sklearn": "scikit-learn",
    "scikit learn": "scikit-learn",
    "scikit-learn": "scikit-learn",
    "powerbi": "power bi",
    "power bi": "power bi",
}


def canonical_skill(value: object) -> str:
    """Return a stable name for commonly interchangeable skill labels."""
    normalized = clean_text(value)
    return SKILL_ALIASES.get(normalized, normalized)


def as_text(items: list[object]) -> list[str]:
    return [str(item).strip() for item in items if str(item or "").strip()]


def entry_text(entries: list[dict[str, Any]]) -> list[str]:
    values: list[str] = []
    for entry in entries:
        for key in ("title", "description", "role", "organisation", "organization"):
            value = entry.get(key)
            if value:
                values.append(str(value))
    return values


def unique(items: list[object]) -> list[str]:
    result: list[str] = []
    seen: set[str] = set()
    for item in as_text(items):
        key = clean_text(item)
        if key and key not in seen:
            result.append(item)
            seen.add(key)
    return result


def project_document(project: ProjectInput) -> str:
    return ". ".join(
        as_text(
            [
                project.title,
                project.description,
                project.type,
                project.department,
                *project.tags,
                *project.requirements,
            ]
        )
    )


def student_document(student: StudentInput) -> str:
    return ". ".join(
        as_text(
            [
                student.major,
                student.department,
                student.research_experience,
                student.bio,
                *student.research_interests,
                *student.skills,
                *student.research_tools,
                *student.relevant_coursework,
                *entry_text(student.experience_entries),
            ]
        )
    )


def faculty_document(faculty: FacultyInput) -> str:
    return ". ".join(
        as_text(
            [
                faculty.full_name,
                faculty.department,
                faculty.research_experience,
                *faculty.research_interests,
                *faculty.skills,
            ]
        )
    )


def idea_document(idea: IdeaInput) -> str:
    return ". ".join(as_text([idea.title, idea.category, idea.description]))


def same_or_contains(left: str, right: str) -> bool:
    left_value = canonical_skill(left)
    right_value = canonical_skill(right)
    return bool(
        left_value
        and right_value
        and (left_value == right_value or left_value in right_value or right_value in left_value)
    )


def required_skills(project: ProjectInput) -> list[str]:
    return unique([*project.requirements, *project.tags])


def coverage(wanted: list[str], available: list[str]) -> tuple[float, list[str]]:
    if not wanted:
        return 0.5, []
    matched = [
        item
        for item in wanted
        if any(same_or_contains(item, candidate) for candidate in available)
    ]
    return len(matched) / len(wanted), matched


def gpa_eligibility(project: ProjectInput, student: StudentInput) -> tuple[bool, str | None]:
    if project.minimum_gpa is None:
        return True, None
    if student.gpa is None:
        return False, f"A GPA of {project.minimum_gpa:g} or higher is required; no GPA is available."
    if student.gpa < project.minimum_gpa:
        return False, f"Minimum GPA is {project.minimum_gpa:g}; current GPA is {student.gpa:g}."
    return True, None


def structured_scores(project: ProjectInput, student: StudentInput) -> tuple[float, float, float, float, list[str]]:
    requirements = required_skills(project)
    skill_score, matched_skills = coverage(requirements, unique([*student.skills, *student.research_tools]))

    department = clean_text(project.department)
    major_score = 0.5 if not department else float(
        same_or_contains(department, student.major or "")
        or same_or_contains(department, student.department or "")
    )
    gpa_score = max(0.0, min(float(student.gpa or 0) / 4.0, 1.0))
    has_experience = (
        student.has_research_experience
        or bool(student.experience_entries)
        or bool(student.relevant_coursework)
        or bool(clean_text(student.research_experience))
    )
    experience_score = 1.0 if has_experience else 0.0

    reasons: list[str] = []
    if matched_skills:
        reasons.append(f"{len(matched_skills)}/{len(requirements)} required skills matched")
    if major_score == 1:
        reasons.append("Major or department aligns")
    if gpa_score >= 0.75:
        reasons.append("Strong GPA profile")
    if has_experience:
        reasons.append("Relevant experience or coursework listed")
    return skill_score, major_score, gpa_score, experience_score, reasons


def supervision_availability(faculty: FacultyInput) -> tuple[bool, float, str | None]:
    status = clean_text(faculty.supervision_status or "available")
    if "unavailable" in status or "full" in status or faculty.supervision_capacity == 0:
        return False, 0.0, "Not currently accepting new students"
    if "limited" in status:
        return True, 0.5, "Limited supervision availability"
    return True, 1.0, None


class SemanticMatcher:
    def __init__(self) -> None:
        self.model_path = Path(os.getenv("MATCHING_MODEL_PATH", TRAINED_MODEL_DIRECTORY))
        self.trained = self.model_path.exists()
        model_identifier = str(self.model_path) if self.trained else os.getenv("MATCHING_BASE_MODEL", DEFAULT_MODEL)
        self.model = SentenceTransformer(model_identifier)
        self.engine = "Fine-tuned Sentence-BERT" if self.trained else "Pre-trained Sentence-BERT"

    def score_pair(self, project: ProjectInput, student: StudentInput, similarity: float) -> dict[str, object]:
        semantic_score = float(np.clip(similarity, 0.0, 1.0))
        skill_score, major_score, gpa_score, experience_score, reasons = structured_scores(project, student)
        eligible, eligibility_reason = gpa_eligibility(project, student)
        final_score = round(
            100
            * (
                semantic_score * 0.40
                + skill_score * 0.25
                + major_score * 0.10
                + gpa_score * 0.10
                + experience_score * 0.15
            )
        )
        if semantic_score >= 0.35:
            reasons.insert(0, "Research focus is semantically relevant")
        if not eligible and eligibility_reason:
            reasons.insert(0, eligibility_reason)

        return {
            "match_score": final_score,
            "semantic_score": round(semantic_score * 100),
            "skill_score": round(skill_score * 100),
            "major_score": round(major_score * 100),
            "gpa_score": round(gpa_score * 100),
            "experience_score": round(experience_score * 100),
            "eligible": eligible,
            "eligibility_reason": eligibility_reason,
            "reasons": reasons[:3],
        }

    def rank(self, request: RankRequest) -> RankResponse:
        if not request.students:
            return RankResponse(engine=self.engine, trained=self.trained, results=[])

        project_embedding = self.model.encode(
            project_document(request.project), normalize_embeddings=True, show_progress_bar=False
        )
        student_embeddings = self.model.encode(
            [student_document(student) for student in request.students],
            normalize_embeddings=True,
            show_progress_bar=False,
        )
        similarities = np.dot(student_embeddings, project_embedding)
        results = [
            CandidateResult(
                student_id=student.student_id,
                **self.score_pair(request.project, student, float(similarity)),
            )
            for student, similarity in zip(request.students, similarities)
        ]
        return RankResponse(
            engine=self.engine,
            trained=self.trained,
            results=sorted(results, key=lambda item: (not item.eligible, -item.match_score)),
        )

    def rank_projects(self, request: RankProjectsRequest) -> RankProjectsResponse:
        if not request.projects:
            return RankProjectsResponse(engine=self.engine, trained=self.trained, results=[])

        student_embedding = self.model.encode(
            student_document(request.student), normalize_embeddings=True, show_progress_bar=False
        )
        project_embeddings = self.model.encode(
            [project_document(project) for project in request.projects],
            normalize_embeddings=True,
            show_progress_bar=False,
        )
        similarities = np.dot(project_embeddings, student_embedding)
        results = [
            ProjectResult(
                project_id=project.project_id,
                **self.score_pair(project, request.student, float(similarity)),
            )
            for project, similarity in zip(request.projects, similarities)
        ]
        return RankProjectsResponse(
            engine=self.engine,
            trained=self.trained,
            results=sorted(results, key=lambda item: (not item.eligible, -item.match_score)),
        )

    def faculty_result_for_student(self, student: StudentInput, faculty: FacultyInput, similarity: float) -> FacultyResult:
        semantic_score = float(np.clip(similarity, 0.0, 1.0))
        topic_score, matched_topics = coverage(student.research_interests, faculty.research_interests)
        skills_score, matched_skills = coverage(unique([*student.skills, *student.research_tools]), faculty.skills)
        student_area = student.department or student.major or ""
        department_score = 0.5 if not clean_text(student_area) or not clean_text(faculty.department) else float(
            same_or_contains(student_area, faculty.department or "")
        )
        available, availability_score, availability_reason = supervision_availability(faculty)
        match_score = round(100 * (
            semantic_score * 0.45
            + topic_score * 0.25
            + skills_score * 0.15
            + department_score * 0.10
            + availability_score * 0.05
        ))
        reasons: list[str] = []
        if semantic_score >= 0.35:
            reasons.append("Research interests and expertise are semantically relevant")
        if matched_topics:
            reasons.append(f"Shared interests: {', '.join(matched_topics[:3])}")
        if matched_skills:
            reasons.append(f"Related expertise: {', '.join(matched_skills[:3])}")
        if department_score == 1:
            reasons.append("Department or major aligns")
        if availability_reason:
            reasons.insert(0, availability_reason)
        return FacultyResult(
            faculty_id=faculty.faculty_id,
            match_score=match_score,
            semantic_score=round(semantic_score * 100),
            topic_score=round(topic_score * 100),
            skills_score=round(skills_score * 100),
            department_score=round(department_score * 100),
            available=available,
            availability_reason=availability_reason,
            reasons=reasons[:3],
        )

    def rank_faculty(self, request: RankFacultyRequest) -> FacultyRankResponse:
        if not request.faculty:
            return FacultyRankResponse(engine=self.engine, trained=self.trained, results=[])
        student_embedding = self.model.encode(
            student_document(request.student), normalize_embeddings=True, show_progress_bar=False
        )
        faculty_embeddings = self.model.encode(
            [faculty_document(person) for person in request.faculty],
            normalize_embeddings=True,
            show_progress_bar=False,
        )
        similarities = np.dot(faculty_embeddings, student_embedding)
        results = [
            self.faculty_result_for_student(request.student, person, float(similarity))
            for person, similarity in zip(request.faculty, similarities)
        ]
        return FacultyRankResponse(
            engine=self.engine,
            trained=self.trained,
            results=sorted(results, key=lambda item: (not item.available, -item.match_score)),
        )

    def faculty_result_for_idea(self, idea: IdeaInput, faculty: FacultyInput, similarity: float) -> FacultyResult:
        semantic_score = float(np.clip(similarity, 0.0, 1.0))
        idea_topics = unique([idea.title, idea.category, idea.description])
        faculty_expertise = unique([
            *faculty.research_interests,
            *faculty.skills,
        ])
        topic_score, _ = coverage(idea_topics, unique([
            *faculty_expertise,
            faculty.research_experience or "",
            faculty.department or "",
        ]))
        matched_topics = [
            expertise
            for expertise in faculty_expertise
            if any(same_or_contains(expertise, topic) for topic in idea_topics)
        ]
        available, availability_score, availability_reason = supervision_availability(faculty)
        match_score = round(100 * (semantic_score * 0.60 + topic_score * 0.30 + availability_score * 0.10))
        reasons: list[str] = []
        if semantic_score >= 0.35:
            reasons.append("Idea topic is semantically relevant to this expertise")
        if matched_topics:
            reasons.append(f"Relevant expertise: {', '.join(matched_topics[:3])}")
        if availability_reason:
            reasons.insert(0, availability_reason)
        return FacultyResult(
            faculty_id=faculty.faculty_id,
            match_score=match_score,
            semantic_score=round(semantic_score * 100),
            topic_score=round(topic_score * 100),
            skills_score=0,
            department_score=0,
            available=available,
            availability_reason=availability_reason,
            reasons=reasons[:3],
        )

    def rank_faculty_for_idea(self, request: RankFacultyForIdeaRequest) -> FacultyRankResponse:
        if not request.faculty:
            return FacultyRankResponse(engine=self.engine, trained=self.trained, results=[])
        idea_embedding = self.model.encode(
            idea_document(request.idea), normalize_embeddings=True, show_progress_bar=False
        )
        faculty_embeddings = self.model.encode(
            [faculty_document(person) for person in request.faculty],
            normalize_embeddings=True,
            show_progress_bar=False,
        )
        similarities = np.dot(faculty_embeddings, idea_embedding)
        results = [
            self.faculty_result_for_idea(request.idea, person, float(similarity))
            for person, similarity in zip(request.faculty, similarities)
        ]
        return FacultyRankResponse(
            engine=self.engine,
            trained=self.trained,
            results=sorted(results, key=lambda item: (not item.available, -item.match_score)),
        )


matcher: SemanticMatcher | None = None


def get_matcher() -> SemanticMatcher:
    global matcher
    if matcher is None:
        matcher = SemanticMatcher()
    return matcher


app = FastAPI(title="UAEU Research Hub Matching Service", version="1.1.0")

allowed_origins = os.getenv("MATCHING_ALLOWED_ORIGINS", "http://localhost:5173").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin.strip() for origin in allowed_origins if origin.strip()],
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)


@app.get("/api/health")
def health() -> dict[str, object]:
    active_matcher = get_matcher()
    return {"status": "ok", "engine": active_matcher.engine, "trained": active_matcher.trained}


@app.post("/api/match/rank", response_model=RankResponse)
def rank_students(request: RankRequest) -> RankResponse:
    return get_matcher().rank(request)


@app.post("/api/match/rank-projects", response_model=RankProjectsResponse)
def rank_projects(request: RankProjectsRequest) -> RankProjectsResponse:
    return get_matcher().rank_projects(request)


@app.post("/api/match/rank-faculty", response_model=FacultyRankResponse)
def rank_faculty(request: RankFacultyRequest) -> FacultyRankResponse:
    return get_matcher().rank_faculty(request)


@app.post("/api/match/rank-faculty-for-idea", response_model=FacultyRankResponse)
def rank_faculty_for_idea(request: RankFacultyForIdeaRequest) -> FacultyRankResponse:
    return get_matcher().rank_faculty_for_idea(request)
