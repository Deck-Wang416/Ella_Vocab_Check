#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import re
import shutil
import subprocess
import sys
import tempfile
import uuid
import zipfile
from pathlib import Path


OPTION_MAP = {
    "A": "option_1",
    "B": "option_2",
    "C": "option_3",
    "D": "option_4",
}

OPTION_RE = re.compile(r"^([A-Da-d])(?:\s*\(correct\))?\.(png|jpg|jpeg|webp)$", re.IGNORECASE)
DEFAULT_BUCKET = "ella-development-464ea.firebasestorage.app"
DEFAULT_STORAGE_PREFIX = "vocab_check"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Build vocab assessment JSON from a zip/folder where each top-level folder is a vocab word "
            "and each folder contains A/B/C/D image options with one marked as (correct)."
        )
    )
    parser.add_argument("source", help="Path to the source zip file or extracted directory.")
    parser.add_argument("--assessment-id", default="assessment_1", help="Assessment id. Default: assessment_1")
    parser.add_argument(
        "--accounts",
        default="leyun,yoonjae",
        help="Comma-separated usernames for vocabAccounts/vocabResults. Default: leyun,yoonjae",
    )
    parser.add_argument("--password", default="123456", help="Password for each account. Default: 123456")
    parser.add_argument(
        "--output-dir",
        default="data/vocab_check/generated",
        help="Output directory. Created automatically if missing. Default: data/vocab_check/generated",
    )
    parser.add_argument(
        "--upload",
        action="store_true",
        help="Upload images to Firebase Storage and write final HTTPS image URLs.",
    )
    parser.add_argument(
        "--keep-extracted",
        action="store_true",
        help="Keep temporary extracted directory when input is a zip.",
    )
    return parser.parse_args()


def extract_source(source: Path) -> tuple[Path, Path | None]:
    if source.is_dir():
        return source, None
    if not source.is_file():
        raise FileNotFoundError(f"Source not found: {source}")

    temp_dir = Path(tempfile.mkdtemp(prefix="vocab_assessment_"))
    with zipfile.ZipFile(source) as zf:
        zf.extractall(temp_dir)

    top_level = [p for p in temp_dir.iterdir() if p.name != "__MACOSX"]
    if len(top_level) == 1 and top_level[0].is_dir():
        return top_level[0], temp_dir
    return temp_dir, temp_dir


def list_word_dirs(root: Path) -> list[Path]:
    dirs: list[Path] = []
    for child in root.iterdir():
        if not child.is_dir():
            continue
        if child.name.startswith("__MACOSX"):
            continue
        dirs.append(child)
    return sorted(dirs, key=lambda p: p.name.lower())


def collect_option_files(word_dir: Path) -> tuple[dict[str, Path], str]:
    option_paths: dict[str, Path] = {}
    correct_option_id: str | None = None

    for child in sorted(word_dir.iterdir(), key=lambda p: p.name.lower()):
        if child.name == ".DS_Store" or child.is_dir():
            continue
        match = OPTION_RE.match(child.name)
        if not match:
            continue

        option_id = OPTION_MAP[match.group(1).upper()]
        option_paths[option_id] = child

        if "(correct)" in child.stem.lower():
            if correct_option_id is not None:
                raise ValueError(f"Multiple correct answers found in {word_dir}")
            correct_option_id = option_id

    if set(option_paths.keys()) != set(OPTION_MAP.values()):
        raise ValueError(f"{word_dir} must contain exactly A/B/C/D image files.")
    if correct_option_id is None:
        raise ValueError(f"No '(correct)' file found in {word_dir}")

    return option_paths, correct_option_id


def upload_file(source: Path, bucket: str, object_path: str, token: str) -> str:
    cmd = [
        "gsutil",
        "-h",
        f"x-goog-meta-firebaseStorageDownloadTokens:{token}",
        "cp",
        str(source),
        f"gs://{bucket}/{object_path}",
    ]
    subprocess.run(cmd, check=True)
    encoded_path = object_path.replace("/", "%2F")
    return f"https://firebasestorage.googleapis.com/v0/b/{bucket}/o/{encoded_path}?alt=media&token={token}"


