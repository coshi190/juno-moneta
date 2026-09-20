import { CHAIN_SLUGS } from './args.js'
import { COMMANDS, type Command } from './commands.js'

const WRAP_WIDTH = 96
const FALLBACK_WIDTH = 120

function terminalWidth(): number {
    if (process.stdout.isTTY !== true) return Number.POSITIVE_INFINITY
    return process.stdout.columns ?? FALLBACK_WIDTH
}

function flagGroups(flags: string): string[] {
    const groups: string[] = []
    for (const token of flags.split(' ')) {
        const previous = groups.length - 1
        if (previous >= 0 && !token.startsWith('--') && !token.startsWith('[')) {
            groups[previous] += ` ${token}`
        } else {
            groups.push(token)
        }
    }
    return groups
}

export function signature(name: string, command: Command, indent = 0): string {
    if (!command.flags) return name

    const wrap = Math.min(terminalWidth(), WRAP_WIDTH)
    const hang = ' '.repeat(indent + name.length + 1)
    const lines: string[] = []
    let line = name
    let offset = indent
    for (const group of flagGroups(command.flags)) {
        const candidate = `${line} ${group}`
        if (line === name || offset + candidate.length <= wrap) {
            line = candidate
            continue
        }
        lines.push(line)
        line = hang + group
        offset = 0
    }
    lines.push(line)
    return lines.join('\n')
}

export function helpText(): string {
    const commands = Object.entries(COMMANDS).map(
        ([name, command]) => `  ${signature(name, command, 2)}\n      ${command.describe}`
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
