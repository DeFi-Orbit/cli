# defiorbit

Command-line client for the [DeFi Orbit API](https://docs.defiorbit.xyz) — position-level DeFi data: LP and lending positions, P&L, fees, impermanent loss and liquidation risk across 10 chains.

```bash
npx defiorbit credits
```

No install needed (`npx`), or install globally: `npm i -g defiorbit`. Requires Node 18+.

## Auth

Create a key at [platform.defiorbit.xyz](https://platform.defiorbit.xyz/dashboard/keys) (shaped `do_sk_…`), then any of:

```bash
defiorbit auth login            # stores it in ~/.config/defiorbit (0600), verifies with a 1-credit call
export DEFIORBIT_API_KEY=do_sk_…
defiorbit --key do_sk_… credits # one-off
```

Billing is prepaid credits — each endpoint has a fixed, published cost (1–30 per call), shown in `--help` for every command. Failed requests are free.

## Examples

```bash
# balance check — the canonical first call (1 credit)
defiorbit credits

# how many Uniswap V3 positions does a wallet have? (1 credit)
defiorbit summary uniswapv3 0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045

# list them (2 credits per position)
defiorbit positions uniswapv3 0xd8dA…6045 --limit 5

# the money question: P&L, impermanent loss, HODL benchmark (8 credits)
defiorbit pnl uniswapv3 112161 --chain 1

# Aave liquidation distance + safe borrow amounts (8 credits)
defiorbit risk aavev3 0xYourWallet --chain 8453

# Solana: Kamino obligations, then drill in
defiorbit lending kamino <solana-wallet>
defiorbit risk kamino <solana-wallet> --obligation <address>

# anything in the API, raw (full OpenAPI coverage)
defiorbit api GET /v1/positions/orca -q wallet=<solana-wallet> -q full=true

# machine-readable output for scripts and agents
defiorbit --json pnl uniswapv3 112161 --chain 1 | jq .data.pnl_usd_value

# discover every operation
defiorbit endpoints [filter]
```

Protocols: `uniswapv3`, `aerodromev3`, `orca` (LP) · `aavev3`, `morpho`, `kamino` (lending). Positions opened via DeFi Tuna, vFat or Revert come back on the Orca/Uniswap routes with a `sub_protocol` tag — pass `--wallet` on Orca lookups to resolve Tuna positions.

## For AI agents

- `--json` on any command gives raw API output; exit codes: `0` ok, `1` API error (message + `request_id` on stderr), `2` usage error.
- The same data is available as an MCP server (54 read-only tools): see [docs.defiorbit.xyz/recipes/mcp](https://docs.defiorbit.xyz/recipes/mcp).
- OpenAPI spec: [full](https://docs.defiorbit.xyz/openapi.yaml) · [compact](https://docs.defiorbit.xyz/openapi.compact.json) · capability matrix: [capabilities.json](https://defiorbit.xyz/.well-known/capabilities.json)

## Links

Docs: https://docs.defiorbit.xyz · Dashboard: https://platform.defiorbit.xyz · Site: https://defiorbit.xyz · Support: support@defiorbit.xyz
