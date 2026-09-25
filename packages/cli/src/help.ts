import { CHAIN_SLUGS } from './args.js'
import { COMMANDS, type Command } from './commands.js'

const WRAP_WIDTH = 96

export function signature(name: string, command: Command, indent = 0): string {
    const width = Math.min(process.stdout.columns || WRAP_WIDTH, WRAP_WIDTH)
    const hang = ' '.repeat(indent + name.length + 1)
    const [first, ...rest] = command.flags
    const lines = [`${' '.repeat(indent)}${name} ${first}`]
    for (const flag of rest) {
        const last = lines.length - 1
        if (lines[last]!.length + flag.length + 1 <= width) lines[last] += ` ${flag}`
        else lines.push(hang + flag)
    }
    return lines.join('\n')
}

export function helpText(): string {
    const commands = Object.entries(COMMANDS).map(
        ([name, command]) => `${signature(name, command, 2)}\n      ${command.describe}`
    )

    return [
        'Usage: juno-moneta <command> [flags]',
        '',
        `Chains: ${CHAIN_SLUGS.join(', ')}`,
        '',
        'Global flags:',
        '  --json      print raw JSON instead of formatted output',
        '  -h, --help  show this help',
        '',
        ...commands,
        '',
    ].join('\n')
}
