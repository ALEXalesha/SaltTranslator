<div align="center">

# Translator AI

**Локальный переводчик на нейросети NLLB-3.3B: без интернета, на процессоре, 202 языка плюс языки Уганды. Код под MIT, модели — CC BY-NC 4.0 и в репозиторий не входят.**

[Скачать для Windows](https://github.com/ALEXalesha/SaltTranslator/releases/latest) &nbsp;·&nbsp; [English version of this file](README.md)

[![CI](https://github.com/ALEXalesha/SaltTranslator/actions/workflows/ci.yml/badge.svg)](https://github.com/ALEXalesha/SaltTranslator/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/ALEXalesha/SaltTranslator?color=16a34a)](https://github.com/ALEXalesha/SaltTranslator/releases/latest)
[![Code: MIT](https://img.shields.io/badge/code-MIT-blue)](LICENSE)
[![Models: CC BY-NC 4.0](https://img.shields.io/badge/models-CC%20BY--NC%204.0-orange)](#лицензии)

<img src="docs/screenshots/window.png" width="860" alt="Перевод с английского на русский моделью NLLB-200">

</div>

Локальный переводчик на нейросети NLLB-3.3B. Работает без интернета, на процессоре, в своём окне или в браузере.

Внутри две модели, между ними переключатель в интерфейсе:

| Модель | Языков | Размер | Для чего |
|---|---|---|---|
| **NLLB-200** (Meta, сборка int8 от OpenNMT) | 202 | 3,4 ГБ | обычный переводчик: русский, английский, турецкий и ещё две сотни |
| **SALT** (Sunbird AI, дообученный NLLB) | 9 | 3,2 ГБ | языки Уганды: луганда, ачоли, лусога, рутооро и другие |

## Установка

После `build.ps1` в папке `dist/` лежат два файла (в git их нет):

- `Translator AI Setup 1.0.0.exe` — установщик с ярлыками на рабочем столе и в «Пуске»;
- `Translator AI 1.0.0.exe` — portable: ничего не ставит и хранит всё в папке `Translator AI Data` рядом с собой.

Оба весят около 230 МБ: внутри Electron и Python со всеми пакетами, но без моделей. Модели на 6,6 ГБ в установщик не влезают, поэтому при первом запуске открывается окно, где можно:

- скачать NLLB-200 (3,4 ГБ) с докачкой после обрыва и проверкой SHA-256. Галочка «Качать мимо VPN» пускает загрузку через обычную сетевую карту;
- указать папку, где модели уже лежат, например `models` из этого репозитория.

SALT скачать нельзя: её готовой int8-версии в сети нет. Она подхватывается, если в выбранной папке есть `ct2-int8`.

Первый запуск portable-версии распаковывает Python, это около минуты. Дальше старт обычный.

## Запуск из исходников

```
run.bat
```

Откроется браузер. Первая загрузка модели занимает секунд 10–20. SALT грузится только когда её выбрали в переключателе.

Текст режется на предложения, а длинные предложения ещё и на куски до 120 токенов: на 200 токенах NLLB обрывает перевод на полуслове, а к тысяче начинает повторять одно слово. Куски без букв («...», «3.14», эмодзи) идут мимо модели, иначе она дописывает к ним выдуманные слова. Пустые строки, отступы и абзацы сохраняются, в китайском и японском предложения склеиваются без пробелов. Кнопка `⇄` меняет языки местами, а тексты только если перевод уже есть. В списке языков можно искать, начав печатать название (`Rus`, `Turk`).

<details>
<summary><b>Установка с нуля</b></summary>

Нужны Python 3.13 и [uv](https://docs.astral.sh/uv/).

```powershell
uv venv .venv --python 3.13
uv pip install --python .venv\Scripts\python.exe -r requirements.txt
```

Модели в репозиторий не входят, их надо скачать в `models\`.

**NLLB-200** уже сконвертирована в формат CTranslate2, конвертировать ничего не надо:

```powershell
$base = "https://huggingface.co/OpenNMT/nllb-200-3.3B-ct2-int8/resolve/28d998cc8548ad62f4f98cf8860928c3af99b97b"
New-Item -ItemType Directory -Force models\nllb-ct2-int8 | Out-Null
foreach ($f in "config.json","generation_config.json","shared_vocabulary.json","special_tokens_map.json","tokenizer.json","tokenizer_config.json","model.bin") {
    curl.exe -L -C - --retry 5 -o "models\nllb-ct2-int8\$f" "$base/$f"
}
```

**SALT** выложена только в исходном виде, её надо скачать и сконвертировать (см. следующий раздел).

Если какой-то модели нет на диске или она докачана не до конца, приложение просто не покажет её в переключателе.

Контрольные суммы SHA-256:

| Файл | SHA-256 |
|---|---|
| `nllb-ct2-int8/model.bin` | `b7540c4e19aa2a5079c89241ffccb49711705ca8b1d255cea00c3216dc7d5165` |
| `nllb-ct2-int8/tokenizer.json` | `e316b82de11d0f951f370943b3c438311629547285129b0b81dadabd01bca665` |
| `hf/model-00001-of-00003.safetensors` | `78b6c26929e4b07af32978e8ad817a664da6459eda245cef483a006e802a35c3` |
| `hf/model-00002-of-00003.safetensors` | `96c3f68bf201542bcbedb74d8a13babfc959c51edf9b03e9e435350d5185c332` |
| `hf/model-00003-of-00003.safetensors` | `7347250d685d7e17d5880f734106a22a45230379b459b2b50795752a761b7c56` |

Проверка: `Get-FileHash models\nllb-ct2-int8\model.bin -Algorithm SHA256`.

</details>

<details>
<summary><b>Конвертация SALT</b></summary>

Скачать исходник [Sunbird/translate-nllb-3.3b-salt](https://huggingface.co/Sunbird/translate-nllb-3.3b-salt) в `models\hf` (12,5 ГБ, файл `training_args.bin` не нужен, это pickle от обучения):

```powershell
$base = "https://huggingface.co/Sunbird/translate-nllb-3.3b-salt/resolve/main"
New-Item -ItemType Directory -Force models\hf | Out-Null
foreach ($f in "config.json","generation_config.json","added_tokens.json","special_tokens_map.json","tokenizer_config.json","sentencepiece.bpe.model","model.safetensors.index.json","model-00001-of-00003.safetensors","model-00002-of-00003.safetensors","model-00003-of-00003.safetensors") {
    curl.exe -L -C - --retry 5 -o "models\hf\$f" "$base/$f"
}
```

Для конвертации нужен torch, в самом приложении он не используется:

```powershell
uv pip install --python .venv\Scripts\python.exe torch --index-url https://download.pytorch.org/whl/cpu
.venv\Scripts\python.exe convert.py
```

Получится `models\ct2-int8` на 3,2 ГБ. После этого `models\hf` и torch можно удалить.

`convert.py` меняет в `config.json` архитектуру `TrainableM2MForConditionalGeneration` (класс Sunbird для обучения) на обычную `M2M100ForConditionalGeneration`, иначе конвертер CTranslate2 её не узнаёт. Веса у модели стандартные, так что на результат это не влияет. Оригинальный конфиг один раз сохраняется рядом как `config.original.json` и при повторных запусках не затирается.

</details>

<details>
<summary><b>Как устроены языки SALT</b></summary>

Своих языковых токенов у SALT нет. Sunbird взяли для угандийских языков токены других языков NLLB и дообучили модель на них:

| Язык | Токен в модели |
|---|---|
| English | `eng_Latn` |
| Luganda | `lug_Latn` |
| Acholi | `luo_Latn` |
| Lugbara | `aka_Latn` (на самом деле акан) |
| Runyankole | `ace_Latn` (ачехский) |
| Ateso | `afr_Latn` (африкаанс) |
| Lusoga | `amh_Ethi` (амхарский) |
| Rutooro | `apc_Arab` (левантийский арабский) |
| Swahili | `swh_Latn` |

Таблица взята из библиотеки [SunbirdAI/salt](https://github.com/SunbirdAI/salt). Отсюда же видно, что эти пять «чужих» языков в SALT потеряны: попросишь амхарский, получишь лусогу.

Остальные языки NLLB в SALT формально остались. Русский и немецкий она переводит прилично, турецкий уже с ошибками. Для всего, кроме Уганды, лучше NLLB-200.

</details>

<details>
<summary><b>Почему на процессоре, а не на видеокарте</b></summary>

Проверялось на RTX 5060 Ti 8 ГБ (Blackwell) с `ctranslate2 4.8.2`, который собран под CUDA 12.4.

- **int8 на GPU** падает с `CUBLAS_STATUS_NOT_SUPPORTED`, как только в пакете больше одного предложения или фраза длиннее примерно 16 токенов (около 10 слов). Короткие фразы проходят за 0,2 с, но на реальном тексте это бесполезно.
- **float16 на GPU** работает, но модель занимает 7,7 из 8 ГБ, Windows вытесняет её в общую память, и одна фраза идёт 17 секунд.
- **int8 на CPU** стабилен: несколько коротких фраз за 2–3 секунды, одна очень длинная (60 токенов) около 13 секунд.

Когда выйдет ctranslate2 под CUDA 12.8+, стоит проверить GPU заново.

</details>

<details>
<summary><b>Настройки скорости</b></summary>

В начале `app.py`:

- `THREADS` — число потоков, по умолчанию половина логических ядер. На 16-поточном процессоре 8 потоков оказались на 8% быстрее, чем 16.
- `BEAM` — ширина поиска, по умолчанию 5, как у Sunbird. Замеры на длинной фразе:

| BEAM | Время | Качество |
|---|---|---|
| 5 | 13,5 с | эталон |
| 2 | 10,3 с | почти то же самое |
| 1 | 8,8 с | начинает терять слова |

- `MAX_INPUT_TOKENS` и `MAX_OUTPUT_TOKENS` — размер куска текста и предел перевода. Поднимать первый выше 150 не стоит, см. про обрыв на 200 токенах выше.

</details>

<details>
<summary><b>Сборка установщика и portable</b></summary>

Нужны `.venv` из раздела «Установка с нуля», Node.js 24 и Windows 10 1803 или новее (там появился `tar.exe`, которым распаковывается Python).

```powershell
powershell -ExecutionPolicy Bypass -File build.ps1
```

Скрипт по шагам:

1. гоняет Python-тесты;
2. собирает переносимый Python в `build\runtime`: копия установленного CPython без `site-packages`, тестов и tkinter, пакеты из `.venv` без pytest и hypothesis, VC-рантайм из System32;
3. проверяет, что этот Python запускается сам по себе и импортирует ctranslate2, gradio и transformers;
4. пакует его в `build\runtime.zip`;
5. гоняет Node-тесты и собирает `dist\` через electron-builder (NSIS и portable).

Electron 43.0.0 и electron-builder 24.13.3 те же, что в SyncGlass, так что всё берётся из кешей npm и electron. Сборка занимает около шести минут. Версия берётся из `electron\package.json`.

Где лежат данные:

| Версия | Папка |
|---|---|
| установленная | `%LOCALAPPDATA%\Translator AI` |
| portable | `Translator AI Data` рядом с exe |

Внутри: `runtime\` (распакованный Python, пересоздаётся при смене версии), `models\` (папка моделей по умолчанию), `config.json` (путь к выбранной папке моделей) и `electron\` (кеш Chromium). Пути с кириллицей и пробелами проверены.

Как устроен запуск: Electron берёт свободный порт, стартует `python.exe -E -s -u -X utf8 app.py` с переменными `GRADIO_SERVER_PORT`, `TRANSLATOR_MODELS_DIR` и `TRANSLATOR_EMBEDDED`, ждёт ответа и открывает интерфейс в своём окне. Внешние ссылки открываются в браузере. Если Python упал, окно показывает его последний вывод и кнопку «Перезапустить». При выходе всё дерево процессов гасится через `taskkill /T`.

</details>

<details>
<summary><b>Тесты</b></summary>

```powershell
uv pip install --python .venv\Scripts\python.exe -r requirements-dev.txt
.venv\Scripts\python.exe -m pytest                       # быстрые, около минуты
$env:HYPOTHESIS_PROFILE="huge"; .venv\Scripts\python.exe -m pytest tests\test_core.py   # по 20 000 примеров на свойство, минут десять
.venv\Scripts\python.exe -m pytest -m slow               # на настоящей NLLB, минут шесть
cd electron; npm test                                    # загрузчик, пути, запуск Python
```

Ядро перевода (`core.py`) проверяется property-тестами на Hypothesis. Инварианты:

- ни один кусок, отправленный в модель, не длиннее лимита токенов;
- ни один символ не теряется и не дублируется при нарезке;
- число строк, пустые строки и отступы сохраняются при любых переводах строк (`\n`, `\r\n`, `\r`);
- модель вызывается не больше одного раза на запрос и не видит кусков без букв;
- служебные токены языков не попадают в текст;
- `⇄` не теряет введённый текст;
- неизвестный язык даёт понятную ошибку, а не падение.

Медленные тесты гоняют настоящую модель на случайных текстах на четырёх языках и проверяют, что длинный текст без точек и длинный китайский абзац не обрезаются. Тесты приложения проверяют запуск без моделей, с недокачанной и с битой моделью. Node-тесты поднимают локальный HTTP-сервер и проверяют докачку, сервер без поддержки Range, обрыв соединения, неверный SHA-256, редиректы и отмену.

</details>

<details>
<summary><b>Грабли</b></summary>

- **Медленная загрузка через VPN.** Если трафик идёт через VPN-туннель, Hugging Face может отдавать 20–150 КБ/с. В приложении для этого есть галочка «Качать мимо VPN». В командной строке то же самое делает `curl.exe --interface <IP карты Ethernet> ...`, а IP показывает `Get-NetIPAddress -InterfaceAlias Ethernet -AddressFamily IPv4`.
- **Предупреждение про `fix_mistral_regex`.** transformers ругается на токенизатор NLLB, будто у него неправильный regex. Это ложная тревога от проверки для моделей Mistral: с `fix_mistral_regex=True` токенизация как раз ломается. Предупреждение в `app.py` заглушено.
- **Порт 7860 занят.** Значит, переводчик из исходников уже запущен в другом окне. Закрой старое окно `run.bat`. Electron-версию это не касается, она берёт свободный порт.
- **Размер скачиваемого файла 0 байт.** Проводник и `Get-ChildItem` показывают 0 у файла, который ещё открыт на запись. Это не зависшая загрузка.
- **Окно не закрывается крестиком.** Gradio вешает обработчик `beforeunload`, и Electron молча отменяет и закрытие окна, и переход на страницу ошибки. Лечится `webContents.on('will-prevent-unload', e => e.preventDefault())` в `main.js`.
- **Пустой журнал на странице ошибки.** Вывод Python через pipe буферизуется блоками, и к моменту падения в журнале ничего нет. Поэтому Python запускается с `-u`.
- **Второй запуск portable ломает первый.** По умолчанию electron-builder распаковывает все запуски portable в одну папку `%TEMP%\<id>`, и второй экземпляр при выходе удаляет файлы работающего первого. В `package.json` стоит `"portable": { "unpackDirName": true }`, тогда у каждого запуска своя папка. Значение `false`, вопреки документации, не помогает.
- **Тихая установка в папку с пробелами.** Пиши весь ключ в кавычках: `"Translator AI Setup 1.0.0.exe" /S "/D=D:\Мои программы\Translator AI"`. Обычно NSIS требует `/D` без кавычек, но electron-builder перечитывает его сам и режет по пробелам, так что без кавычек программа молча встанет в `D:\Мои`. Через окно установщика папка выбирается без этой проблемы.

</details>

## Файлы

```
app.py              интерфейс Gradio, загрузка моделей
core.py             нарезка текста, сборка перевода, кнопка ⇄, проверка языков
languages.py        какие модели есть и какие языки у каждой
nllb_languages.py   названия 202 языков NLLB (FLORES-200)
convert.py          конвертация SALT из формата Hugging Face в CTranslate2
run.bat             запуск из исходников
build.ps1           сборка установщика и portable
electron/           оболочка: окно, загрузчик моделей, запуск Python
tests/              тесты Python
docs/superpowers/   спецификация и план Electron-сборки
requirements*.txt   зависимости приложения и тестов
models/             модели (не в git)
```

## Кадры для README собираются программой

`electron/tools/make-screenshots.js` поднимает настоящий бэкенд так же, как
приложение, вводит текст, жмёт «Перевести» и снимает страницу после настоящего
перевода моделью, через `capturePage()`: чужое окно в кадр попасть не может.
Моделей в репозитории нет, поэтому без них скрипт честно падает.

```powershell
cd electron
npx electron tools/make-screenshots.js
```

На кадре видно и ограничение, о котором стоит знать: предложение, разорванное
переносом строки, переводится двумя кусками («не останавливается на полпути
через слово»). Это цена сохранения разметки: каждая строка остаётся строкой.
Длинное предложение без переносов режется программой по токенам и собирается
обратно без таких швов.

## Лицензии

**Код** этого репозитория — MIT, файл [LICENSE](LICENSE).

**Модели** — нет. Обе распространяются авторами по
[CC BY-NC 4.0](https://creativecommons.org/licenses/by-nc/4.0/): пользоваться и
изменять можно, **в коммерческих целях нельзя**, авторство указывать обязательно.

| Модель | Автор | Карточка |
|---|---|---|
| NLLB-200 3.3B, сборка CTranslate2 int8 | Meta AI; конвертация OpenNMT | [OpenNMT/nllb-200-3.3B-ct2-int8](https://huggingface.co/OpenNMT/nllb-200-3.3B-ct2-int8) |
| SALT (NLLB, дообученный на языках Уганды) | Sunbird AI | [Sunbird/translate-nllb-3.3b-salt](https://huggingface.co/Sunbird/translate-nllb-3.3b-salt) |

Веса моделей **не лежат ни в этом репозитории, ни в релизах**: установщик и
portable весят около 230 МБ, моделей внутри нет. NLLB-200 скачивается из окна
программы прямо с Hugging Face, с проверкой SHA-256; SALT человек конвертирует
сам по инструкции выше. Лицензия MIT на код не меняет условий самих моделей.
