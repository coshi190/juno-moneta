import { CHAIN_SLUGS } from './args.js'
import { COMMANDS, type Command } from './commands.js'

export function signature(name: string, command: Command): string {
    return command.flags ? `${name} ${command.flags}` : name
}

export function helpText(): string {
    const groups = new Map<string, string[]>()
    for (const [name, command] of Object.entries(COMMANDS)) {
        const lines = groups.get(command.group) ?? []
        lines.push(`  ${signature(name, command)}\n      ${command.describe}`)
        groups.set(command.group, lines)
    }

    return [
        'Usage: junoswap <command> [flags]',
        '',
        'Every command mirrors one export of the SDK.',
        '',
        'Flags:',
        `  --chainId <id|slug>     chain id or slug (${CHAIN_SLUGS.join(', ')})`,
        '  --dexId <dex>           dex id, defaults to junoswap',
        '  --protocolType v2|v3    protocol to select',
        '  --users <addr,addr>     comma-separated user addresses',
        '  --referrer <addr>       referrer address',
        '  --limit <n>             max rows to return',
        '  --ponderUrl <url>       indexer graphql endpoint, defaults to $JUNOSWAP_PONDER_URL',
        '  --raw                   print scalar results unquoted',
        '  -h, --help              show this help',
        '',
        ...[...groups].map(([group, lines]) => `${group}\n${lines.join('\n')}\n`),
    ].join('\n')
}
