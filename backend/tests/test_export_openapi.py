import json
from pathlib import Path

import pytest

from scripts import export_openapi


def test_writes_schema_to_given_path(tmp_path, capsys):
    target = tmp_path / "openapi.json"
    export_openapi.main([str(target)])
    schema = json.loads(target.read_text())
    assert "/tickets" in schema["paths"]
    assert capsys.readouterr().out == f"wrote {target}\n"


def test_defaults_to_frontend_openapi_json():
    assert export_openapi.parse_args([]).output == Path("../frontend/openapi.json")


def test_help_exits_cleanly(capsys):
    with pytest.raises(SystemExit) as exc:
        export_openapi.main(["--help"])
    assert exc.value.code == 0
    assert "usage:" in capsys.readouterr().out
