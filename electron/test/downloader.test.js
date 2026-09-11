const test = require('node:test');
const assert = require('node:assert');
const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { downloadFile, downloadModel, ShaMismatchError } = require('../downloader');

const DATA = crypto.randomBytes(300_000);
const SHA = crypto.createHash('sha256').update(DATA).digest('hex');

function tmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'tai-dl-'));
}

function serve(handler) {
  const hits = [];
  const server = http.createServer((req, res) => {
    hits.push({ url: req.url, range: req.headers.range });
    handler(req, res, hits.length);
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      resolve({
        url: `http://127.0.0.1:${server.address().port}`,
        hits,
        close: () => new Promise((r) => server.close(r)),
      });
    });
  });
}

function send(req, res, { body = DATA, ignoreRange = false, cutAfter = null, delayMs = 0 } = {}) {
  const m = !ignoreRange && /bytes=(\d+)-/.exec(req.headers.range || '');
  const start = m ? Number(m[1]) : 0;
  if (m && start >= body.length) {
    res.writeHead(416, { 'Content-Range': `bytes */${body.length}` });
    return res.end();
  }
  const slice = body.subarray(start);
  const headers = { 'Content-Length': slice.length };
  if (m) headers['Content-Range'] = `bytes ${start}-${body.length - 1}/${body.length}`;
  res.writeHead(m ? 206 : 200, headers);
  if (cutAfter !== null) {
    res.write(slice.subarray(0, cutAfter), () => setTimeout(() => res.socket.destroy(), 20));
    return;
  }
  if (delayMs) {
    let pos = 0;
    const tick = () => {
      if (res.destroyed) return;
      if (pos >= slice.length) return res.end();
      res.write(slice.subarray(pos, pos + 10_000));
      pos += 10_000;
      setTimeout(tick, delayMs);
    };
    return tick();
  }
  res.end(slice);
}

test('downloads a file and verifies its sha256', async () => {
  const srv = await serve((req, res) => send(req, res));
  const dest = path.join(tmp(), 'model.bin');
  await downloadFile({ url: `${srv.url}/f`, dest, size: DATA.length, sha256: SHA, localAddress: '127.0.0.1' });
  assert.ok(fs.readFileSync(dest).equals(DATA));
  assert.strictEqual(fs.existsSync(`${dest}.part`), false);
  await srv.close();
});

test('resumes from an existing .part with a Range request', async () => {
  const srv = await serve((req, res) => send(req, res));
  const dest = path.join(tmp(), 'model.bin');
  fs.writeFileSync(`${dest}.part`, DATA.subarray(0, 100_000));
  await downloadFile({ url: `${srv.url}/f`, dest, size: DATA.length, sha256: SHA });
  assert.strictEqual(srv.hits[0].range, 'bytes=100000-');
  assert.ok(fs.readFileSync(dest).equals(DATA));
  await srv.close();
});

test('starts over when the server ignores Range', async () => {
  const srv = await serve((req, res) => send(req, res, { ignoreRange: true }));
  const dest = path.join(tmp(), 'model.bin');
  fs.writeFileSync(`${dest}.part`, Buffer.alloc(100_000, 7));
  await downloadFile({ url: `${srv.url}/f`, dest, size: DATA.length, sha256: SHA });
  assert.ok(fs.readFileSync(dest).equals(DATA));
  await srv.close();
});

test('a .part that is already complete is verified without downloading', async () => {
  const srv = await serve((req, res) => send(req, res));
  const dest = path.join(tmp(), 'model.bin');
  fs.writeFileSync(`${dest}.part`, DATA);
  await downloadFile({ url: `${srv.url}/f`, dest, size: DATA.length, sha256: SHA });
  assert.ok(fs.readFileSync(dest).equals(DATA));
  await srv.close();
});

test('a dropped connection is retried and resumed', async () => {
  const srv = await serve((req, res, n) => send(req, res, n === 1 ? { cutAfter: 120_000 } : {}));
  const dest = path.join(tmp(), 'model.bin');
  await downloadFile({ url: `${srv.url}/f`, dest, size: DATA.length, sha256: SHA, retryDelayMs: 10 });
  assert.ok(fs.readFileSync(dest).equals(DATA));
  assert.ok(srv.hits.length >= 2);
  assert.match(srv.hits.at(-1).range, /^bytes=[1-9]\d*-$/);
  await srv.close();
});

