#!/usr/bin/env node
import { parseArgs } from 'node:util'
import { UsageError } from './args.js'
import { COMMANDS } from './commands.js'
import { format } from './format.js'
import { helpText, signature } from './help.js'

const OPTIONS = {
    chainId: { type: 'string' },
    dexId: { type: 'string' },
    protocolType: { type: 'string' },
    users: { type: 'string' },
    referrer: { type: 'string' },
    ponderUrl: { type: 'string' },
    raw: { type: 'boolean', default: false },
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
        process.stderr.write(`unknown command "${name}", run junoswap --help for the list\n`)
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
        process.stdout.write(`${format(await command.run(values), values.raw)}\n`)
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
