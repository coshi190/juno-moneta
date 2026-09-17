#!/usr/bin/env node
import { parseArgs } from 'node:util'
import { COMMANDS, OPTIONS } from './commands.js'
import { helpText, signature } from './help.js'
import { formatJson, render } from './output.js'

async function main(): Promise<number> {
    const { values, positionals } = parseArgs({
        options: OPTIONS,
        allowPositionals: true,
        strict: true,
    })
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

    const result = await command.run(values)
    process.stdout.write(`${values.json ? formatJson(result) : render(result)}\n`)
    return 0
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
