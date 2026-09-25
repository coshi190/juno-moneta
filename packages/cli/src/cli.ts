#!/usr/bin/env node
import { parseArgs } from 'node:util'
import { COMMANDS, OPTIONS } from './commands.js'
import { helpText, signature } from './help.js'
import { formatJson, render } from './output.js'

async function main(): Promise<string> {
    const { values, positionals } = parseArgs({ options: OPTIONS, allowPositionals: true })
    const [name, extra] = positionals
    if (name === undefined) {
        if (values.help) return helpText()
        throw new Error(helpText())
    }
    const command = COMMANDS[name]
    if (!command) throw new Error(`unknown command "${name}", run juno-moneta --help for the list`)
    if (extra !== undefined) throw new Error(`unexpected argument "${extra}"`)
    if (values.help) return `${signature(name, command)}\n  ${command.describe}`
    const result = await command.run(values)
    return values.json ? formatJson(result) : render(result)
}

main().then(
    (output) => process.stdout.write(`${output}\n`),
    (error) => {
        process.stderr.write(`${(error as Error).message}\n`)
        process.exitCode = 1
    }
)
