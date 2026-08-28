---
name: codegen
description: Regenerate the SDK's contract ABIs and Ponder entity types after changing contracts or the indexer schema.
---

# Regenerating SDK codegen

Two generators, usually run together. There is no `bun run codegen` script — the
source lives in this document (see [Generators](#generators)) and is run from a
scratch file.

## When

| You changed…               | Regenerate? | Which generator    |
| -------------------------- | ----------- | ------------------ |
| `contracts/src/**`         | yes         | `gen-abis`         |
| `indexer/ponder.schema.ts` | yes         | `gen-ponder-types` |
| SDK or indexer source only | no          | —                  |

Run it **before** touching indexer or SDK code that consumes the ABIs — stale
ABIs produce type errors that look like SDK bugs.

## ⚠ Nothing enforces this

CI used to regenerate and fail on any diff. That check is gone. A `.sol` change
landing without regenerated ABIs now ships stale types to the published SDK, and
the first symptom is a downstream type error or a call that encodes wrong.

After regenerating, always eyeball the result:

```bash
git diff packages/sdk/src/abis packages/sdk/src/ponder/entities.ts
```

An empty diff after a contract change means you forgot `forge build`. A diff you
did not expect means a `.sol` change landed earlier without codegen.

## How to run

Both generators are plain Bun scripts. They have **different placement rules** —
this is not cosmetic, see the warning below.

```bash
cd contracts && forge build && cd ..
bun run /path/to/scratchpad/gen-abis.ts

cp /path/to/scratchpad/gen-ponder-types.ts indexer/
cd indexer && bun run ./gen-ponder-types.ts && rm ./gen-ponder-types.ts && cd ..
```

`gen-abis` imports nothing outside node builtins, so it runs from the scratchpad
and resolves the repo root from `process.cwd()` — invoke it from the repo root.

### ⚠ `gen-ponder-types` must live inside `indexer/`

It imports `drizzle-orm`, and so does `indexer/ponder.schema.ts`. Those two must
be the **same copy** — `getTableColumns` reads drizzle-internal symbols off the
table objects, and a version mismatch makes it return garbage or nothing rather
than fail loudly.

A script run from the scratchpad is outside any project, so bun ignores your cwd
and **auto-installs its own drizzle-orm into the global cache**
(`~/.bun/install/cache`) — currently 0.45.2, against the 0.41.0 that ponder pins
and that actually built the schema. Copying the script into `indexer/` first is
what makes the bare import resolve to `indexer/node_modules/drizzle-orm`.

Verify at any time with:

```bash
cd indexer && bun run -e "console.log(import.meta.resolve('drizzle-orm'))"
```

It must print a path under `indexer/node_modules`, never one under
`~/.bun/install/cache`.

`gen-abis` requires a fresh `forge build` — it reads Foundry artifacts from
`contracts/out/<Artifact>.sol/<Artifact>.json` and throws
``Missing artifact … — run `forge build` first.`` otherwise. `gen-ponder-types`
has no such prerequisite; it imports `ponder.schema.ts` from its own directory.
Both require `packages/sdk` to have been installed, for the prettier binary.

Success looks like:

```
Generated 9 ABIs → packages/sdk/src/abis
Generated 24 entity types → packages/sdk/src/ponder/entities.ts
```

## What gets written

- `packages/sdk/src/abis/<name>.ts` — one per artifact in the target table below,
  each `export const <NAME>_ABI = [...] as const` with `constructor` entries
  stripped.
- `packages/sdk/src/ponder/entities.ts` — one interface per Ponder table plus
  `PonderRootFields`.

All committed to git. The published SDK builds from them without regenerating,
so a stale commit ships stale types.

`packages/sdk/src/index.ts` is not generated; its `export * from './abis/…'`
lines are hand-maintained. Five ABI files are hand-written too — `erc20`,
`uniswap-v2-router`, `uniswap-v3-quoter`, `uniswap-v3-swap-router`,
`uniswap-v3-staker`. Three are deliberately not re-exported from `index.ts`:
`erc20-token` (folded into `erc20`), and `uniswap-v2-router` /
`uniswap-v3-quoter` (internal to the quote and plan paths).

## Spec

Reproduce this exactly; the outputs are the SDK's published surface and must
stay byte-stable.

**ABIs** — read `.abi` from each artifact, drop entries where
`type === 'constructor'`, emit
`export const <CONST> = ${JSON.stringify(entries, null, 4)} as const` plus a
trailing newline.

| Artifact                      | Output file                    | Export                             |
| ----------------------------- | ------------------------------ | ---------------------------------- |
| `BondingCurveJunoswap`        | `bonding-curve-junoswap`       | `BONDING_CURVE_JUNOSWAP_ABI`       |
| `AggRouterJunoswap`           | `agg-router-junoswap`          | `AGG_ROUTER_JUNOSWAP_ABI`          |
| `ERC20Token`                  | `erc20-token`                  | `ERC20_TOKEN_ABI`                  |
| `IUniswapV2Factory`           | `uniswap-v2-factory`           | `UNISWAP_V2_FACTORY_ABI`           |
| `IUniswapV2Pair`              | `uniswap-v2-pair`              | `UNISWAP_V2_PAIR_ABI`              |
| `IUniswapV3Factory`           | `uniswap-v3-factory`           | `UNISWAP_V3_FACTORY_ABI`           |
| `IUniswapV3Pool`              | `uniswap-v3-pool`              | `UNISWAP_V3_POOL_ABI`              |
| `INonfungiblePositionManager` | `nonfungible-position-manager` | `NONFUNGIBLE_POSITION_MANAGER_ABI` |
| `IWETH9`                      | `weth9`                        | `WETH9_ABI`                        |

**Entities** — per table, `export interface <Pascal(tsName)>`; each column is
`number` when `dataType === 'number'` else `string`, suffixed `| null` when not
`notNull`. Then `PonderRootFields` mapping `<tsName>s: '<TypeName>'`.

Both finish by running `packages/sdk/node_modules/.bin/prettier --write` on the
output path — the SDK's pinned prettier, not `bun x`. `bun x` would fetch an
unpinned prettier, and the formatting of these files is part of the SDK's
published surface. The style comes from `packages/sdk/.prettierrc`; if that file
goes missing, prettier silently falls back to its defaults (2-space, semicolons,
double quotes) and reformats every generated file.

## Adding a contract

Add a row to the target table above and the matching entry in `TARGETS` in the
generator source. Then rebuild, regenerate, and add the
`export * from './abis/<file>.js'` line to `packages/sdk/src/index.ts` by hand.

## Generators

### gen-abis

```ts
import { $ } from 'bun'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

const ROOT = process.cwd()
const OUT_DIR = path.join(ROOT, 'contracts/out')
const ABI_DIR = path.join(ROOT, 'packages/sdk/src/abis')
const PRETTIER = path.join(ROOT, 'packages/sdk/node_modules/.bin/prettier')

const TARGETS: Record<string, [string, string]> = {
    BondingCurveJunoswap: ['bonding-curve-junoswap', 'BONDING_CURVE_JUNOSWAP_ABI'],
    AggRouterJunoswap: ['agg-router-junoswap', 'AGG_ROUTER_JUNOSWAP_ABI'],
    ERC20Token: ['erc20-token', 'ERC20_TOKEN_ABI'],
    IUniswapV2Factory: ['uniswap-v2-factory', 'UNISWAP_V2_FACTORY_ABI'],
    IUniswapV2Pair: ['uniswap-v2-pair', 'UNISWAP_V2_PAIR_ABI'],
    IUniswapV3Factory: ['uniswap-v3-factory', 'UNISWAP_V3_FACTORY_ABI'],
    IUniswapV3Pool: ['uniswap-v3-pool', 'UNISWAP_V3_POOL_ABI'],
    INonfungiblePositionManager: [
        'nonfungible-position-manager',
        'NONFUNGIBLE_POSITION_MANAGER_ABI',
    ],
    IWETH9: ['weth9', 'WETH9_ABI'],
}

type AbiEntry = { type: string; name?: string }

async function main() {
    await mkdir(ABI_DIR, { recursive: true })

    const generated: string[] = []
    for (const [artifact, [file, constName]] of Object.entries(TARGETS)) {
        const artifactPath = path.join(OUT_DIR, `${artifact}.sol`, `${artifact}.json`)
        let raw: string
        try {
            raw = await readFile(artifactPath, 'utf8')
        } catch {
            throw new Error(`Missing artifact ${artifactPath} — run \`forge build\` first.`)
        }

        const abi = JSON.parse(raw).abi as AbiEntry[]
        if (!Array.isArray(abi) || abi.length === 0) {
            throw new Error(`Artifact ${artifact} has an empty ABI.`)
        }

        const entries = abi.filter((e) => e.type !== 'constructor')

        const body = [
            `export const ${constName} = ${JSON.stringify(entries, null, 4)} as const`,
            ``,
        ].join('\n')

        await writeFile(path.join(ABI_DIR, `${file}.ts`), body)
        generated.push(file)
    }

    await $`${PRETTIER} --write ${ABI_DIR}`.quiet()
    console.log(`Generated ${generated.length} ABIs → packages/sdk/src/abis`)
}

