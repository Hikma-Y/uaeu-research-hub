"""Fine-tune the semantic matcher only with faculty-labelled anonymous pairs.

Hard eligibility (such as minimum GPA) remains outside the model so it stays
deterministic and explainable in the database and interface.
"""

from __future__ import annotations

import argparse
import csv
from pathlib import Path

from sentence_transformers import InputExample, SentenceTransformer, losses
from sentence_transformers.evaluation import EmbeddingSimilarityEvaluator
from torch.utils.data import DataLoader


SERVICE_DIRECTORY = Path(__file__).resolve().parents[1]
DEFAULT_DATASET = SERVICE_DIRECTORY / "data" / "faculty_labelled_pairs.local.csv"
DEFAULT_OUTPUT = SERVICE_DIRECTORY / "models" / "uaeu-sbert-matcher"
DEFAULT_BASE_MODEL = "sentence-transformers/all-MiniLM-L6-v2"


def load_rows(path: Path) -> list[dict[str, object]]:
    with path.open(newline="", encoding="utf-8") as source:
        reader = csv.DictReader(source)
        rows: list[dict[str, object]] = []
        for row in reader:
            try:
                label = float(row["semantic_label"])
            except (KeyError, TypeError, ValueError) as error:
                raise ValueError("Each row needs a semantic_label between 0 and 1.") from error
            if not 0 <= label <= 1:
                raise ValueError("semantic_label values must be between 0 and 1.")
            student_text = row.get("student_text", "").strip()
            project_text = row.get("project_text", "").strip()
            if not student_text or not project_text:
                continue
            rows.append({
                "student_text": student_text,
                "project_text": project_text,
                "label": label,
                "split": row.get("split", "train").strip().lower() or "train",
            })
    return rows


def as_examples(rows: list[dict[str, object]]) -> list[InputExample]:
    return [
        InputExample(
            texts=[str(row["student_text"]), str(row["project_text"])],
            label=float(row["label"]),
        )
        for row in rows
    ]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--data", type=Path, default=DEFAULT_DATASET)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--base-model", default=DEFAULT_BASE_MODEL)
    parser.add_argument("--epochs", type=int, default=4)
    args = parser.parse_args()

    rows = load_rows(args.data)
    train_rows = [row for row in rows if row["split"] == "train"]
    validation_rows = [row for row in rows if row["split"] in {"validation", "val"}]
    test_rows = [row for row in rows if row["split"] == "test"]

    if len(train_rows) < 30:
        raise ValueError("Add at least 30 faculty-labelled training pairs before fine-tuning.")
    if len(validation_rows) < 5:
        raise ValueError("Add at least 5 validation pairs before fine-tuning.")

    model = SentenceTransformer(args.base_model)
    evaluator = EmbeddingSimilarityEvaluator(
        sentences1=[str(row["student_text"]) for row in validation_rows],
        sentences2=[str(row["project_text"]) for row in validation_rows],
        scores=[float(row["label"]) for row in validation_rows],
        name="faculty-validation",
    )
    train_loader = DataLoader(as_examples(train_rows), shuffle=True, batch_size=8)
    model.fit(
        train_objectives=[(train_loader, losses.CosineSimilarityLoss(model))],
        evaluator=evaluator,
        epochs=args.epochs,
        warmup_steps=max(1, int(len(train_loader) * args.epochs * 0.1)),
        output_path=str(args.output),
        show_progress_bar=True,
    )

    if test_rows:
        test_evaluator = EmbeddingSimilarityEvaluator(
            sentences1=[str(row["student_text"]) for row in test_rows],
            sentences2=[str(row["project_text"]) for row in test_rows],
            scores=[float(row["label"]) for row in test_rows],
            name="held-out-test",
        )
        print("Held-out evaluation:", test_evaluator(model))

    print(f"Saved fine-tuned model to {args.output}")


if __name__ == "__main__":
    main()
