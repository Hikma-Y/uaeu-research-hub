# Faculty-labelled matching dataset

Copy `faculty_labelled_pairs.template.csv` to `faculty_labelled_pairs.local.csv` before entering faculty-reviewed data. The local file is ignored by Git so testing data is not committed.

Use one anonymised student-project pair per row:

```csv
pair_id,student_text,project_text,semantic_label,split,reviewer_notes
PAIR-001,"student interests, skills and relevant experience","project description and skills",0.85,train,"Why the pair is suitable"
```

Rate semantic research suitability only. Keep GPA and other eligibility rules out of the training text because the application handles those separately and transparently.

| Label | Meaning |
| --- | --- |
| 1.00 | Excellent research-topic and skill alignment |
| 0.75 | Good alignment; minor gaps are acceptable |
| 0.50 | Possible match; faculty judgement is needed |
| 0.25 | Weak alignment |
| 0.00 | Unrelated or unsuitable |

Keep all rows for the same project in a single split: about 70% training, 15% validation, and 15% untouched test. Aim for 100-150 faculty-reviewed pairs for a pilot and 300-500 for a stronger final model. The template row is only an example and must not be used for training.
