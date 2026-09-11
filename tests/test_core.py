import re

import pytest
from hypothesis import given, strategies as st

import core

MAX = 12
CJK = "぀-ヿ㐀-鿿가-힯"
TOKEN_RE = re.compile(rf"[{CJK}]|[^\s{CJK}]+")


def count(s):
    """Fake tokenizer: whitespace-separated words, each CJK character is its own token."""
    return len(TOKEN_RE.findall(s))


def echo(chunks):
    return list(chunks)


def solid(s):
    return "".join(s.split())


def indent(line):
    return re.match(r"\s*", line).group()


def normalize_newlines(text):
    return text.replace("\r\n", "\n").replace("\r", "\n")


word = st.text(
    alphabet=st.characters(blacklist_categories=("Cs", "Zs", "Zl", "Zp", "Cc")), min_size=1, max_size=15
)
separator = st.sampled_from(
    [" ", "  ", ", ", "; ", ": ", ". ", "! ", "? ", "... ", "。", "，", "、", "！", "। ", "؟ ", "። ", "\t", " — "]
)
sentence = st.lists(st.tuples(word, separator), max_size=60).map(lambda ps: "".join(w + s for w, s in ps))
line = st.one_of(sentence, st.just(""), st.text(alphabet=" \t  ", max_size=4), st.text(max_size=80))
indented_line = st.tuples(st.text(alphabet=" \t", max_size=3), line).map("".join)
newline = st.sampled_from(["\n", "\r\n", "\r"])
text = st.tuples(st.lists(indented_line, max_size=12), newline).map(lambda t: t[1].join(t[0]))


# --- chunking -----------------------------------------------------------------------------------


@given(sentence)
def test_every_chunk_fits_the_token_budget(s):
    for c in core.chunk(s, count, MAX):
        assert count(c) <= MAX


@given(sentence)
def test_chunking_keeps_every_character_in_order(s):
    assert "".join(solid(c) for c in core.chunk(s, count, MAX)) == solid(s)


@given(sentence)
def test_chunks_are_never_blank(s):
    assert all(c.strip() for c in core.chunk(s, count, MAX))


@given(st.text(alphabet="漢字かなカナ한글", min_size=1, max_size=400))
def test_unspaced_cjk_is_split_by_characters(s):
    chunks = core.chunk(s, count, MAX)
    assert all(count(c) <= MAX for c in chunks)
    assert "".join(chunks) == s


# --- sentence splitting -------------------------------------------------------------------------


@given(sentence)
def test_sentence_split_keeps_every_character(s):
    assert "".join(solid(p) for p in core.split_sentences(s)) == solid(s)


@given(sentence)
def test_sentence_split_has_no_blank_pieces(s):
    assert all(p.strip() for p in core.split_sentences(s))


@pytest.mark.parametrize(
    "line,expected",
    [
        ("Hello there. How are you?", ["Hello there.", "How are you?"]),
        ("今天天气很好。我们去公园吧。", ["今天天气很好。", "我们去公园吧。"]),
        ("本当？はい！", ["本当？", "はい！"]),
        ("आज मौसम अच्छा है। चलो चलते हैं।", ["आज मौसम अच्छा है।", "चलो चलते हैं।"]),
        ("كيف حالك؟ أنا بخير.", ["كيف حالك؟", "أنا بخير."]),
        ("It costs 3.5 dollars.", ["It costs 3.5 dollars."]),
        ("Version v1.2.3 is out!", ["Version v1.2.3 is out!"]),
        ("Wait... what?!", ["Wait...", "what?!"]),
    ],
)
def test_sentence_boundaries(line, expected):
    assert core.split_sentences(line) == expected


# --- whole-text translation ---------------------------------------------------------------------


@given(text)
def test_line_structure_survives_translation(t):
    out = core.translate_text(t, echo, count, MAX)
    in_lines = normalize_newlines(t).split("\n")
    out_lines = out.split("\n")
    assert len(out_lines) == len(in_lines)
    for i, o in zip(in_lines, out_lines):
        if not i.strip():
            assert o == i
        else:
            assert o.startswith(indent(i))
            assert solid(o) == solid(i)


@given(text)
def test_model_only_sees_nonblank_chunks_within_budget(t):
    seen = []

    def spy(chunks):
        seen.extend(chunks)
        return list(chunks)

    core.translate_text(t, spy, count, MAX)
    assert all(c.strip() and count(c) <= MAX for c in seen)


@given(text)
def test_model_is_called_at_most_once_per_request(t):
    calls = []

    def spy(chunks):
        calls.append(len(chunks))
        return list(chunks)

    core.translate_text(t, spy, count, MAX)
    assert len(calls) <= 1


