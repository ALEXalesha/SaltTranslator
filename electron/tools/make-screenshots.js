'use strict';
// Кадр для README: собирается программой, а не снимком экрана.
//
//   cd electron
//   npx electron tools/make-screenshots.js
//
// Поднимает настоящий бэкенд так же, как приложение (backend.js: свободный порт,
// app.py из .venv, модели из ../models), открывает его страницу в скрытом окне
// размера приложения, вводит текст, жмёт «Перевести» и снимает страницу после
// настоящего перевода моделью - через capturePage, так что чужое окно в кадр
// попасть не может. Моделей в репозитории нет: без них скрипт честно падает.
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');
const { freePort, waitReady, startBackend, stopBackend } = require('../backend');

const ROOT = path.join(__dirname, '..', '..');
const OUT = path.join(ROOT, 'docs', 'screenshots');
const PYTHON = path.join(ROOT, '.venv', 'Scripts', 'python.exe');
const TEXT = [
  'This translator works offline, right on the processor.',
  '',
  'Blank lines and paragraphs are kept, and long sentences are cut into pieces',
  'so that the model does not stop halfway through a word.',
].join('\n');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

app.whenReady().then(async () => {
  let backend = null;
  let code = 0;
  try {
    if (!fs.existsSync(PYTHON)) throw new Error(`нет ${PYTHON}: сначала установка из README`);
    fs.mkdirSync(OUT, { recursive: true });
    const port = await freePort();
    backend = startBackend({
      command: PYTHON,
      args: ['-E', '-s', '-u', '-X', 'utf8', path.join(ROOT, 'app.py')],
      cwd: ROOT,
      port,
      modelsDir: path.join(ROOT, 'models'),
    });
    await waitReady({ port, exitCode: () => backend.exitCode(), timeoutMs: 180_000 });

    const win = new BrowserWindow({
      width: 1180, height: 820, show: false,
      webPreferences: { backgroundThrottling: false },
    });
    await win.loadURL(`http://127.0.0.1:${port}/`);
    const js = (s) => win.webContents.executeJavaScript(s);
    const until = async (expr, what, ms = 120_000) => {
      const end = Date.now() + ms;
      while (Date.now() < end) { if (await js(expr)) return; await sleep(300); }
      throw new Error(`не дождались: ${what}`);
    };

    await until("document.querySelectorAll('textarea').length >= 2", 'поля ввода');
    // Gradio слушает событие input, простого присвоения value ему мало.
    await js(`(() => {
      const box = document.querySelectorAll('textarea')[0];
      box.value = ${JSON.stringify(TEXT)};
      box.dispatchEvent(new Event('input', { bubbles: true }));
    })()`);
    await js(`[...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Перевести').click()`);
    await until("document.querySelectorAll('textarea')[1].value.trim().length > 20", 'перевод');
    // Значение в поле появляется раньше, чем Gradio убирает индикатор
    // «processing» поверх него: первая версия скрипта сняла кадр с индикатором.
    await until("!/processing/.test(document.body.innerText)", 'индикатор обработки');
    await sleep(500);
    win.webContents.invalidate();
    await js('new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))');
    const image = await win.webContents.capturePage();
    fs.writeFileSync(path.join(OUT, 'window.png'), image.toPNG());
    console.log('  window.png');
    console.log('перевод в кадре:', JSON.stringify(await js("document.querySelectorAll('textarea')[1].value")));
  } catch (err) {
    console.error(err);
    code = 1;
  } finally {
    if (backend) stopBackend(backend);
    await sleep(500);
    app.exit(code);
  }
});
