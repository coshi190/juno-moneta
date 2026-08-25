# Rules

- this codebase carries **no comments**. Never write `//`, `///`, `/* */`, `/** */`, JSDoc,
  NatSpec, or docstrings in `.ts`, `.tsx`, or `.sol` files, The only exceptions: `// SPDX-License-Identifier:` on line 1 of every `.sol` file. and `contracts/src/interfaces/**` — verbatim vendored Uniswap sources, kept byte-identical to upstream. Do not strip or reformat them (`forge fmt` must be scoped to `test script`).
- After editing contracts in `contracts/src/`, regenerate the ABIs via the `codegen` skill (`.claude/skills/codegen/`) before touching indexer/SDK code that consumes them. Nothing in CI catches stale ABIs, so this ordering is on you.
- The SDK is versioned and published (see `packages/sdk/package.json`); bump its version when making a released change to its public API. Publishing is manual: `npm publish` from `packages/sdk`, to the public npm registry. There is no publish workflow.
