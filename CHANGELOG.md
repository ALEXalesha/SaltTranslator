# Changelog

What changed for the user in each release. The full text of each release, in English and
Russian, is on the [releases page](https://github.com/ALEXalesha/SaltTranslator/releases).

## 1.1.0 - 2026-09-24 - The window opens where and how large it was closed

The size, the place and whether the window was maximized are saved after it is moved or resized and when it closes, and checked against the monitors present at the next start: a window from an unplugged monitor opens centred on the main one, and one larger than the screen is cut to it. Checked on the built app.

## 1.0.0 - 2026-09-23

First public release. The interface is in Russian; the README explains what the window shows.

An offline translator on NLLB-3.3B: runs on the CPU, 202 languages with NLLB-200, and nine languages of Uganda with SALT.

### The models are not in this release

The installer and the portable exe (about 230 MB each) contain Electron and Python with every package, **but no model weights**. On first start the app offers to download NLLB-200 (3.4 GB) from Hugging Face with resume and SHA-256 check, or to point to a folder where the models already are. SALT has no ready int8 build and has to be converted; see the README.

Both models are distributed by their authors under **CC BY-NC 4.0: non-commercial use only**, with attribution:

- NLLB-200 3.3B by Meta AI, CTranslate2 int8 build by OpenNMT: https://huggingface.co/OpenNMT/nllb-200-3.3B-ct2-int8
- SALT by Sunbird AI: https://huggingface.co/Sunbird/translate-nllb-3.3b-salt

The code is MIT.

### Checked before release

61 Python tests with Hypothesis properties and 37 Electron tests in CI; the three slow tests on the real NLLB and the README screenshot (a real translation by the model) locally.
