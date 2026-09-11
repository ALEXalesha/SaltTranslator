const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const paths = require('../paths');

function tmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'tai-'));
}

function writeModel(dir, overrides = {}) {
  const files = {
    'config.json': '{}',
    'model.bin': 'x',
    'shared_vocabulary.json': '[]',
    'tokenizer_config.json': '{}',
    'tokenizer.json': '{}',
    ...overrides,
  };
  fs.mkdirSync(dir, { recursive: true });
  for (const [name, content] of Object.entries(files)) {
    if (content !== null) fs.writeFileSync(path.join(dir, name), content);
  }
  return dir;
}

test('portable build keeps its data next to the exe', () => {
  const env = { PORTABLE_EXECUTABLE_DIR: 'D:\\Tools', LOCALAPPDATA: 'C:\\Local' };
  assert.strictEqual(paths.dataDir(env), path.join('D:\\Tools', 'Translator AI Data'));
});

test('installed build keeps its data in LOCALAPPDATA', () => {
  assert.strictEqual(paths.dataDir({ LOCALAPPDATA: 'C:\\Local' }), path.join('C:\\Local', 'Translator AI'));
});

test('a complete model folder is accepted', () => {
  assert.strictEqual(paths.isCompleteModel(writeModel(path.join(tmp(), 'm'))), true);
});

test('a sentencepiece tokenizer is enough', () => {
  const dir = writeModel(path.join(tmp(), 'm'), { 'tokenizer.json': null, 'sentencepiece.bpe.model': 'x' });
  assert.strictEqual(paths.isCompleteModel(dir), true);
});

for (const [name, overrides] of [
  ['an empty model.bin', { 'model.bin': '' }],
  ['a folder without a tokenizer', { 'tokenizer.json': null }],
  ['a folder without the vocabulary', { 'shared_vocabulary.json': null }],
  ['a folder without config.json', { 'config.json': null }],
  ['a model.bin that is still downloading', { 'model.bin': null, 'model.bin.part': 'x' }],
]) {
  test(`${name} is rejected`, () => {
    assert.strictEqual(paths.isCompleteModel(writeModel(path.join(tmp(), 'm'), overrides)), false);
  });
}

test('a missing folder is rejected', () => {
  assert.strictEqual(paths.isCompleteModel(path.join(tmp(), 'nope')), false);
});

test('modelsFound lists only complete folders, in catalog order', () => {
  const dir = tmp();
  writeModel(path.join(dir, 'ct2-int8'));
  writeModel(path.join(dir, 'nllb-ct2-int8'));
  fs.mkdirSync(path.join(dir, 'broken'));
  assert.deepStrictEqual(paths.modelsFound(dir, ['nllb-ct2-int8', 'broken', 'ct2-int8']), ['nllb-ct2-int8', 'ct2-int8']);
});

test('config round-trips, including non-ASCII paths', () => {
  const dir = tmp();
  paths.writeConfig(dir, { modelsDir: 'C:\\Модели и пробелы' });
  assert.deepStrictEqual(paths.readConfig(dir), { modelsDir: 'C:\\Модели и пробелы' });
});

test('a corrupt or missing config reads as empty', () => {
  const dir = tmp();
  assert.deepStrictEqual(paths.readConfig(dir), {});
  fs.writeFileSync(path.join(dir, 'config.json'), '{oops');
  assert.deepStrictEqual(paths.readConfig(dir), {});
});

test('physicalIPv4 skips VPN, virtual, loopback and link-local adapters', () => {
  const ifaces = {
    OneXrayTun: [{ family: 'IPv4', address: '10.0.0.2', internal: false }],
    'vEthernet (WSL)': [{ family: 'IPv4', address: '172.20.0.1', internal: false }],
    'Loopback Pseudo-Interface 1': [{ family: 'IPv4', address: '127.0.0.1', internal: true }],
    'Ethernet 2': [{ family: 'IPv4', address: '169.254.10.1', internal: false }],
    Ethernet: [
      { family: 'IPv6', address: 'fe80::1', internal: false },
      { family: 'IPv4', address: '192.168.0.104', internal: false },
    ],
  };
  assert.deepStrictEqual(paths.physicalIPv4(ifaces), { name: 'Ethernet', address: '192.168.0.104' });
});

test('physicalIPv4 accepts the numeric family some Node versions report', () => {
  assert.deepStrictEqual(paths.physicalIPv4({ 'Wi-Fi': [{ family: 4, address: '192.168.1.5', internal: false }] }), {
    name: 'Wi-Fi',
    address: '192.168.1.5',
  });
});

test('physicalIPv4 returns null when only tunnels exist', () => {
  const ifaces = {
    WireGuard: [{ family: 'IPv4', address: '10.8.0.2', internal: false }],
    'TAP-Windows Adapter V9': [{ family: 'IPv4', address: '10.9.0.2', internal: false }],
    'OpenVPN Connect DCO Adapter': [{ family: 'IPv4', address: '10.10.0.2', internal: false }],
  };
  assert.strictEqual(paths.physicalIPv4(ifaces), null);
});
