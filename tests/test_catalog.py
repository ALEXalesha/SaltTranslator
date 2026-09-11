from pathlib import Path

import pytest

import languages

MODELS = Path(__file__).resolve().parent.parent / "models"


def vocab(folder):
    from transformers import AutoTokenizer

    return AutoTokenizer.from_pretrained(MODELS / folder).get_vocab()


def test_language_names_are_unique():
    names = list(languages.LANGUAGE_NAMES.values())
    assert len(set(names)) == len(names)


def test_every_language_code_has_the_nllb_shape():
    import core

    for spec in languages.MODEL_SPECS.values():
        assert all(core.is_language_token(code) for code in spec.languages.values())


def test_model_defaults_exist_in_their_own_language_list():
    for spec in languages.MODEL_SPECS.values():
        assert spec.default_src in spec.languages
        assert spec.default_tgt in spec.languages
        assert spec.default_src != spec.default_tgt


def test_salt_languages_use_distinct_tokens():
    codes = list(languages.SALT_LANGUAGES.values())
    assert len(set(codes)) == len(codes)


@pytest.mark.parametrize("label", list(languages.MODEL_SPECS))
def test_language_codes_are_real_tokens(label):
    spec = languages.MODEL_SPECS[label]
    if not (MODELS / spec.folder / "model.bin").exists():
        pytest.skip(f"{spec.folder} is not downloaded")
    v = vocab(spec.folder)
    assert [c for c in spec.languages.values() if c not in v] == []
