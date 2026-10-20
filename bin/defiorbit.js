#!/usr/bin/env node
/**
 * defiorbit — CLI for the DeFi Orbit API.
 * Position-level DeFi data: LP + lending positions, P&L, fees, IL, risk.
 * Docs: https://docs.defiorbit.xyz · Keys: https://platform.defiorbit.xyz
 */
import { Command } from 'commander';

// Exit quietly when stdout closes early (e.g. `defiorbit endpoints | head`).
process.stdout.on('error', (err) => {
  if (err.code === 'EPIPE') process.exit(0);
  throw err;
});
import { createInterface } from 'node:readline';
import { request } from '../lib/client.js';
import { printData, printError } from '../lib/format.js';
import { readConfig, writeConfig, clearConfig, resolveKey, configPath } from '../lib/config.js';
import routes from '../lib/routes.json' with { type: 'json' };

const LP = ['uniswapv3', 'aerodromev3', 'orca'];
const LENDING = ['aavev3', 'morpho', 'kamino'];

const program = new Command();
program
  .name('defiorbit')
  .description('DeFi Orbit API from the terminal — LP & lending positions, P&L, IL, risk.\nAuth: `defiorbit auth login` or DEFIORBIT_API_KEY.')
  .version('0.1.0')
  .option('--json', 'print raw JSON instead of formatted output')
  .option('--key <key>', 'API key for this invocation (overrides config/env)');

const g = () => program.opts();

async function run(method, path, query = {}, body) {
  try {
    const { data } = await request(method, path, { query, body, key: g().key });
    if (g().json) process.stdout.write(JSON.stringify(data, null, 2) + '\n');
    else printData(data);
  } catch (err) {
    printError(err);
  }
}

function assertProtocol(p, group, label) {
  if (!group.includes(p)) {
    process.stderr.write(`Unknown ${label} protocol "${p}". Expected one of: ${group.join(', ')}\n`);
    process.exit(2);
  }
}

/* ---------------- auth ---------------- */
const auth = program.command('auth').description('manage the stored API key');
auth
  .command('login [apiKey]')
  .description('store an API key in ' + configPath)
  .action(async (apiKey) => {
    if (!apiKey) {
      const rl = createInterface({ input: process.stdin, output: process.stderr });
      apiKey = await new Promise((res) => rl.question('API key (do_sk_…): ', (a) => { rl.close(); res(a.trim()); }));
    }
    if (!/^do_sk_/.test(apiKey)) {
      process.stderr.write('That does not look like a DeFi Orbit key (expected do_sk_…).\n');
      process.exit(2);
    }
    writeConfig({ apiKey });
    try {
      const { data } = await request('GET', '/v1/usage/credits', { key: apiKey });
      process.stderr.write(`Key saved. Credits remaining: ${data?.data?.credits_remaining}\n`);
    } catch (err) {
      process.stderr.write('Key saved, but the verification call failed:\n');
      printError(err);
    }
  });
auth
  .command('status')
  .description('show which key is active and where it comes from')
  .action(() => {
    const key = resolveKey(g().key);
    if (!key) return void process.stdout.write('No key configured.\n');
    const source = g().key ? '--key flag' : process.env.DEFIORBIT_API_KEY ? 'DEFIORBIT_API_KEY env' : configPath;
    process.stdout.write(`Active key: ${key.slice(0, 8)}…${key.slice(-4)} (from ${source})\n`);
  });
auth
  .command('logout')
  .description('delete the stored key')
  .action(() => { clearConfig(); process.stdout.write('Stored key removed.\n'); });

/* ---------------- usage ---------------- */
program
  .command('credits')
  .description('remaining credit balance for your organization (1 credit)')
  .action(() => run('GET', '/v1/usage/credits'));

program
  .command('logs')
  .description('recent API request log for your organization (1 credit)')
  .option('--range <range>', 'time range, e.g. 24h, 7d')
  .option('--path <path>', 'filter by endpoint path')
  .option('--status <code>', 'filter by HTTP status code')
  .action((o) => run('GET', '/v1/usage/logs', { range: o.range, path: o.path, status_code: o.status }));

/* ---------------- portfolio & snapshots ---------------- */
program
  .command('balance <wallet>')
  .description('total wallet USD value (30 credits)')
  .action((wallet) => run('GET', '/v1/portfolio/balance', { wallet }));

program
  .command('assets <wallet>')
  .description('wallet holdings (30 credits)')
  .action((wallet) => run('GET', '/v1/portfolio/assets', { wallet }));

const snapshots = program.command('snapshots').description('stored daily wallet snapshots');
snapshots
  .command('dates <wallet>')
  .description('UTC days with a stored snapshot, newest first (1 credit)')
  .action((wallet) => run('GET', '/v1/snapshots/dates', { wallet }));
snapshots
  .command('wallet <wallet> <date>')
  .description('the stored snapshot for one UTC day, YYYY-MM-DD (10 credits)')
  .action((wallet, date) => run('GET', '/v1/snapshots/wallet', { wallet, date }));

/* ---------------- LP positions ---------------- */
program
  .command('summary <protocol> <wallet>')
  .description(`position counts / at-risk flag. protocol: ${[...LP, ...LENDING].join('|')} (1-3 credits)`)
  .option('--chain <id>', 'chain id filter')
  .action((protocol, wallet, o) => {
    const base = LP.includes(protocol) ? '/v1/positions' : LENDING.includes(protocol) ? '/v1/lending' : null;
    if (!base) assertProtocol(protocol, [...LP, ...LENDING], 'any');
    run('GET', `${base}/${protocol}/summary`, { wallet, chain_id: o.chain });
  });

