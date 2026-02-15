import type {ParsedArgs} from './types';

export function parseArgs(argv: string[]): ParsedArgs {
    let command: string | null = null;
    let runDir: string | null = null;
    let language: string | null = null;
    let improve = false;
    let contextFile: string | null = null;
    let showHelp = false;

    for (let i = 0; i < argv.length; i += 1) {
        const arg = argv[i];

        if (arg === '--help' || arg === '-h') {
            showHelp = true;
            continue;
        }

        if (arg === '--run') {
            const next = argv[i + 1];
            if (!next || next.startsWith('-')) {
                throw new Error('Missing value for --run');
            }
            runDir = next;
            i += 1;
            continue;
        }

        if (arg.startsWith('--run=')) {
            const value = arg.slice('--run='.length).trim();
            if (!value) {
                throw new Error('Missing value for --run');
            }
            runDir = value;
            continue;
        }

        if (arg === '--language') {
            const next = argv[i + 1];
            if (!next || next.startsWith('-')) {
                throw new Error('Missing value for --language');
            }
            language = next;
            i += 1;
            continue;
        }

        if (arg.startsWith('--language=')) {
            const value = arg.slice('--language='.length).trim();
            if (!value) {
                throw new Error('Missing value for --language');
            }
            language = value;
            continue;
        }

        if (arg === '--improve') {
            improve = true;
            continue;
        }

        if (arg === '--context') {
            const next = argv[i + 1];
            if (!next || next.startsWith('-')) {
                throw new Error('Missing value for --context');
            }
            contextFile = next;
            i += 1;
            continue;
        }

        if (arg.startsWith('--context=')) {
            const value = arg.slice('--context='.length).trim();
            if (!value) {
                throw new Error('Missing value for --context');
            }
            contextFile = value;
            continue;
        }

        if (arg.startsWith('-')) {
            throw new Error(`Unknown option: ${arg}`);
        }

        if (command) {
            throw new Error(`Unexpected argument: ${arg}`);
        }

        command = arg;
    }

    return {
        command,
        runDir,
        language: language?.toLowerCase() ?? null,
        improve,
        contextFile,
        showHelp,
    };
}
