const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const http = require('http');
const net = require('net');
const os = require('os');
const path = require('path');
const { freePort, waitReady, startBackend, stopBackend } = require('../backend');

function tmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'tai-be-'));
}

async function until(check, timeoutMs = 10_000) {
  const end = Date.now() + timeoutMs;
  while (!check()) {
    if (Date.now() > end) throw new Error('condition not met in time');
    await new Promise((r) => setTimeout(r, 50));
  }
}

function alive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

test('freePort returns a port that can be bound', async () => {
  const port = await freePort();
  assert.ok(port > 0 && port < 65536);
  await new Promise((resolve, reject) => {
    const s = net.createServer().once('error', reject);
    s.listen(port, '127.0.0.1', () => s.close(resolve));
  });
});

test('waitReady resolves once the server answers', async () => {
  const port = await freePort();
  const srv = http.createServer((req, res) => res.end('ok'));
  setTimeout(() => srv.listen(port, '127.0.0.1'), 300);
  await waitReady({ port, exitCode: () => null, timeoutMs: 10_000, intervalMs: 50 });
  srv.close();
});

test('waitReady fails fast when the process has already exited', async () => {
  const port = await freePort();
  const started = Date.now();
  await assert.rejects(waitReady({ port, exitCode: () => 3, timeoutMs: 10_000, intervalMs: 50 }), /код 3/);
  assert.ok(Date.now() - started < 2000);
});

test('waitReady gives up after the timeout', async () => {
  const port = await freePort();
  await assert.rejects(waitReady({ port, exitCode: () => null, timeoutMs: 300, intervalMs: 50 }), /не ответил/);
});

test('startBackend passes the environment, captures output, and stopBackend kills the whole tree', async () => {
  const dir = tmp();
  const script = path.join(dir, 'fake.js');
  fs.writeFileSync(
    script,
    [
      "const cp = require('child_process');",
      "const child = cp.spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });",
      "console.log('PORT=' + process.env.GRADIO_SERVER_PORT + ' MODELS=' + process.env.TRANSLATOR_MODELS_DIR + ' EMB=' + process.env.TRANSLATOR_EMBEDDED);",
      "console.log('CHILD=' + child.pid);",
      'setInterval(() => {}, 1000);',
    ].join('\n')
  );
  const backend = startBackend({ command: process.execPath, args: [script], cwd: dir, port: 12345, modelsDir: 'C:\\Модели' });
  await until(() => /CHILD=\d+/.test(backend.log()));
  assert.match(backend.log(), /PORT=12345 MODELS=C:\\Модели EMB=1/);
  const child = Number(/CHILD=(\d+)/.exec(backend.log())[1]);
  assert.strictEqual(backend.exitCode(), null);
  await stopBackend(backend);
  await until(() => !alive(backend.pid) && !alive(child));
});

test('the log keeps only the most recent lines', async () => {
  const dir = tmp();
  const script = path.join(dir, 'noisy.js');
  fs.writeFileSync(script, 'for (let i = 0; i < 1000; i++) console.log("line " + i);');
  const backend = startBackend({ command: process.execPath, args: [script], cwd: dir, port: 1, modelsDir: dir });
  await until(() => backend.exitCode() !== null && backend.log().includes('line 999'));
  const lines = backend.log().trim().split('\n');
  assert.ok(lines.length <= 200);
  assert.strictEqual(lines.at(-1), 'line 999');
  assert.strictEqual(backend.exitCode(), 0);
});
