import os
import re
from pathlib import Path

os.environ.setdefault("GRADIO_ANALYTICS_ENABLED", "False")
# Set before import: transformers warns about missing torch (not needed here) and flags NLLB with a
# Mistral-specific regex warning whose suggested fix would break its tokenization.
os.environ.setdefault("TRANSFORMERS_VERBOSITY", "error")

import ctranslate2
import gradio as gr
from transformers import AutoTokenizer

from nllb_languages import LANGUAGE_NAMES

MODELS_DIR = Path(__file__).parent / "models"
# Physical cores only: hyperthreads made CTranslate2 ~8% slower in benchmarks on this PC.
THREADS = max(1, (os.cpu_count() or 8) // 2)
# 2 is ~25% faster with nearly identical output; 1 starts dropping words.
BEAM = 5

# SALT convention: Ugandan languages reuse unrelated NLLB language tokens.
SALT_LANGUAGES = {
    "English": "eng_Latn",
    "Luganda": "lug_Latn",
    "Acholi": "luo_Latn",
    "Lugbara": "aka_Latn",
    "Runyankole": "ace_Latn",
    "Ateso": "afr_Latn",
    "Lusoga": "amh_Ethi",
    "Rutooro": "apc_Arab",
    "Swahili": "swh_Latn",
}
NLLB_LANGUAGES = {name: code for code, name in sorted(LANGUAGE_NAMES.items(), key=lambda kv: kv[1])}

# label: (model folder, languages, default source/target)
MODELS = {
    "NLLB-200 · 200 языков": ("nllb-ct2-int8", NLLB_LANGUAGES, ("English", "Russian")),
    "SALT · языки Уганды": ("ct2-int8", SALT_LANGUAGES, ("English", "Luganda")),
}
MODELS = {k: v for k, v in MODELS.items() if (MODELS_DIR / v[0] / "model.bin").exists()}

_loaded = {}


def load(model):
    # CPU on purpose: on RTX 50 (Blackwell) ctranslate2's int8 cuBLAS kernels fail, and float16 doesn't fit in 8 GB VRAM.
    if model not in _loaded:
        path = str(MODELS_DIR / MODELS[model][0])
        _loaded[model] = (
            AutoTokenizer.from_pretrained(path),
            ctranslate2.Translator(path, device="cpu", compute_type="int8", intra_threads=THREADS),
        )
    return _loaded[model]


def translate(text, model, src, tgt):
    if not text.strip() or src == tgt:
        return text
    tokenizer, translator = load(model)
    langs = MODELS[model][1]
    # The models were trained on single sentences; whole paragraphs get truncated or drift.
    lines = [re.split(r"(?<=[.!?])\s+", line.strip()) if line.strip() else [] for line in text.splitlines()]
    sentences = [s for line in lines for s in line]
    results = translator.translate_batch(
        [[langs[src]] + tokenizer.tokenize(s) + ["</s>"] for s in sentences],
        target_prefix=[[langs[tgt]]] * len(sentences),
        beam_size=BEAM,
        max_decoding_length=200,
        max_batch_size=16,
    )
    out = iter(
        tokenizer.decode(tokenizer.convert_tokens_to_ids(r.hypotheses[0][1:]), skip_special_tokens=True)
        for r in results
    )
    return "\n".join(" ".join(next(out) for _ in line) for line in lines)


def pick_model(model):
    names = list(MODELS[model][1])
    src, tgt = MODELS[model][2]
    return gr.update(choices=names, value=src), gr.update(choices=names, value=tgt), ""


def swap(src, tgt, text, result):
    return tgt, src, result, text


default = next(iter(MODELS))
load(default)
names = list(MODELS[default][1])
with gr.Blocks(title="Переводчик NLLB") as demo:
    gr.Markdown("### Переводчик NLLB-3.3B\nЛокально, на CPU")
    model = gr.Radio(list(MODELS), value=default, label="Модель")
    with gr.Row():
        src = gr.Dropdown(names, value=MODELS[default][2][0], label="Из")
        swap_btn = gr.Button("⇄", scale=0, min_width=60)
        tgt = gr.Dropdown(names, value=MODELS[default][2][1], label="В")
    with gr.Row():
        text = gr.Textbox(lines=10, label="Текст", placeholder="Введи текст...")
        result = gr.Textbox(lines=10, label="Перевод", interactive=False)
    go = gr.Button("Перевести", variant="primary")
    go.click(translate, [text, model, src, tgt], result)
    model.change(pick_model, model, [src, tgt, result])
    swap_btn.click(swap, [src, tgt, text, result], [src, tgt, text, result])

if __name__ == "__main__":
    demo.launch(server_name="127.0.0.1", inbrowser=True)
