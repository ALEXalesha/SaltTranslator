import os
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def app_env(models_dir):
    # UTF-8, как у самого приложения: Electron запускает Python с -X utf8. Без
    # этого дочерний процесс пишет в кодировке системы, и на английском раннере
    # CI (cp1252) русское сообщение об ошибке падало с UnicodeEncodeError раньше,
    # чем тест успевал его проверить.
    return dict(os.environ, TRANSLATOR_MODELS_DIR=str(models_dir), TRANSFORMERS_VERBOSITY="error",
                PYTHONIOENCODING="utf-8")


def import_app(models_dir):
    return subprocess.run(
        [sys.executable, "-c", "import app; print('models', list(app.MODELS))"],
        cwd=ROOT, env=app_env(models_dir), capture_output=True, encoding="utf-8", timeout=300,
    )


def run_in_app(models_dir, code):
    return subprocess.run(
        [sys.executable, "-c", code], cwd=ROOT, env=app_env(models_dir), capture_output=True,
        encoding="utf-8", timeout=300,
    )


def make_broken_model(models_dir):
    """A folder that passes the completeness check but cannot actually be loaded."""
    folder = models_dir / "nllb-ct2-int8"
    folder.mkdir()
    for name, content in {
        "config.json": "{}",
        "model.bin": "garbage",
        "shared_vocabulary.json": "[]",
        "tokenizer_config.json": "{}",
        "tokenizer.json": "{}",
    }.items():
        (folder / name).write_text(content)


def test_a_broken_model_is_reported_to_the_user_instead_of_crashing(tmp_path):
    make_broken_model(tmp_path)
    r = run_in_app(
        tmp_path,
        "import app, gradio as gr\n"
        "label = next(iter(app.MODELS))\n"
        "try:\n"
        "    app.translate('Hello', label, 'English', 'Russian')\n"
        "except gr.Error as e:\n"
        "    print('reported:', e)\n",
    )
    assert r.returncode == 0, r.stderr
    assert "reported:" in r.stdout


def test_preloading_a_broken_model_does_not_stop_the_app(tmp_path):
    make_broken_model(tmp_path)
    r = run_in_app(tmp_path, "import app\napp.preload()\nprint('still alive')")
    assert r.returncode == 0, r.stderr
    assert "still alive" in r.stdout


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
