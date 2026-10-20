const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const RESET = '\x1b[0m';
const tty = process.stdout.isTTY;

const b = (s) => (tty ? BOLD + s + RESET : s);
const dim = (s) => (tty ? DIM + s + RESET : s);

/** Flatten an object into dotted key/value pairs for display. */
function flatten(obj, prefix = '', out = []) {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v !== null && typeof v === 'object' && !Array.isArray(v)) flatten(v, key, out);
    else if (Array.isArray(v) && v.every((x) => typeof x !== 'object')) out.push([key, v.join(', ')]);
    else if (Array.isArray(v)) out.push([key, `[${v.length} items]`]);
    else out.push([key, v]);
  }
  return out;
}

function printKv(obj, indent = '') {
  const rows = flatten(obj);
  const w = Math.min(38, Math.max(...rows.map(([k]) => k.length), 0));
  for (const [k, v] of rows) process.stdout.write(`${indent}${dim(k.padEnd(w))}  ${v}\n`);
}

/**
 * Print an API payload. Objects become key/value blocks; arrays become
 * numbered blocks. `--json` callers should bypass this and dump raw JSON.
 */
export function printData(payload) {
  const data = payload && payload.data !== undefined ? payload.data : payload;
  if (data === null || data === undefined) {
    process.stdout.write(dim('(empty)') + '\n');
  } else if (Array.isArray(data)) {
    if (data.length === 0) process.stdout.write(dim('(no results)') + '\n');
    data.forEach((item, i) => {
      process.stdout.write(b(`— ${i + 1} —`) + '\n');
      if (item && typeof item === 'object') printKv(item, '  ');
      else process.stdout.write(`  ${item}\n`);
    });
  } else if (typeof data === 'object') {
    printKv(data);
  } else {
    process.stdout.write(String(data) + '\n');
  }
  const meta = [];
  if (payload && payload.pagination) {
    const p = payload.pagination;
    meta.push(`page ${p.page} · ${p.total} total${p.next_page ? ' · more pages' : ''}`);
  }
  if (payload && payload.request_id) meta.push(payload.request_id);
  if (meta.length) process.stdout.write(dim(meta.join('  ·  ')) + '\n');
}

export function printError(err) {
  if (err.name === 'ApiError') {
    const parts = [`HTTP ${err.status}`];
    if (err.code) parts.push(err.code);
    process.stderr.write(`${parts.join(' · ')}: ${err.message}\n`);
    if (err.requestId) process.stderr.write(dim(`request_id: ${err.requestId}\n`));
    if (err.status === 401) process.stderr.write('Check your key: defiorbit auth status\n');
    if (err.status === 402) process.stderr.write('Add credits at https://platform.defiorbit.xyz\n');
  } else {
    process.stderr.write(`${err.message}\n`);
  }
  process.exit(1);
}
