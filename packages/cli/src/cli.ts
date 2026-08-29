#!/usr/bin/env node
import { parseArgs } from 'node:util'
import { UsageError } from './args.js'
import { COMMANDS } from './commands.js'
import { formatJson } from './format.js'
import { helpText, signature } from './help.js'
import { render } from './render.js'

const OPTIONS = {
    chainId: { type: 'string' },
    dexId: { type: 'string' },
    protocolType: { type: 'string' },
    protocol: { type: 'string' },
    users: { type: 'string' },
    owner: { type: 'string' },
    tokenIds: { type: 'string' },
    referrer: { type: 'string' },
    tokenAddr: { type: 'string' },
    tokenAddrs: { type: 'string' },
    tokenIn: { type: 'string' },
    tokenOut: { type: 'string' },
    amountIn: { type: 'string' },
    rpcUrl: { type: 'string' },
    creator: { type: 'string' },
    address: { type: 'string' },
    isGraduated: { type: 'string' },
    fields: { type: 'string' },
    orderBy: { type: 'string' },
    orderDirection: { type: 'string' },
    limit: { type: 'string' },
    ponderUrl: { type: 'string' },
    json: { type: 'boolean', default: false },
    help: { type: 'boolean', short: 'h', default: false },
} as const

async function main(): Promise<number> {
    let parsed: ReturnType<typeof parseArgs<{ options: typeof OPTIONS; allowPositionals: true }>>
    try {
        parsed = parseArgs({ options: OPTIONS, allowPositionals: true, strict: true })
    } catch (error) {
        process.stderr.write(`${(error as Error).message}\n`)
        return 1
    }

    const { values, positionals } = parsed
    const [name, ...rest] = positionals

    if (name === undefined) {
        if (values.help) {
            process.stdout.write(`${helpText()}\n`)
            return 0
        }
        process.stderr.write(`${helpText()}\n`)
        return 1
    }

    const command = COMMANDS[name]
    if (!command) {
        process.stderr.write(`unknown command "${name}", run juno-moneta --help for the list\n`)
        return 1
    }

    if (rest.length > 0) {
        process.stderr.write(`unexpected argument "${rest[0]}"\n`)
        return 1
    }

    if (values.help) {
        process.stdout.write(`${signature(name, command)}\n  ${command.describe}\n`)
        return 0
    }

    try {
        const result = await command.run(values)
        process.stdout.write(`${values.json ? formatJson(result) : render(result)}\n`)
        return 0
    } catch (error) {
        if (error instanceof UsageError) {
            process.stderr.write(`${error.message}\n`)
            return 1
        }
        throw error
    }
}

main().then(
    (code) => {
        process.exitCode = code
    },
    (error) => {
        process.stderr.write(`${(error as Error).message}\n`)
        process.exitCode = 1
    }
)
