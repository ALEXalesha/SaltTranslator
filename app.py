import os
from pathlib import Path

os.environ.setdefault("GRADIO_ANALYTICS_ENABLED", "False")
# Set before import: transformers warns about missing torch (not needed here) and flags NLLB with a
# Mistral-specific regex warning whose suggested fix would break its tokenization.
os.environ.setdefault("TRANSFORMERS_VERBOSITY", "error")

import ctranslate2
import gradio as gr
from transformers import AutoTokenizer

import core
from languages import MODEL_SPECS

MODELS_DIR = Path(os.environ.get("TRANSLATOR_MODELS_DIR") or Path(__file__).parent / "models")
# Physical cores only: hyperthreads made CTranslate2 ~8% slower in benchmarks on this PC.
THREADS = max(1, (os.cpu_count() or 8) // 2)
# 2 is ~25% faster with nearly identical output; 1 starts dropping words.
BEAM = 5
# NLLB stops mid-word at the output limit and starts repeating itself on inputs past ~200 tokens,
# so long sentences are cut into pieces that comfortably fit.
MAX_INPUT_TOKENS = 120
MAX_OUTPUT_TOKENS = 256
REQUIRED_FILES = ("config.json", "model.bin", "shared_vocabulary.json", "tokenizer_config.json")


def is_complete(folder):
    return (
        all((folder / f).is_file() for f in REQUIRED_FILES)
        and (folder / "model.bin").stat().st_size > 0
        and any((folder / f).is_file() for f in ("tokenizer.json", "sentencepiece.bpe.model"))
    )


MODELS = {label: spec for label, spec in MODEL_SPECS.items() if is_complete(MODELS_DIR / spec.folder)}
_loaded = {}


def load(model):
    # CPU on purpose: on RTX 50 (Blackwell) ctranslate2's int8 cuBLAS kernels fail, and float16 doesn't fit in 8 GB VRAM.
    if model not in _loaded:
        path = str(MODELS_DIR / MODELS[model].folder)
        _loaded[model] = (
            AutoTokenizer.from_pretrained(path),
            ctranslate2.Translator(path, device="cpu", compute_type="int8", intra_threads=THREADS),
        )
    return _loaded[model]


def translate(text, model, src, tgt):
    if not text.strip() or src == tgt:
        return text
    if model not in MODELS:
        raise gr.Error("Выбери модель.")
    try:
        src_code, tgt_code = core.resolve_languages(MODELS[model].languages, src, tgt)
    except core.LanguageError as e:
        raise gr.Error(str(e))
    try:
        tokenizer, translator = load(model)
    except Exception as e:
        raise gr.Error(f"Не удалось загрузить модель: {e}")

    def run(chunks):
        results = translator.translate_batch(
            [[src_code] + tokenizer.tokenize(c) + ["</s>"] for c in chunks],
            target_prefix=[[tgt_code]] * len(chunks),
            beam_size=BEAM,
            max_decoding_length=MAX_OUTPUT_TOKENS,
            max_batch_size=16,
        )
        return [
            tokenizer.decode(tokenizer.convert_tokens_to_ids(core.clean_output(r.hypotheses[0])), skip_special_tokens=True)
            for r in results
        ]

    count = lambda s: len(tokenizer.tokenize(s))  # noqa: E731
    return core.translate_text(text, run, count, MAX_INPUT_TOKENS, joiner=core.sentence_joiner(tgt_code))


def pick_model(model):
    spec = MODELS[model]
    names = list(spec.languages)
    return gr.update(choices=names, value=spec.default_src), gr.update(choices=names, value=spec.default_tgt), ""


with gr.Blocks(title="Переводчик NLLB") as demo:
    gr.Markdown("### Переводчик NLLB-3.3B\nЛокально, на CPU")
    if not MODELS:
        gr.Markdown(
            f"Модели не найдены в `{MODELS_DIR}`.\n\n"
            "Нужна хотя бы одна папка: `nllb-ct2-int8` (NLLB-200) или `ct2-int8` (SALT). Как их скачать, написано в README."
        )
    else:
        default = next(iter(MODELS))
        spec = MODELS[default]
        names = list(spec.languages)
        model = gr.Radio(list(MODELS), value=default, label="Модель")
        with gr.Row():
            src = gr.Dropdown(names, value=spec.default_src, label="Из")
            swap_btn = gr.Button("⇄", scale=0, min_width=60)
            tgt = gr.Dropdown(names, value=spec.default_tgt, label="В")
        with gr.Row():
            text = gr.Textbox(lines=10, label="Текст", placeholder="Введи текст...")
            result = gr.Textbox(lines=10, label="Перевод", interactive=False)
        go = gr.Button("Перевести", variant="primary")
        go.click(translate, [text, model, src, tgt], result)
        model.change(pick_model, model, [src, tgt, result])
        swap_btn.click(core.swap, [src, tgt, text, result], [src, tgt, text, result])

if __name__ == "__main__":
    if MODELS:
        load(next(iter(MODELS)))
    demo.launch(server_name="127.0.0.1", inbrowser=not os.environ.get("TRANSLATOR_EMBEDDED"))
