const net = require('net');
const http = require('http');
const path = require('path');
const { spawn, execFileSync } = require('child_process');

const LOG_LINES = 200;
const TASKKILL = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'taskkill.exe');

function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.once('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

function ping(port) {
  return new Promise((resolve) => {
    const req = http.get({ host: '127.0.0.1', port, path: '/', timeout: 2000 }, (res) => {
      res.resume();
      resolve(res.statusCode < 500);
    });
    req.on('timeout', () => req.destroy());
    req.on('error', () => resolve(false));
  });
}

async function waitReady({ port, exitCode, timeoutMs, intervalMs = 300 }) {
  const end = Date.now() + timeoutMs;
  for (;;) {
    const code = exitCode();
    if (code !== null && code !== undefined) throw new Error(`Переводчик завершился при запуске (код ${code}).`);
    if (await ping(port)) return;
    if (Date.now() > end) throw new Error(`Переводчик не ответил за ${Math.round(timeoutMs / 1000)} с.`);
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}

function startBackend({ command, args, cwd, port, modelsDir }) {
  const env = {
    ...process.env,
    GRADIO_SERVER_PORT: String(port),
    TRANSLATOR_MODELS_DIR: modelsDir,
    TRANSLATOR_EMBEDDED: '1',
    HF_HUB_OFFLINE: '1',
    GRADIO_ANALYTICS_ENABLED: 'False',
  };
  delete env.PYTHONPATH;
  delete env.PYTHONHOME;
  const proc = spawn(command, args, { cwd, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  const lines = [];
  const partial = { out: '', err: '' };
  const collect = (key) => (text) => {
    const parts = (partial[key] + text).split(/\r?\n/);
    partial[key] = parts.pop();
    for (const line of parts) {
      lines.push(line);
      if (lines.length > LOG_LINES) lines.shift();
    }
  };
  proc.stdout.setEncoding('utf8');
  proc.stderr.setEncoding('utf8');
  proc.stdout.on('data', collect('out'));
  proc.stderr.on('data', collect('err'));
  let code = null;
  proc.on('exit', (c, signal) => {
    code = c ?? (signal ? -1 : 0);
  });
  proc.on('error', (e) => {
    lines.push(`Не удалось запустить ${command}: ${e.message}`);
    if (code === null) code = -1;
  });
  return {
    proc,
    pid: proc.pid,
    exitCode: () => code,
    log: () => [...lines, partial.out, partial.err].filter(Boolean).slice(-LOG_LINES).join('\n'),
  };
}

// Gradio and CTranslate2 can spawn workers; killing only the parent would leave them holding the port and RAM.
function stopBackend(backend) {
  return new Promise((resolve) => {
    if (backend.exitCode() !== null) return resolve();
    backend.proc.once('exit', () => resolve());
    try {
      execFileSync(TASKKILL, ['/PID', String(backend.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
    } catch {
      try {
        backend.proc.kill();
      } catch {
        // already gone
      }
    }
    setTimeout(resolve, 5000).unref();
  });
}

module.exports = { freePort, waitReady, startBackend, stopBackend };
