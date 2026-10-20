import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync, chmodSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const DIR = join(homedir(), '.config', 'defiorbit');
const FILE = join(DIR, 'config.json');

export function readConfig() {
  try {
    return JSON.parse(readFileSync(FILE, 'utf8'));
  } catch {
    return {};
  }
}

export function writeConfig(patch) {
  mkdirSync(DIR, { recursive: true });
  const next = { ...readConfig(), ...patch };
  writeFileSync(FILE, JSON.stringify(next, null, 2) + '\n');
  chmodSync(FILE, 0o600);
  return next;
}

export function clearConfig() {
  if (existsSync(FILE)) rmSync(FILE);
}

export function resolveKey(cliKey) {
  return cliKey || process.env.DEFIORBIT_API_KEY || readConfig().apiKey || null;
}

export const configPath = FILE;
