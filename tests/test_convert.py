import json

import convert

SUNBIRD = ["TrainableM2MForConditionalGeneration"]


def write_config(folder, cfg):
    (folder / "config.json").write_text(json.dumps(cfg), encoding="utf-8")


def read(folder, name):
    return json.loads((folder / name).read_text(encoding="utf-8"))


def test_patch_switches_to_the_base_architecture(tmp_path):
    write_config(tmp_path, {"architectures": SUNBIRD, "d_model": 2048})
    convert.patch_architecture(tmp_path)
    cfg = read(tmp_path, "config.json")
    assert cfg["architectures"] == convert.BASE_ARCH
    assert cfg["d_model"] == 2048


def test_repeated_patch_keeps_the_original_backup(tmp_path):
    write_config(tmp_path, {"architectures": SUNBIRD})
    convert.patch_architecture(tmp_path)
    convert.patch_architecture(tmp_path)
    assert read(tmp_path, "config.original.json")["architectures"] == SUNBIRD


def test_patch_handles_a_config_without_architectures(tmp_path):
    write_config(tmp_path, {"model_type": "m2m_100"})
    convert.patch_architecture(tmp_path)
    assert read(tmp_path, "config.json")["architectures"] == convert.BASE_ARCH
