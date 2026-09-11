import os
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def import_app(models_dir):
    env = dict(os.environ, TRANSLATOR_MODELS_DIR=str(models_dir), TRANSFORMERS_VERBOSITY="error")
    return subprocess.run(
        [sys.executable, "-c", "import app; print('models', list(app.MODELS))"],
        cwd=ROOT, env=env, capture_output=True, text=True, timeout=300,
    )


def test_app_starts_without_any_models(tmp_path):
    r = import_app(tmp_path)
    assert r.returncode == 0, r.stderr
    assert "models []" in r.stdout


def test_app_starts_when_the_models_folder_does_not_exist(tmp_path):
    r = import_app(tmp_path / "нет такой папки")
    assert r.returncode == 0, r.stderr
    assert "models []" in r.stdout


def test_app_ignores_a_half_downloaded_model(tmp_path):
    folder = tmp_path / "nllb-ct2-int8"
    folder.mkdir()
    (folder / "model.bin").write_bytes(b"")
    r = import_app(tmp_path)
    assert r.returncode == 0, r.stderr
    assert "models []" in r.stdout


def test_app_ignores_a_model_folder_without_tokenizer(tmp_path):
    folder = tmp_path / "nllb-ct2-int8"
    folder.mkdir()
    (folder / "model.bin").write_bytes(b"x")
    (folder / "config.json").write_text("{}")
    r = import_app(tmp_path)
    assert r.returncode == 0, r.stderr
    assert "models []" in r.stdout
