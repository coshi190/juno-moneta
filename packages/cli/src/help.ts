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
        '  --protocol <name>       indexer pool protocol, defaults to junoswap',
        '  --users <addr,addr>     comma-separated user addresses',
        '  --owner <addr>          position owner address',
        '  --tokenIds <id,id>      comma-separated position token ids',
        '  --referrer <addr>       referrer address',
        '  --tokenAddr <addr>      token address',
        '  --tokenAddrs <a,a>      comma-separated token addresses',
        '  --creator <addr>        launch token creator address',
        '  --address <addr>        token holder address',
        '  --isGraduated 0|1       graduation state to filter on',
        '  --fields <preset|list>  field preset or comma-separated field names',
        '  --orderBy <field>       field to sort on',
        '  --orderDirection <dir>  asc or desc, defaults to asc',
        '  --limit <n>             max rows to return',
        '  --ponderUrl <url>       indexer graphql endpoint, defaults to $JUNOSWAP_PONDER_URL',
        '  --json                  print raw JSON instead of formatted output',
        '  -h, --help              show this help',
        '',
        ...[...groups].map(([group, lines]) => `${group}\n${lines.join('\n')}\n`),
    ].join('\n')
}
