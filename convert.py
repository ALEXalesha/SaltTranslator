import json
import shutil
from pathlib import Path

import ctranslate2

ROOT = Path(__file__).parent
HF_DIR = ROOT / "models" / "hf"
CT2_DIR = ROOT / "models" / "ct2-int8"
TOKENIZER_FILES = [
    "sentencepiece.bpe.model",
    "tokenizer_config.json",
    "special_tokens_map.json",
    "added_tokens.json",
]
BASE_ARCH = ["M2M100ForConditionalGeneration"]


def patch_architecture():
    # config.json names Sunbird's training subclass; the weights are plain M2M100, which the converter knows.
    cfg_path = HF_DIR / "config.json"
    cfg = json.loads(cfg_path.read_text(encoding="utf-8"))
    if cfg["architectures"] != BASE_ARCH:
        shutil.copy(cfg_path, HF_DIR / "config.original.json")
        cfg["architectures"] = BASE_ARCH
        cfg_path.write_text(json.dumps(cfg, indent=2), encoding="utf-8")


def main():
    patch_architecture()
    converter = ctranslate2.converters.TransformersConverter(
        str(HF_DIR),
        copy_files=TOKENIZER_FILES,
        load_as_float16=True,
    )
    converter.convert(str(CT2_DIR), quantization="int8_float16", force=True)
    print(f"done: {CT2_DIR}")


if __name__ == "__main__":
    main()
