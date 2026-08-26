"""Entry point for python -m evaluate_cli."""

from pathlib import Path

from dotenv import load_dotenv

_env = Path(__file__).resolve().parent.parent / ".env"
load_dotenv(_env)
load_dotenv()

from .app import app


def run() -> None:
    app()


if __name__ == "__main__":
    run()
