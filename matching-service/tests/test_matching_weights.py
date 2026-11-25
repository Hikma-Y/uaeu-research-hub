"""Offline regression tests: python -m unittest discover -s tests -v."""

import unittest
from unittest.mock import patch

import numpy as np
from app import main
from fastapi.testclient import TestClient
from pydantic import ValidationError

DEFAULTS = {"semantic": 40, "skills": 25, "academic": 10, "gpa": 10, "experience": 15}


def only(component):
    return {key: 100 if key == component else 0 for key in DEFAULTS}


class FakeEncoder:
    """Deterministic unit embeddings with deliberately conflicting skills/topics."""

    def encode(self, sentences, **kwargs):
        def vector(text):
            return [0.0, 1.0] if "off-topic" in text else [1.0, 0.0]

        if isinstance(sentences, str):
            return np.array(vector(sentences))
        return np.array([vector(text) for text in sentences])


class MatchingWeightsTests(unittest.TestCase):
    def setUp(self):
        # Patch construction as well as the singleton: no model packages or network needed.
        self.encoder_patch = patch.object(
            main, "ONNXSentenceTransformer", return_value=FakeEncoder()
        )
        self.encoder_patch.start()
        self.addCleanup(self.encoder_patch.stop)
        self.matcher = main.SemanticMatcher()
        self.matcher.engine = "offline-test"
        self.matcher.trained = False
        self.matcher_patch = patch.object(main, "matcher", self.matcher)
        self.matcher_patch.start()
        self.addCleanup(self.matcher_patch.stop)
        self.client = TestClient(main.app)
        self.addCleanup(self.client.close)

    def post_project(self, route, project, students=None):
        if route == "/api/match/rank":
            payload = {
                "project": project,
                "students": students or [{"student_id": "student"}],
            }
        else:
            payload = {
                "student": (students or [{"student_id": "student"}])[0],
                "projects": [{**project, "project_id": "project"}],
            }
        return self.client.post(route, json=payload)

    def test_defaults_null_and_explicit_defaults_are_backwards_compatible(self):
        student = {
            "student_id": "student",
            "major": "Computing",
            "gpa": 4,
            "skills": ["Python"],
            "has_research_experience": True,
        }
        for route in ("/api/match/rank", "/api/match/rank-projects"):
            responses = []
            for supplied in (
                {},
                {"matching_weights": None},
                {"matching_weights": DEFAULTS},
            ):
                project = {
                    "department": "Computing",
                    "requirements": ["Python"],
                    **supplied,
                }
                response = self.post_project(route, project, [student])
                self.assertEqual(response.status_code, 200, response.text)
                responses.append(response.json())
            self.assertEqual(responses[0], responses[1])
            self.assertEqual(responses[0], responses[2])
            self.assertEqual(responses[0]["results"][0]["match_score"], 100)
            self.assertIs(responses[0]["project_weights_applied"], True)
        self.assertEqual(main.ProjectInput().matching_weights.model_dump(), DEFAULTS)
        self.assertEqual(
            main.ProjectInput(matching_weights=None).matching_weights.model_dump(),
            DEFAULTS,
        )

    def test_default_scores_exactly_match_legacy_arithmetic(self):
        projects = [
            {},
            {"department": "Computing", "requirements": ["Python", "SQL"]},
            {"department": "Physics", "requirements": ["Python", "SQL", "R"]},
        ]
        students = [
            main.StudentInput(student_id="missing"),
            main.StudentInput(student_id="tie", gpa=4, has_research_experience=True),
            main.StudentInput(
                student_id="partial",
                major="Computing",
                gpa=3.1,
                skills=["Python"],
                relevant_coursework=["Research methods"],
            ),
            main.StudentInput(
                student_id="tools",
                department="Physics",
                gpa=2.5,
                research_tools=["SQL", "R"],
            ),
            main.StudentInput(
                student_id="all",
                major="Computing",
                gpa=4,
                skills=["Python", "SQL", "R"],
                has_research_experience=True,
            ),
        ]
        for fields in projects:
            for supplied in (
                {},
                {"matching_weights": None},
                {"matching_weights": DEFAULTS},
            ):
                project = main.ProjectInput(**fields, **supplied)
                for student in students:
                    skill, major, gpa, experience, _ = main.structured_scores(
                        project, student
                    )
                    for similarity in (
                        -0.2,
                        0,
                        0.0125,
                        0.2,
                        0.35,
                        0.5,
                        0.6125,
                        0.99,
                        1,
                        1.2,
                    ):
                        with self.subTest(
                            project=fields,
                            supplied=supplied,
                            student=student.student_id,
                            similarity=similarity,
                        ):
                            semantic = float(np.clip(similarity, 0.0, 1.0))
                            legacy = round(
                                100
                                * (
                                    semantic * 0.40
                                    + skill * 0.25
                                    + major * 0.10
                                    + gpa * 0.10
                                    + experience * 0.15
                                )
                            )
                            self.assertEqual(
                                self.matcher.score_pair(project, student, similarity)[
                                    "match_score"
                                ],
                                legacy,
                            )
        # Legacy arithmetic yields 42.50000000000001, not the direct sum's 42.5.
        self.assertEqual(
            self.matcher.score_pair(main.ProjectInput(), students[1], 0)["match_score"],
            43,
        )

    def test_zero_weight_factors_do_not_appear_as_contributing_reasons(self):
        student = main.StudentInput(
            student_id="student",
            major="Computing",
            skills=["Python"],
            gpa=3.5,
            has_research_experience=True,
        )
        fields = {"department": "Computing", "requirements": ["Python"]}
        expected = {
            "semantic": "Research focus is semantically relevant",
            "skills": "1/1 required skills matched",
            "academic": "Major or department aligns",
            "gpa": "Strong GPA profile",
            "experience": "Relevant experience or coursework listed",
        }
        # Every factor qualifies, but only the enabled factor should be shown.
        for component, reason in expected.items():
            with self.subTest(component=component):
                project = main.ProjectInput(**fields, matching_weights=only(component))
                self.assertEqual(
                    self.matcher.score_pair(project, student, 1)["reasons"], [reason]
                )
                self.assertEqual(len(main.structured_scores(project, student)[-1]), 4)
        for gpa in (None, 2, 3.5):
            project = main.ProjectInput(
                **fields, minimum_gpa=4, matching_weights=only("skills")
            )
            candidate = student.model_copy(update={"gpa": gpa})
            result = self.matcher.score_pair(project, candidate, 1)
            self.assertFalse(result["eligible"])
            self.assertEqual(
                result["reasons"], [result["eligibility_reason"], expected["skills"]]
            )

    def test_invalid_weights_rejected_with_422_on_both_routes(self):
        invalid = [
            {},
            [],
            "defaults",
            100,
            True,
            {key: value for key, value in DEFAULTS.items() if key != "semantic"},
            {**DEFAULTS, "unexpected": 0},
            {**DEFAULTS, "academic": 9},
            {**DEFAULTS, "academic": 11},
            {**DEFAULTS, "academic": -1, "semantic": 51},
            {**only("semantic"), "semantic": 101, "skills": -1},
            {key.upper(): value for key, value in DEFAULTS.items()},
        ]
        for key in DEFAULTS:
            for value in (True, False, "10", "40", 10.0, 40.0, None, [], {}):
                invalid.append({**DEFAULTS, key: value})
        # These total 100 if bools/floats/strings are silently coerced.
        invalid.extend(
            {**only("semantic"), "semantic": 99, "skills": value}
            for value in (True, "1", 1.0)
        )
        for route in ("/api/match/rank", "/api/match/rank-projects"):
            for weights in invalid:
                with self.subTest(route=route, weights=weights):
                    response = self.post_project(route, {"matching_weights": weights})
                    self.assertEqual(response.status_code, 422, response.text)
                    self.assertIn("matching_weights", str(response.json()["detail"]))
        with self.assertRaises(ValidationError):
            main.ProjectInput(matching_weights={})

    def test_custom_weights_reverse_student_ranking(self):
        students = [
            {"student_id": "semantic", "bio": "on-topic"},
            {"student_id": "skills", "bio": "off-topic", "skills": ["Python"]},
        ]
        project = {"title": "on-topic", "requirements": ["Python"]}
        default = self.post_project("/api/match/rank", project, students).json()
        custom = self.post_project(
            "/api/match/rank", {**project, "matching_weights": only("skills")}, students
        ).json()
        self.assertEqual(
            [r["student_id"] for r in default["results"]], ["semantic", "skills"]
        )
        self.assertEqual(
            [r["student_id"] for r in custom["results"]], ["skills", "semantic"]
        )
        self.assertEqual([r["match_score"] for r in custom["results"]], [100, 0])
        self.assertIs(custom["project_weights_applied"], True)

    def test_each_project_in_rank_projects_uses_its_own_payload_weights(self):
        response = self.client.post(
            "/api/match/rank-projects",
            json={
                "student": {
                    "student_id": "student",
                    "bio": "on-topic",
                    "skills": ["Python"],
                },
                "projects": [
                    {
                        "project_id": "semantic",
                        "title": "off-topic",
                        "requirements": ["Python"],
                        "matching_weights": only("semantic"),
                    },
                    {
                        "project_id": "skills",
                        "title": "off-topic",
                        "requirements": ["Python"],
                        "matching_weights": only("skills"),
                    },
                ],
            },
        )
        self.assertEqual(response.status_code, 200, response.text)
        body = response.json()
        self.assertIs(body["project_weights_applied"], True)
        self.assertEqual(
            [(r["project_id"], r["match_score"]) for r in body["results"]],
            [("skills", 100), ("semantic", 0)],
        )

    def test_zero_weights_and_academic_mapping_use_raw_component_scores(self):
        student = main.StudentInput(
            student_id="student",
            skills=["Python"],
            major="Computing",
            gpa=3,
            has_research_experience=True,
        )
        expected = {
            "semantic": 20,
            "skills": 50,
            "academic": 100,
            "gpa": 75,
            "experience": 100,
        }
        for component, score in expected.items():
            with self.subTest(component=component):
                project = main.ProjectInput(
                    department="Computing",
                    requirements=["Python", "SQL"],
                    matching_weights=only(component),
                )
                result = self.matcher.score_pair(project, student, 0.2)
                self.assertEqual(result["match_score"], score)
        default = self.matcher.score_pair(
            main.ProjectInput(department="Computing", requirements=["Python", "SQL"]),
            student,
            0.2,
        )
        self.assertEqual(
            default["match_score"],
            round(100 * (0.2 * 0.4 + 0.5 * 0.25 + 0.1 + 0.75 * 0.1 + 0.15)),
        )

    def test_gpa_gate_and_eligibility_first_sort_are_unaffected_by_zero_gpa_weight(
        self,
    ):
        for gpa in (None, 2.9, 3.0, 4.0):
            with self.subTest(gpa=gpa):
                student = main.StudentInput(student_id="student", gpa=gpa)
                default = self.matcher.score_pair(
                    main.ProjectInput(minimum_gpa=3), student, 1
                )
                custom = self.matcher.score_pair(
                    main.ProjectInput(minimum_gpa=3, matching_weights=only("semantic")),
                    student,
                    1,
                )
                self.assertEqual(default["eligible"], custom["eligible"])
                self.assertEqual(
                    default["eligibility_reason"], custom["eligibility_reason"]
                )
                self.assertEqual(custom["eligible"], gpa is not None and gpa >= 3)
                self.assertEqual(custom["match_score"], 100)
        response = self.post_project(
            "/api/match/rank",
            {
                "title": "on-topic",
                "minimum_gpa": 3,
                "matching_weights": only("semantic"),
            },
            [
                {"student_id": "ineligible", "gpa": 2, "bio": "on-topic"},
                {"student_id": "eligible", "gpa": 3, "bio": "off-topic"},
            ],
        )
        self.assertEqual(
            [r["student_id"] for r in response.json()["results"]],
            ["eligible", "ineligible"],
        )
        response = self.client.post(
            "/api/match/rank-projects",
            json={
                "student": {"student_id": "student", "gpa": 3, "bio": "on-topic"},
                "projects": [
                    {
                        "project_id": "ineligible",
                        "title": "on-topic",
                        "minimum_gpa": 4,
                        "matching_weights": only("semantic"),
                    },
                    {
                        "project_id": "eligible",
                        "title": "off-topic",
                        "minimum_gpa": 3,
                        "matching_weights": only("semantic"),
                    },
                ],
            },
        )
        self.assertEqual(
            [r["project_id"] for r in response.json()["results"]],
            ["eligible", "ineligible"],
        )

    def test_empty_responses_include_marker_and_health_advertises_support(self):
        for route, payload in (
            ("/api/match/rank", {"project": {}, "students": []}),
            (
                "/api/match/rank-projects",
                {"student": {"student_id": "s"}, "projects": []},
            ),
        ):
            response = self.client.post(route, json=payload)
            self.assertEqual(response.status_code, 200)
            self.assertEqual(
                response.json(),
                {
                    "engine": "offline-test",
                    "trained": False,
                    "project_weights_applied": True,
                    "results": [],
                },
            )
        self.assertEqual(
            self.client.get("/api/health").json(),
            {
                "status": "ok",
                "engine": "offline-test",
                "trained": False,
                "matching_weights_supported": True,
            },
        )

    def test_faculty_and_idea_formulas_and_response_shapes_are_unchanged(self):
        faculty = {
            "faculty_id": "f",
            "department": "Computing",
            "research_interests": ["Python"],
            "skills": ["Python"],
        }
        cases = [
            (
                "/api/match/rank-faculty",
                {
                    "student": {
                        "student_id": "s",
                        "major": "Computing",
                        "skills": ["Python"],
                        "research_interests": ["Python"],
                    },
                    "faculty": [faculty],
                },
            ),
            (
                "/api/match/rank-faculty-for-idea",
                {
                    "idea": {"title": "Python"},
                    "faculty": [faculty],
                },
            ),
        ]
        for route, payload in cases:
            response = self.client.post(route, json=payload)
            self.assertEqual(response.status_code, 200, response.text)
            self.assertEqual(set(response.json()), {"engine", "trained", "results"})
            self.assertEqual(response.json()["results"][0]["match_score"], 100)
        person = main.FacultyInput(**faculty)
        student = main.StudentInput(
            student_id="s",
            major="Computing",
            skills=["Python"],
            research_interests=["Python"],
        )
        self.assertEqual(
            self.matcher.faculty_result_for_student(student, person, 0.2).match_score,
            64,
        )
        self.assertEqual(
            self.matcher.faculty_result_for_idea(
                main.IdeaInput(title="Python"), person, 0.2
            ).match_score,
            52,
        )


if __name__ == "__main__":
    unittest.main()
