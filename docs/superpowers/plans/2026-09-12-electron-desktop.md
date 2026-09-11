# Electron-сборка переводчика: план реализации

> **Для исполнителей:** выполнять по задачам через superpowers:executing-plans. Шаги отмечаются чекбоксами (`- [ ]`).

**Цель:** установщик `Translator AI Setup X.Y.Z.exe` и portable `Translator AI X.Y.Z.exe`, которые запускают переводчик без установленного Python.

**Архитектура:** Electron-оболочка стартует упакованный CPython 3.13 с `app.py` (Gradio) на свободном порту и показывает интерфейс в своём окне. Python едет архивом `runtime.zip` и распаковывается в папку данных при первом запуске. Модели качает сам Electron (NLLB-200) или берёт из указанной папки (SALT и готовые модели).

**Стек:** Electron 43.0.0, electron-builder 24.13.3 (NSIS + portable), Node 24 (`node:test`), CPython 3.13, PowerShell.

Спецификация: `docs/superpowers/specs/2026-09-12-electron-desktop-design.md`.

---

## Файлы

| Файл | Ответственность |
|---|---|
| `electron/package.json` | зависимости, скрипты, конфиг electron-builder |
| `electron/catalog.json` | скачиваемые модели: файлы, размеры, sha256 |
| `electron/paths.js` | папка данных, config.json, проверка целостности модели, поиск IPv4 физического адаптера |
| `electron/downloader.js` | загрузка файла с Range-докачкой, повторами, sha256, `localAddress`; загрузка модели целиком |
| `electron/backend.js` | свободный порт, запуск и остановка Python, ожидание готовности |
| `electron/main.js` | жизненный цикл: один экземпляр, распаковка runtime, выбор моделей, окно |
| `electron/preload.js` | узкий мост IPC, только для локальных страниц `file:` |
| `electron/loading.html`, `electron/setup.html` | окно загрузки/ошибки и окно первого запуска |
| `electron/test/*.test.js` | тесты `paths` и `downloader` на локальном HTTP-сервере |
| `build.ps1` | сборка runtime.zip, копия app-файлов, тесты, electron-builder |

## Задачи

### Задача 1: paths.js — папка данных и целостность модели

- [ ] Тесты `electron/test/paths.test.js`: `dataDir` для portable (переменная `PORTABLE_EXECUTABLE_DIR`) и для установленной версии (`LOCALAPPDATA`); `isCompleteModel` отвергает пустой `model.bin`, папку без токенизатора и без `shared_vocabulary.json`, принимает полную папку (правила совпадают с `is_complete` в `app.py`); `readConfig`/`writeConfig` переживают битый JSON; `physicalIPv4` пропускает интерфейсы с именами tun/tap/vpn/xray/wireguard/vEthernet, loopback и 169.254.x.x.
- [ ] `node --test test/` — падают (модуля нет).
- [ ] Реализовать `electron/paths.js`.
- [ ] Тесты зелёные, коммит.

### Задача 2: downloader.js — загрузка с докачкой и проверкой

- [ ] Тесты `electron/test/downloader.test.js` на `http.createServer` с поддержкой Range: полная загрузка с верным sha256; докачка из существующего `.part` (сервер получает `Range: bytes=N-`); сервер игнорирует Range и отдаёт 200 — загрузка начинается заново и файл верный; обрыв соединения посередине — повтор докачивает; sha256 не совпал — `.part` удалён, ошибка `ShaMismatchError`; редирект 302 на другой путь; `downloadModel` пишет файлы в `<models>/<folder>/` и до конца держит только `.part`, так что `isCompleteModel` не видит модель раньше времени; отмена через `AbortSignal`.
- [ ] Прогон — падают.
- [ ] Реализовать `electron/downloader.js`.
- [ ] Тесты зелёные, коммит.

### Задача 3: app-сторона для встраивания

Уже сделано в ходе аудита: `TRANSLATOR_MODELS_DIR`, `TRANSLATOR_EMBEDDED` (без автооткрытия браузера), порт из `GRADIO_SERVER_PORT`, экран «модели не найдены», тесты в `tests/test_app.py`.

### Задача 4: backend.js + main.js + окна

- [ ] `backend.js`: `freePort()`, `startBackend()` запускает `python.exe -E -s -X utf8 app.py` из runtime с `GRADIO_SERVER_PORT`, `TRANSLATOR_MODELS_DIR`, `TRANSLATOR_EMBEDDED=1`, копит последние 200 строк вывода; `waitReady()` опрашивает `http://127.0.0.1:<port>/` до ответа 200 или выхода процесса; `stopBackend()` — `taskkill /PID <pid> /T /F`.
- [ ] Тест `backend.test.js`: `freePort` отдаёт свободный порт; `waitReady` отваливается с ошибкой, если процесс завершился раньше готовности (на `node -e "process.exit(3)"`).
- [ ] `main.js`: `requestSingleInstanceLock`; `userData` внутри папки данных; распаковка `runtime.zip` через `tar.exe` при отсутствии или смене `runtime.version`; если моделей нет — `setup.html`, иначе запуск; окно Gradio не уходит с `127.0.0.1` (внешние ссылки — в браузер); падение Python — `loading.html` с логом и кнопкой «Перезапустить»; при выходе дерево процессов гасится.
- [ ] `setup.html`: папка моделей (по умолчанию `<данные>\models`, «Изменить…»), найденные в ней модели, чекбокс NLLB-200 3,4 ГБ, галочка «мимо VPN» с найденным адресом, проверка свободного места, прогресс со скоростью и оставшимся временем, «Отмена», «Запустить».
- [ ] Ручной прогон `npm start` на этой машине: выбор существующей папки `SaltTranslator\models`, перевод, выход без висящих `python.exe`.
- [ ] Коммит.

### Задача 5: build.ps1 и сборка

- [ ] `build.ps1`: pytest; копия базового CPython без `site-packages`, `test`, `idlelib`, `tkinter`, `tcl`, `Doc`, `include`, `libs`, `Scripts`; копия `site-packages` из `.venv` без pytest/hypothesis/pluggy/iniconfig/sortedcontainers и `_virtualenv.*`; VC-рантайм (`msvcp140*.dll`, `vcruntime140*.dll`) из System32, если его нет; `runtime.version`; проверка `python.exe -E -s -c "import ctranslate2, gradio, transformers"`; `tar -a -c -f build\runtime.zip`; app-файлы в `build\app`; `npm ci`/`npm install --prefer-offline`, `npm test`, `electron-builder --win nsis portable`.
- [ ] Сборка, проверка обоих exe: установка, первый запуск с выбором папки, перевод, удаление; portable — первый запуск распаковывает runtime, второй стартует быстро.
- [ ] README: раздел про установщик и portable. Коммит, пуш.
