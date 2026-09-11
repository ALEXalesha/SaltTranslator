import re
from pathlib import Path

import pytest
from hypothesis import HealthCheck, given, settings, strategies as st

pytestmark = pytest.mark.slow

MODELS = Path(__file__).resolve().parent.parent / "models"
if not (MODELS / "nllb-ct2-int8" / "model.bin").exists():
    pytest.skip("NLLB is not downloaded", allow_module_level=True)

import app  # noqa: E402  (loads the real model)

NLLB = next(label for label in app.MODELS if label.startswith("NLLB"))
WORDS = (
    "the a farmer child river market water school doctor road village city morning evening "
    "walked carried saw found bought sold quickly slowly old new big small green heavy fresh"
).split()
sentence = st.lists(st.sampled_from(WORDS), min_size=3, max_size=14).map(lambda w: " ".join(w).capitalize() + ".")
paragraph = st.lists(sentence, min_size=1, max_size=4).map(" ".join)
text = st.lists(st.one_of(paragraph, st.just("")), min_size=1, max_size=4).map("\n".join)
LANG_CODE = re.compile(r"\b[a-z]{3}_[A-Z][a-z]{3}\b")


@settings(max_examples=40, deadline=None, suppress_health_check=list(HealthCheck))
@given(text, st.sampled_from(["Russian", "German", "Turkish", "French"]))
def test_real_translation_keeps_structure_and_hides_tokens(t, tgt):
    out = app.translate(t, NLLB, "English", tgt)
    assert out.count("\n") == t.count("\n")
    for i, o in zip(t.split("\n"), out.split("\n")):
        assert bool(i.strip()) == bool(o.strip())
    assert not LANG_CODE.search(out)


def test_long_unpunctuated_text_is_not_truncated():
    clause = "the old farmer walked slowly along the dusty road carrying a heavy basket of fresh vegetables to the market"
    t = ", ".join([clause] * 40)
    out = app.translate(t, NLLB, "English", "Russian")
    assert len(out) > 0.6 * len(t)


def test_long_chinese_paragraph_is_not_truncated():
    t = "今天天气很好，我们一起去公园散步，然后在湖边的小咖啡馆喝茶聊天" * 12
    out = app.translate(t, NLLB, "Chinese (Simplified)", "English")
    assert len(out.split()) > 150