# Every piece of this text contains letters, so every piece goes through the (fake) model.
# Two ways a letterless piece could appear, both correct behaviour that would break this test's premise:
# a free-standing " — ", and a word longer than MAX split by characters, leaving "。" on its own.
# So separators stay glued to a word, and a word plus its punctuation stays under MAX tokens.
letter_word = st.text(alphabet="abcdefжзйкé漢字かな", min_size=1, max_size=MAX - 2)
glued_separator = st.sampled_from([" ", "  ", ", ", "; ", ": ", ". ", "! ", "? ", "... ", "。", "，", "、", "！", "\t"])
wordy_sentence = st.lists(st.tuples(letter_word, glued_separator), min_size=1, max_size=30).map(
    lambda ps: "".join(w + s for w, s in ps)
)
wordy_text = st.lists(st.one_of(wordy_sentence, st.just("")), max_size=8).map("\n".join)


@given(wordy_text, st.sampled_from(["", " "]))
def test_pieces_of_a_line_are_glued_with_the_joiner(t, joiner):
    out = core.translate_text(t, lambda cs: ["X"] * len(cs), count, MAX, joiner=joiner)
    glued = re.compile("X(?:" + re.escape(joiner) + "X)*")
    for i, o in zip(t.split("\n"), out.split("\n")):
        if i.strip():
            assert glued.fullmatch(o)


@pytest.mark.parametrize(
    "code,joiner",
    [("zho_Hans", ""), ("zho_Hant", ""), ("yue_Hant", ""), ("jpn_Jpan", ""), ("rus_Cyrl", " "), ("kor_Hang", " "), ("eng_Latn", " ")],
)
def test_sentence_joiner_per_language(code, joiner):
    assert core.sentence_joiner(code) == joiner


@pytest.mark.parametrize("t", ["", "   ", "\n\n", " \t\n\r\n"])
def test_blank_text_skips_the_model(t):
    def boom(chunks):
        raise AssertionError("model must not be called")

    assert core.translate_text(t, boom, count, MAX) == normalize_newlines(t)


letterless = st.text(
    alphabet=st.characters(blacklist_categories=("Lu", "Ll", "Lt", "Lm", "Lo", "Cs")), min_size=1, max_size=30
).filter(str.strip)


def has_letters(s):
    return any(ch.isalpha() for ch in s)


@given(st.lists(st.one_of(sentence, letterless), min_size=1, max_size=8).map("\n".join))
def test_letterless_pieces_skip_the_model_and_stay_as_they_are(t):
    seen = []

    def spy(chunks):
        seen.extend(chunks)
        return ["Ж" + c for c in chunks]

    out = core.translate_text(t, spy, count, MAX)
    assert all(has_letters(c) for c in seen)
    for i, o in zip(normalize_newlines(t).split("\n"), out.split("\n")):
        if i.strip() and not has_letters(i):
            assert not has_letters(o)
            assert solid(o) == solid(i)


@pytest.mark.parametrize("t", ["3.14", "...", "!!!", "—", "​", "😀 👍", "123-456", "#"])
def test_known_hallucination_triggers_are_passed_through(t):
    def boom(chunks):
        raise AssertionError(f"model must not see {chunks!r}")

    assert core.translate_text(t, boom, count, MAX) == t


# --- model output cleanup -----------------------------------------------------------------------

LANG = st.sampled_from(["rus_Cyrl", "eng_Latn", "lug_Latn", "zho_Hans", "amh_Ethi"])
CONTROL = st.sampled_from(["</s>", "<s>", "<pad>"])
PLAIN = st.text(alphabet="abc▁.", min_size=1, max_size=5)


@given(st.lists(st.one_of(LANG, CONTROL, PLAIN), max_size=40))
def test_output_cleanup_drops_language_and_control_tokens(tokens):
    cleaned = core.clean_output(tokens)
    assert cleaned == [t for t in tokens if not core.is_language_token(t) and t not in {"</s>", "<s>", "<pad>"}]


@pytest.mark.parametrize("t,expected", [("rus_Cyrl", True), ("zho_Hant", True), ("▁rus", False), ("abc_def", False)])
def test_language_token_shape(t, expected):
    assert core.is_language_token(t) is expected


# --- swap button --------------------------------------------------------------------------------


@given(st.text(), st.text(), st.text(), st.text())
def test_swap_never_loses_the_users_text(src, tgt, t, result):
    new_src, new_tgt, new_text, new_result = core.swap(src, tgt, t, result)
    assert (new_src, new_tgt) == (tgt, src)
    if result.strip():
        assert (new_text, new_result) == (result, t)
    else:
        assert new_text == t


@given(st.text(), st.text(), st.text(min_size=1).filter(str.strip), st.text(min_size=1).filter(str.strip))
def test_swap_twice_is_identity(src, tgt, t, result):
    assert core.swap(*core.swap(src, tgt, t, result)) == (src, tgt, t, result)


# --- language resolution ------------------------------------------------------------------------

LANGS = {"English": "eng_Latn", "Russian": "rus_Cyrl"}
choice = st.one_of(st.none(), st.sampled_from(list(LANGS)), st.text(max_size=10))


@given(choice, choice)
def test_unknown_language_is_reported_not_crashed(src, tgt):
    if src in LANGS and tgt in LANGS:
        assert core.resolve_languages(LANGS, src, tgt) == (LANGS[src], LANGS[tgt])
    else:
        with pytest.raises(core.LanguageError):
            core.resolve_languages(LANGS, src, tgt)
