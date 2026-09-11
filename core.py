import re

# A full stop needs a following space ("3.5", "v1.2.3" stay whole); CJK full-width marks end a sentence without one.
_SENTENCE_END = re.compile(r"(?<=[.!?…।॥؟።])\s+|(?<=[。！？])\s*")
_CLAUSE_END = re.compile(r"(?<=[,;:，、；：])\s*|\s+(?=[—–]\s)")
_LANGUAGE_TOKEN = re.compile(r"[a-z]{3}_[A-Z][a-z]{3}")
_CONTROL_TOKENS = {"</s>", "<s>", "<pad>"}


class LanguageError(ValueError):
    pass


def split_sentences(line):
    return [p.strip() for p in _SENTENCE_END.split(line) if p.strip()]


def _split_chars(word, count_tokens, max_tokens):
    out, current = [], ""
    for ch in word:
        if current and count_tokens(current + ch) > max_tokens:
            out.append(current)
            current = ch
        else:
            current += ch
    if current:
        out.append(current)
    return out


def chunk(sentence, count_tokens, max_tokens):
    """Split a sentence into pieces of at most max_tokens, preferring clause, then word, then character breaks."""
    sentence = sentence.strip()
    if not sentence:
        return []
    if count_tokens(sentence) <= max_tokens:
        return [sentence]
    pieces = [p for p in _CLAUSE_END.split(sentence) if p.strip()]
    if len(pieces) == 1:
        pieces = sentence.split()
        if len(pieces) == 1:
            return _split_chars(sentence, count_tokens, max_tokens)
    out, current = [], ""
    for piece in pieces:
        for part in chunk(piece, count_tokens, max_tokens):
            candidate = f"{current} {part}" if current else part
            if count_tokens(candidate) <= max_tokens:
                current = candidate
            else:
                out.append(current)
                current = part
    if current:
        out.append(current)
    return out


def translate_text(text, translate_chunks, count_tokens, max_tokens, joiner=" "):
    """Translate text line by line, keeping blank lines and indentation, with one batched model call."""
    lines = text.replace("\r\n", "\n").replace("\r", "\n").split("\n")
    plan = []
    for line in lines:
        if not line.strip():
            plan.append((line, []))
            continue
        indent = line[: len(line) - len(line.lstrip())]
        plan.append((indent, [c for s in split_sentences(line) for c in chunk(s, count_tokens, max_tokens)]))
    flat = [c for _, chunks in plan for c in chunks]
    if not flat:
        return "\n".join(lines)
    # Letterless pieces ("...", "3.14", emoji) make NLLB invent words, so they bypass the model.
    wordy = [c for c in flat if _has_letters(c)]
    translated = iter(translate_chunks(wordy) if wordy else [])
    results = iter([next(translated) if _has_letters(c) else c for c in flat])
    return "\n".join(prefix + joiner.join(next(results) for _ in chunks) for prefix, chunks in plan)


def _has_letters(s):
    return any(ch.isalpha() for ch in s)


_NO_SPACE_BETWEEN_SENTENCES = {"zho_Hans", "zho_Hant", "yue_Hant", "jpn_Jpan"}


def sentence_joiner(code):
    return "" if code in _NO_SPACE_BETWEEN_SENTENCES else " "


def is_language_token(token):
    return bool(_LANGUAGE_TOKEN.fullmatch(token))


def clean_output(tokens):
    return [t for t in tokens if t not in _CONTROL_TOKENS and not is_language_token(t)]


def swap(src, tgt, text, result):
    # Before the first translation the result box is empty; swapping must not move the user's text into it.
    if not (result or "").strip():
        return tgt, src, text, result
    return tgt, src, result, text


def resolve_languages(languages, src, tgt):
    if src is None or tgt is None:
        raise LanguageError("Выбери оба языка.")
    for name in (src, tgt):
        if name not in languages:
            raise LanguageError(f"Языка «{name}» нет в выбранной модели, выбери его из списка.")
    return languages[src], languages[tgt]
