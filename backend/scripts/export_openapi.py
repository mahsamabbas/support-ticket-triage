import argparse
import json
from pathlib import Path

from app.main import create_app


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Write the API's OpenAPI schema to a JSON file.")
    parser.add_argument(
        "output",
        nargs="?",
        type=Path,
        default=Path("../frontend/openapi.json"),
        help="output path (default: ../frontend/openapi.json)",
    )
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> None:
    target = parse_args(argv).output
    target.write_text(json.dumps(create_app().openapi(), indent=2) + "\n")
    print(f"wrote {target}")


if __name__ == "__main__":
    main()