def build_assessment(
    root: Path,
    assessment_id: str,
    upload: bool,
) -> tuple[dict, list[dict]]:
    word_dirs = list_word_dirs(root)
    if not word_dirs:
        raise ValueError(
            "No question folders were found. The source must contain one top-level folder per vocab word."
        )

    assessment = {
        assessment_id: {
            "id": assessment_id,
            "questions": {},
        }
    }
    manifest: list[dict] = []

    for index, word_dir in enumerate(word_dirs, start=1):
        word = word_dir.name
        question_id = f"q{index}"
        option_files, correct_option_id = collect_option_files(word_dir)

        question = {
            "id": question_id,
            "word": word,
            "options": {},
            "correctOptionId": correct_option_id,
            "order": index,
        }

        for option_id in ["option_1", "option_2", "option_3", "option_4"]:
            local_path = option_files[option_id]
            ext = local_path.suffix.lower()
            object_path = f"{DEFAULT_STORAGE_PREFIX.rstrip('/')}/{assessment_id}/{question_id}/{option_id}{ext}"
            token = str(uuid.uuid4())
            image_url = (
                upload_file(local_path, DEFAULT_BUCKET, object_path, token)
                if upload
                else f"PENDING_UPLOAD::{object_path}::TOKEN::{token}"
            )
            question["options"][option_id] = {
                "id": option_id,
                "imageUrl": image_url,
            }
            manifest.append(
                {
                    "word": word,
                    "questionId": question_id,
                    "optionId": option_id,
                    "source": str(local_path),
                    "objectPath": object_path,
                    "token": token,
                    "imageUrl": image_url,
                }
            )

        assessment[assessment_id]["questions"][question_id] = question

    return assessment, manifest


def build_accounts_and_results(
    usernames: list[str],
    password: str,
    assessment_id: str,
    assessment: dict,
) -> tuple[dict, dict]:
    questions = assessment[assessment_id]["questions"]
    accounts = {}
    results = {}
    for username in usernames:
        accounts[username] = {
            "username": username,
            "password": password,
            "assessmentId": assessment_id,
            "submitted": False,
            "submittedAt": None,
        }
        results[username] = {
            "username": username,
            "assessmentId": assessment_id,
            "responses": {
                question_id: {
                    "word": question["word"],
                    "selectedOptionId": None,
                }
                for question_id, question in questions.items()
            },
            "submittedAt": None,
        }
    return accounts, results


def write_json(path: Path, payload: dict | list[dict]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2) + "\n")


def main() -> int:
    temp_dir: Path | None = None

    try:
        args = parse_args()
        source = Path(args.source).expanduser().resolve()
        root, temp_dir = extract_source(source)

        assessment, _manifest = build_assessment(
            root=root,
            assessment_id=args.assessment_id,
            upload=args.upload,
        )
        usernames = [u.strip() for u in args.accounts.split(",") if u.strip()]
        accounts, results = build_accounts_and_results(usernames, args.password, args.assessment_id, assessment)

        output_dir = Path(args.output_dir)
        write_json(output_dir / "vocab_assessments.json", assessment)
        write_json(output_dir / "vocab_accounts.json", accounts)
        write_json(output_dir / "vocab_results.json", results)

        readme_path = output_dir / "README.txt"
        readme_path.write_text(
            "\n".join(
                [
                    f"assessmentId: {args.assessment_id}",
                    f"uploadPerformed: {args.upload}",
                    "",
                    "Generated files:",
                    "- vocab_assessments.json",
                    "- vocab_accounts.json",
                    "- vocab_results.json",
                    "",
                    "Import targets:",
                    "- vocabAssessments <- vocab_assessments.json",
                    "- vocabAccounts <- vocab_accounts.json",
                    "- vocabResults <- vocab_results.json",
                ]
            )
            + "\n"
        )

        print(f"Generated files in {output_dir}")
        return 0
    except FileNotFoundError as error:
        print(f"Error: {error}", file=sys.stderr)
        return 1
    except zipfile.BadZipFile:
        print("Error: The source file is not a valid zip archive.", file=sys.stderr)
        return 1
    except ValueError as error:
        print(f"Error: {error}", file=sys.stderr)
        return 1
    except subprocess.CalledProcessError as error:
        print(f"Error: Upload failed while running: {' '.join(error.cmd)}", file=sys.stderr)
        return 1
    except Exception as error:
        print(f"Unexpected error: {error}", file=sys.stderr)
        return 1
    finally:
        if temp_dir and "args" in locals() and not args.keep_extracted:
            shutil.rmtree(temp_dir, ignore_errors=True)


if __name__ == "__main__":
    sys.exit(main())
