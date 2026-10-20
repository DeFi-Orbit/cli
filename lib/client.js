import { resolveKey } from './config.js';

const DEFAULT_BASE = 'https://api.defiorbit.xyz';

export class ApiError extends Error {
  constructor(status, body) {
    const inner = body && body.error ? body.error : {};
    super(inner.message || `HTTP ${status}`);
    this.name = 'ApiError';
    this.status = status;
    this.code = inner.code || null;
    this.requestId = inner.request_id || null;
    this.body = body;
  }
}

/**
 * Perform one API request. Returns { data (parsed body), status, headers }.
 * Query params with undefined/null values are dropped.
 */
export async function request(method, path, { query = {}, body, key, base } = {}) {
  const apiKey = resolveKey(key);
  if (!apiKey) {
    process.stderr.write(
      'No API key. Run `defiorbit auth login`, set DEFIORBIT_API_KEY, or pass --key.\n' +
      'Create a key at https://platform.defiorbit.xyz/dashboard/keys\n'
    );
    process.exit(2);
  }
  const url = new URL(path, base || process.env.DEFIORBIT_API_BASE || DEFAULT_BASE);
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined && v !== null && v !== false) url.searchParams.set(k, String(v === true ? 'true' : v));
  }
  const res = await fetch(url, {
    method,
    headers: {
      authorization: `Bearer ${apiKey}`,
      accept: 'application/json',
      ...(body ? { 'content-type': 'application/json' } : {}),
      'user-agent': 'defiorbit-cli',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let parsed = null;
  const text = await res.text();
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = { raw: text };
  }
  if (!res.ok) throw new ApiError(res.status, parsed);
  return { data: parsed, status: res.status, headers: res.headers };
}