await main()
```

### gen-ponder-types

```ts
import { $ } from 'bun'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { getTableColumns } from 'drizzle-orm'

const ROOT = path.resolve(process.cwd(), '..')
const OUT_FILE = path.join(ROOT, 'packages/sdk/src/ponder/entities.ts')
const PRETTIER = path.join(ROOT, 'packages/sdk/node_modules/.bin/prettier')

const pascal = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

async function main() {
    const schema = (await import(path.join(ROOT, 'indexer/ponder.schema.ts'))) as Record<
        string,
        object
    >

    const lines: string[] = []
    const rootFields: string[] = []

    for (const [tsName, table] of Object.entries(schema)) {
        const columns = getTableColumns(table as never)
        const typeName = pascal(tsName)

        lines.push(`export interface ${typeName} {`)
        for (const [name, col] of Object.entries(columns)) {
            const c = col as { dataType: string; notNull: boolean }
            const base = c.dataType === 'number' ? 'number' : 'string'
            lines.push(`    ${name}: ${base}${c.notNull ? '' : ' | null'}`)
        }
        lines.push(`}`, ``)

        rootFields.push(`    ${tsName}s: '${typeName}'`)
    }

    lines.push(`export interface PonderRootFields {`, ...rootFields, `}`, ``)

    await mkdir(path.dirname(OUT_FILE), { recursive: true })
    await writeFile(OUT_FILE, lines.join('\n'))
    await $`${PRETTIER} --write ${OUT_FILE}`.quiet()
    console.log(
        `Generated ${Object.keys(schema).length} entity types → ${path.relative(ROOT, OUT_FILE)}`
    )
}

await main()
```

Note the name collision: `bun run codegen` from `indexer/` is a _different_
script (`ponder codegen`), still present and unrelated to this skill.
