from dataclasses import dataclass

from nllb_languages import LANGUAGE_NAMES

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


@dataclass(frozen=True)
class ModelSpec:
    folder: str
    languages: dict
    default_src: str
    default_tgt: str


MODEL_SPECS = {
    "NLLB-200 · 200 языков": ModelSpec("nllb-ct2-int8", NLLB_LANGUAGES, "English", "Russian"),
    "SALT · языки Уганды": ModelSpec("ct2-int8", SALT_LANGUAGES, "English", "Luganda"),
}