test('gives up after the retry budget is spent', async () => {
  const srv = await serve((req, res) => res.socket.destroy());
  const dest = path.join(tmp(), 'model.bin');
  await assert.rejects(downloadFile({ url: `${srv.url}/f`, dest, size: DATA.length, retries: 2, retryDelayMs: 5 }));
  assert.strictEqual(srv.hits.length, 3);
  await srv.close();
});

test('a sha256 mismatch deletes the partial file and throws', async () => {
  const srv = await serve((req, res) => send(req, res));
  const dest = path.join(tmp(), 'model.bin');
  await assert.rejects(
    downloadFile({ url: `${srv.url}/f`, dest, size: DATA.length, sha256: '0'.repeat(64) }),
    ShaMismatchError
  );
  assert.strictEqual(fs.existsSync(dest), false);
  assert.strictEqual(fs.existsSync(`${dest}.part`), false);
  await srv.close();
});

test('a file with the wrong size is rejected even without a sha256', async () => {
  const srv = await serve((req, res) => send(req, res));
  const dest = path.join(tmp(), 'config.json');
  await assert.rejects(downloadFile({ url: `${srv.url}/f`, dest, size: DATA.length + 1, retries: 0 }));
  assert.strictEqual(fs.existsSync(dest), false);
  await srv.close();
});

test('an HTTP error status is reported', async () => {
  const srv = await serve((req, res) => {
    res.writeHead(404);
    res.end();
  });
  const dest = path.join(tmp(), 'model.bin');
  await assert.rejects(downloadFile({ url: `${srv.url}/f`, dest, size: DATA.length, retries: 0 }), /404/);
  await srv.close();
});

test('follows redirects to another path', async () => {
  const srv = await serve((req, res) => {
    if (req.url === '/r') {
      res.writeHead(302, { Location: '/f' });
      return res.end();
    }
    send(req, res);
  });
  const dest = path.join(tmp(), 'model.bin');
  await downloadFile({ url: `${srv.url}/r`, dest, size: DATA.length, sha256: SHA });
  assert.ok(fs.readFileSync(dest).equals(DATA));
  await srv.close();
});

function catalogModel(url) {
  return {
    folder: 'm',
    baseUrl: url,
    files: [
      { name: 'config.json', size: DATA.length, sha256: SHA },
      { name: 'model.bin', size: DATA.length, sha256: SHA },
    ],
  };
}

test('downloadModel writes every file into models/<folder> and reports progress', async () => {
  const srv = await serve((req, res) => send(req, res));
  const dir = tmp();
  const progress = [];
  await downloadModel({ model: catalogModel(srv.url), modelsDir: dir, onProgress: (p) => progress.push(p) });
  for (const name of ['config.json', 'model.bin']) {
    assert.ok(fs.readFileSync(path.join(dir, 'm', name)).equals(DATA));
  }
  const last = progress.at(-1);
  assert.strictEqual(last.done, last.total);
  assert.strictEqual(last.total, 2 * DATA.length);
  await srv.close();
});

test('downloadModel skips files that are already complete', async () => {
  const srv = await serve((req, res) => send(req, res));
  const dir = tmp();
  fs.mkdirSync(path.join(dir, 'm'));
  fs.writeFileSync(path.join(dir, 'm', 'config.json'), DATA);
  await downloadModel({ model: catalogModel(srv.url), modelsDir: dir });
  assert.deepStrictEqual(srv.hits.map((h) => h.url), ['/model.bin']);
  await srv.close();
});

test('downloadModel replaces a finished file whose content is wrong', async () => {
  const srv = await serve((req, res) => send(req, res));
  const dir = tmp();
  fs.mkdirSync(path.join(dir, 'm'));
  fs.writeFileSync(path.join(dir, 'm', 'config.json'), Buffer.alloc(DATA.length, 1));
  await downloadModel({ model: catalogModel(srv.url), modelsDir: dir });
  assert.ok(fs.readFileSync(path.join(dir, 'm', 'config.json')).equals(DATA));
  await srv.close();
});

test('downloadModel can be cancelled and leaves only .part files behind', async () => {
  const srv = await serve((req, res) => send(req, res, { delayMs: 30 }));
  const dir = tmp();
  const ctrl = new AbortController();
  const run = downloadModel({
    model: catalogModel(srv.url),
    modelsDir: dir,
    signal: ctrl.signal,
    onProgress: (p) => {
      if (p.done > 0) ctrl.abort();
    },
  });
  await assert.rejects(run, { name: 'AbortError' });
  assert.strictEqual(fs.existsSync(path.join(dir, 'm', 'config.json')), false);
  await srv.close();
});
