# translator_ai

Локальный переводчик на нейросети NLLB-3.3B. Работает без интернета, на процессоре, в браузере по адресу `http://127.0.0.1:7860`.

Внутри две модели, между ними переключатель в интерфейсе:

| Модель | Языков | Размер | Для чего |
|---|---|---|---|
| **NLLB-200** (Meta, сборка int8 от OpenNMT) | 202 | 3,4 ГБ | обычный переводчик: русский, английский, турецкий и ещё две сотни |
| **SALT** (Sunbird AI, дообученный NLLB) | 9 | 3,2 ГБ | языки Уганды: луганда, ачоли, лусога, рутооро и другие |

## Запуск

```
run.bat
```

Откроется браузер. Первая загрузка модели занимает секунд 10–20. SALT грузится только когда её выбрали в переключателе.

Текст режется на предложения и переводится по одному: модели учились на отдельных фразах, и целый абзац они переводят хуже. Пустые строки и абзацы сохраняются. Кнопка `⇄` меняет языки и тексты местами. В списке языков можно искать, начав печатать название (`Rus`, `Turk`).

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
$base = "https://huggingface.co/OpenNMT/nllb-200-3.3B-ct2-int8/resolve/main"
New-Item -ItemType Directory -Force models\nllb-ct2-int8 | Out-Null
foreach ($f in "config.json","generation_config.json","shared_vocabulary.json","special_tokens_map.json","tokenizer.json","tokenizer_config.json","model.bin") {
    curl.exe -L -C - --retry 5 -o "models\nllb-ct2-int8\$f" "$base/$f"
}
```

**SALT** выложена только в исходном виде, её надо скачать и сконвертировать (см. следующий раздел).

Если какой-то модели нет на диске, приложение просто не покажет её в переключателе.

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

`convert.py` меняет в `config.json` архитектуру `TrainableM2MForConditionalGeneration` (класс Sunbird для обучения) на обычную `M2M100ForConditionalGeneration`, иначе конвертер CTranslate2 её не узнаёт. Веса у модели стандартные, так что на результат это не влияет. Оригинальный конфиг сохраняется рядом как `config.original.json`.

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

</details>

<details>
<summary><b>Грабли</b></summary>

- **Медленная загрузка через VPN.** Если трафик идёт через VPN-туннель, Hugging Face может отдавать 20–150 КБ/с. Можно качать мимо туннеля, привязав curl к обычной сетевой карте: `curl.exe --interface <IP карты Ethernet> ...`. IP смотреть через `Get-NetIPAddress -InterfaceAlias Ethernet -AddressFamily IPv4`.
- **Предупреждение про `fix_mistral_regex`.** transformers ругается на токенизатор NLLB, будто у него неправильный regex. Это ложная тревога от проверки для моделей Mistral: с `fix_mistral_regex=True` токенизация как раз ломается. Предупреждение в `app.py` заглушено.
- **Порт 7860 занят.** Значит, переводчик уже запущен в другом окне. Закрой старое окно `run.bat`.
- **Размер скачиваемого файла 0 байт.** Проводник и `Get-ChildItem` показывают 0 у файла, который ещё открыт на запись. Это не зависшая загрузка.

</details>

## Файлы

```
app.py              интерфейс Gradio и перевод
nllb_languages.py   названия 202 языков NLLB (FLORES-200)
convert.py          конвертация SALT из формата Hugging Face в CTranslate2
run.bat             запуск
requirements.txt    зависимости приложения
models/             модели (не в git)
```

## Лицензии

Обе модели распространяются по [CC BY-NC 4.0](https://creativecommons.org/licenses/by-nc/4.0/): можно пользоваться и изменять, но не в коммерческих целях.