program
  .command('positions <protocol> <wallet>')
  .description(`list LP positions for a wallet. protocol: ${LP.join('|')}`)
  .option('--status <status>', 'active|inactive')
  .option('--full', 'include full calculations (higher credit cost)')
  .option('--chain <id>', 'chain id filter')
  .option('--page <n>').option('--limit <n>')
  .action((protocol, wallet, o) => {
    assertProtocol(protocol, LP, 'LP');
    run('GET', `/v1/positions/${protocol}`, { wallet, status: o.status, full: o.full, chain_id: o.chain, page: o.page, limit: o.limit });
  });

for (const [cmd, seg, desc] of [
  ['position', '', 'current state of one position'],
  ['pnl', '/pnl', 'P&L, impermanent loss and HODL benchmark (8 credits)'],
  ['yield', '/yield', 'APR, fees and rewards (8 credits)'],
  ['events', '/events', 'deposits, withdrawals, collections (1 credit)'],
  ['snapshot', '/snapshot', 'current health check (5 credits)'],
  ['history', '/snapshots', 'one row per UTC day (2 credits)'],
  ['full', '/full', 'everything in one payload (15 credits)'],
]) {
  program
    .command(`${cmd} <protocol> <id>`)
    .description(`${desc}. protocol: ${LP.join('|')}`)
    .option('--chain <id>', 'chain id (required for uniswapv3/aerodromev3)')
    .option('--wallet <addr>', 'owner wallet (orca; resolves DeFi Tuna sub_protocol)')
    .option('--status <status>', 'active|inactive (pnl/yield/full)')
    .option('--manager <addr>', 'manager address (vFat/Revert managed positions)')
    .action((protocol, id, o) => {
      assertProtocol(protocol, LP, 'LP');
      run('GET', `/v1/positions/${protocol}/${id}${seg}`, {
        chain_id: o.chain, wallet: o.wallet, status: o.status, manager_address: o.manager,
      });
    });
}

/* ---------------- lending ---------------- */
program
  .command('lending <protocol> <wallet>')
  .description(`lending positions with health factor, LTV, APY. protocol: ${LENDING.join('|')} (15 credits/result)`)
  .option('--chain <id>', 'chain id filter (aavev3/morpho)')
  .option('--market <id>', 'market id filter (morpho)')
  .option('--no-calc', 'cheaper list without calculations (3 credits/result)')
  .action((protocol, wallet, o) => {
    assertProtocol(protocol, LENDING, 'lending');
    const path = o.calc === false ? `/v1/lending/${protocol}/position` : `/v1/lending/${protocol}`;
    run('GET', path, { wallet, chain_id: o.chain, market_id: o.market });
  });

for (const [cmd, seg, desc] of [
  ['risk', 'risk', 'liquidation distance, safe borrow/withdraw (8 credits)'],
  ['interest', 'yield', 'interest earned vs paid, net APY (8 credits)'],
  ['lending-events', 'events', 'supply/borrow/withdraw/repay/liquidation history (1 credit)'],
  ['lending-history', 'snapshots', 'daily lending snapshots (2 credits)'],
]) {
  program
    .command(`${cmd} <protocol> <wallet>`)
    .description(`${desc}. protocol: ${LENDING.join('|')}`)
    .option('--chain <id>', 'chain id (aavev3/morpho)')
    .option('--market <id>', 'market id (required for morpho risk/interest; kamino market address)')
    .option('--obligation <addr>', 'obligation address (kamino)')
    .action((protocol, wallet, o) => {
      assertProtocol(protocol, LENDING, 'lending');
      if (protocol === 'kamino') {
        if (!o.obligation) {
          process.stderr.write('kamino routes need --obligation <address> (list them with: defiorbit lending kamino <wallet>)\n');
          process.exit(2);
        }
        return run('GET', `/v1/lending/kamino/position/${o.obligation}/${seg}`, { wallet, market_address: o.market });
      }
      if (!o.chain) {
        process.stderr.write(`${protocol} ${cmd} needs --chain <id>\n`);
        process.exit(2);
      }
      run('GET', `/v1/lending/${protocol}/position/${o.chain}/${seg}`, { wallet, market_id: o.market });
    });
}

/* ---------------- raw + discovery ---------------- */
program
  .command('api <method> <path>')
  .description('raw call to any endpoint, e.g.: defiorbit api GET /v1/positions/orca -q wallet=…')
  .option('-q, --query <k=v...>', 'query parameters', (v, acc) => (acc.push(v), acc), [])
  .option('-d, --data <json>', 'JSON request body (POST)')
  .action((method, path, o) => {
    const query = Object.fromEntries(o.query.map((kv) => kv.split(/=(.*)/s).slice(0, 2)));
    let body;
    if (o.data) {
      try { body = JSON.parse(o.data); } catch { process.stderr.write('--data is not valid JSON\n'); process.exit(2); }
    }
    run(method.toUpperCase(), path, query, body);
  });

program
  .command('endpoints [filter]')
  .description('list every API operation (from the OpenAPI spec this build shipped with)')
  .action((filter) => {
    for (const r of routes) {
      const line = `${r.method.padEnd(4)} ${r.path}  — ${r.summary}`;
      if (!filter || line.toLowerCase().includes(filter.toLowerCase())) process.stdout.write(line + '\n');
    }
    process.stdout.write('\nFull reference: https://docs.defiorbit.xyz/api-reference\n');
  });

program.parseAsync(process.argv);
