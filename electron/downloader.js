const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const crypto = require('crypto');
const { isFile } = require('./paths');

const IDLE_TIMEOUT_MS = 60_000;
const PROGRESS_EVERY_MS = 150;

class ShaMismatchError extends Error {
  constructor(file) {
    super(`Контрольная сумма не совпала: ${file}`);
    this.name = 'ShaMismatchError';
  }
}

class HttpError extends Error {
  constructor(status, url) {
    super(`HTTP ${status}: ${url}`);
    this.name = 'HttpError';
    this.status = status;
  }
}

function abortError() {
  const e = new Error('Загрузка отменена');
  e.name = 'AbortError';
  return e;
}

function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(abortError());
    const onAbort = () => {
      clearTimeout(timer);
      reject(abortError());
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

function get(url, { headers, localAddress, signal }, redirects = 10) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https:') ? https : http;
    const req = mod.get(url, { headers, localAddress, signal }, (res) => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
        res.resume();
        if (redirects <= 0) return reject(new Error('Слишком много перенаправлений'));
        const next = new URL(res.headers.location, url).toString();
        return resolve(get(next, { headers, localAddress, signal }, redirects - 1));
      }
      resolve(res);
    });
    req.setTimeout(IDLE_TIMEOUT_MS, () => req.destroy(new Error('Сервер перестал отвечать')));
    req.on('error', reject);
  });
}

async function hashFile(file, signal) {
  const hash = crypto.createHash('sha256');
  for await (const chunk of fs.createReadStream(file, { highWaterMark: 1 << 20 })) {
    if (signal?.aborted) throw abortError();
    hash.update(chunk);
  }
  return hash.digest('hex');
}

function sizeOf(file) {
  return isFile(file) ? fs.statSync(file).size : 0;
}

async function fetchOnce({ url, part, size, localAddress, signal, onBytes }) {
  let have = sizeOf(part);
  if (size != null && have > size) {
    fs.rmSync(part, { force: true });
    have = 0;
  }
  if (size != null && have === size) return;
  const res = await get(url, { headers: have ? { Range: `bytes=${have}-` } : {}, localAddress, signal });
  if (res.statusCode === 416) {
    res.resume();
    fs.rmSync(part, { force: true });
    throw new Error('Сервер отказался докачивать, начинаю заново');
  }
  if (res.statusCode !== 200 && res.statusCode !== 206) {
    res.resume();
    throw new HttpError(res.statusCode, url);
  }
  const append = res.statusCode === 206;
  if (append) {
    const start = Number(/bytes (\d+)-/.exec(res.headers['content-range'] || '')?.[1]);
    if (start !== have) {
      res.resume();
      fs.rmSync(part, { force: true });
      throw new Error('Сервер прислал не тот кусок файла, начинаю заново');
    }
  }
  onBytes?.(append ? have : 0, true);
  const out = fs.createWriteStream(part, { flags: append ? 'a' : 'w' });
  await new Promise((resolve, reject) => {
    let failure = null;
    // On a broken connection, flush what already arrived so the next attempt resumes from it.
    const fail = (e) => {
      if (failure) return;
      failure = e;
      res.unpipe(out);
      out.end();
    };
    const onAbort = () => {
      fail(abortError());
      res.destroy();
    };
    signal?.addEventListener('abort', onAbort, { once: true });
    res.on('data', (c) => onBytes?.(c.length));
    res.on('error', fail);
    res.on('aborted', () => fail(new Error('Соединение оборвалось')));
    out.on('error', (e) => {
      failure = failure || e;
    });
    out.on('close', () => {
      signal?.removeEventListener('abort', onAbort);
      if (failure) reject(failure);
      else resolve();
    });
    res.pipe(out);
  });
}

async function downloadFile({
  url,
  dest,
  size,
  sha256,
  localAddress,
  signal,
  onBytes,
  onVerify,
  retries = 5,
  retryDelayMs = 2000,
}) {
  const part = `${dest}.part`;
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  for (let attempt = 0; ; attempt++) {
    try {
      if (signal?.aborted) throw abortError();
      await fetchOnce({ url, part, size, localAddress, signal, onBytes });
      break;
    } catch (e) {
      if (e.name === 'AbortError' || signal?.aborted) throw abortError();
      const permanent = e instanceof HttpError && e.status < 500 && e.status !== 429;
      if (permanent || attempt >= retries) throw e;
      await sleep(retryDelayMs * (attempt + 1), signal);
    }
  }
  const got = sizeOf(part);
  if (size != null && got !== size) {
    fs.rmSync(part, { force: true });
    throw new Error(`Файл ${path.basename(dest)} скачался не того размера: ${got} байт вместо ${size}`);
  }
  if (sha256) {
    onVerify?.();
    if ((await hashFile(part, signal)) !== sha256) {
      fs.rmSync(part, { force: true });
      throw new ShaMismatchError(path.basename(dest));
    }
  }
  fs.renameSync(part, dest);
}

async function alreadyComplete(dest, file, signal) {
  if (sizeOf(dest) !== file.size || !isFile(dest)) return false;
  return !file.sha256 || (await hashFile(dest, signal)) === file.sha256;
}

async function downloadModel({ model, modelsDir, localAddress, signal, onProgress }) {
  const dir = path.join(modelsDir, model.folder);
  fs.mkdirSync(dir, { recursive: true });
  const total = model.files.reduce((sum, f) => sum + f.size, 0);
  let finished = 0;
  let lastReport = 0;
  const report = (current, file, phase, force = false) => {
    const now = Date.now();
    if (!force && now - lastReport < PROGRESS_EVERY_MS) return;
    lastReport = now;
    onProgress?.({ done: finished + current, total, file, phase });
  };
  for (const file of model.files) {
    const dest = path.join(dir, file.name);
    if (!(await alreadyComplete(dest, file, signal))) {
      fs.rmSync(dest, { force: true });
      let current = 0;
      const onBytes = (n, reset) => {
        current = reset ? n : current + n;
        report(current, file.name, 'download', reset);
      };
      const onVerify = () => report(file.size, file.name, 'verify', true);
      for (let shaAttempt = 0; ; shaAttempt++) {
        try {
          await downloadFile({ url: `${model.baseUrl}/${file.name}`, dest, size: file.size, sha256: file.sha256, localAddress, signal, onBytes, onVerify });
          break;
        } catch (e) {
          if (e instanceof ShaMismatchError && shaAttempt === 0) continue;
          throw e;
        }
      }
    }
    finished += file.size;
    report(0, file.name, 'download', true);
  }
}

module.exports = { downloadFile, downloadModel, hashFile, ShaMismatchError, HttpError };
