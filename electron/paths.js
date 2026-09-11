const fs = require('fs');
const os = require('os');
const path = require('path');

const APP_DIR = 'Translator AI';
// Same rules as is_complete() in app.py: a folder only counts once every file has fully arrived.
const REQUIRED = ['config.json', 'model.bin', 'shared_vocabulary.json', 'tokenizer_config.json'];
const TOKENIZERS = ['tokenizer.json', 'sentencepiece.bpe.model'];
const NOT_PHYSICAL = /tun|tap-|tap |vpn|wireguard|xray|v2ray|zerotier|tailscale|hamachi|vethernet|hyper-v|virtualbox|vmware|loopback|bluetooth|dco/i;

function dataDir(env = process.env) {
  if (env.PORTABLE_EXECUTABLE_DIR) return path.join(env.PORTABLE_EXECUTABLE_DIR, `${APP_DIR} Data`);
  return path.join(env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), APP_DIR);
}

function isFile(p, nonEmpty = false) {
  try {
    const s = fs.statSync(p);
    return s.isFile() && (!nonEmpty || s.size > 0);
  } catch {
    return false;
  }
}

function isCompleteModel(dir) {
  return (
    REQUIRED.every((f) => isFile(path.join(dir, f))) &&
    isFile(path.join(dir, 'model.bin'), true) &&
    TOKENIZERS.some((f) => isFile(path.join(dir, f)))
  );
}

function modelsFound(modelsDir, folders) {
  return folders.filter((f) => isCompleteModel(path.join(modelsDir, f)));
}

function readConfig(dir) {
  try {
    const cfg = JSON.parse(fs.readFileSync(path.join(dir, 'config.json'), 'utf8'));
    return cfg && typeof cfg === 'object' && !Array.isArray(cfg) ? cfg : {};
  } catch {
    return {};
  }
}

function writeConfig(dir, cfg) {
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, 'config.json');
  fs.writeFileSync(`${file}.tmp`, JSON.stringify(cfg, null, 2));
  fs.renameSync(`${file}.tmp`, file);
}

// The address of a real network card, so downloads can bypass a VPN tunnel (like curl --interface).
function physicalIPv4(ifaces = os.networkInterfaces()) {
  for (const [name, addrs] of Object.entries(ifaces)) {
    if (NOT_PHYSICAL.test(name)) continue;
    for (const a of addrs || []) {
      const v4 = a.family === 'IPv4' || a.family === 4;
      if (v4 && !a.internal && !a.address.startsWith('169.254.')) return { name, address: a.address };
    }
  }
  return null;
}

module.exports = { dataDir, isFile, isCompleteModel, modelsFound, readConfig, writeConfig, physicalIPv4 };
