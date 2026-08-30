import { CHAIN_SLUGS } from './args.js'
import { COMMANDS, type Command } from './commands.js'

const WRAP_WIDTH = 96

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

    const hang = ' '.repeat(indent + name.length + 1)
    const lines: string[] = []
    let line = name
    let offset = indent
    for (const group of flagGroups(command.flags)) {
        const candidate = `${line} ${group}`
        if (line === name || offset + candidate.length <= WRAP_WIDTH) {
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
    const groups = new Map<string, string[]>()
    for (const [name, command] of Object.entries(COMMANDS)) {
        const lines = groups.get(command.group) ?? []
        lines.push(`  ${signature(name, command, 2)}\n      ${command.describe}`)
        groups.set(command.group, lines)
    }

    return [
        'Usage: juno-moneta <command> [flags]',
        '',
        'Every command mirrors one export of the SDK.',
        `Chains: ${CHAIN_SLUGS.join(', ')}`,
        'Indexer commands read $JUNO_MONETA_PONDER_URL unless --ponderUrl is passed.',
        '',
        'Global flags:',
        '  --json      print raw JSON instead of formatted output',
        '  -h, --help  show this help',
        '',
        ...[...groups].map(([group, lines]) => `${group}\n${lines.join('\n')}\n`),
    ].join('\n')
}
