#!/usr/bin/env bun

import {parseArgs} from './args';
import {commandRegistry} from './commands';
import {getConfig, SUBCOMMANDS, usage} from './config';
import {isSupportedLanguageCode} from './core/language';
import type {CommandName, CommandContext} from './types';

function printErrorAndExit(scriptName: string, message: string): never {
    console.error(`[${scriptName}] ${message}`);
    console.error(usage());
    process.exit(1);
}

function validateArgs(parsed: ReturnType<typeof parseArgs>, ctx: CommandContext): CommandName {
    if (!parsed.command || !SUBCOMMANDS.has(parsed.command)) {
        printErrorAndExit(ctx.config.scriptName, 'Missing or invalid command');
    }

    if (!parsed.runDir) {
        printErrorAndExit(ctx.config.scriptName, 'Missing --run <run_folder_path>');
    }

    if (
        (parsed.command === 'translate-chapters' || parsed.command === 'translation-context') &&
        !parsed.language
    ) {
        printErrorAndExit(
            ctx.config.scriptName,
            `Missing --language <language_code> for ${parsed.command}`
        );
    }

    if (
        (parsed.command === 'translate-chapters' ||
            parsed.command === 'translation-context' ||
            parsed.command === 'story-summary') &&
        parsed.language &&
        !isSupportedLanguageCode(parsed.language)
    ) {
        console.error(
            `[${ctx.config.scriptName}] Unsupported language '${parsed.language}'. Supported ISO 639 codes: vi, ko, ja`
        );
        process.exit(1);
    }

    return parsed.command as CommandName;
}

async function main(): Promise<void> {
    const ctx: CommandContext = {config: getConfig()};
    const parsed = parseArgs(process.argv.slice(2));

    if (parsed.showHelp) {
        console.log(usage());
        process.exit(0);
    }

    const command = validateArgs(parsed, ctx);
    await commandRegistry[command](ctx, {
        runDir: String(parsed.runDir),
        language: parsed.language,
        improve: parsed.improve,
        contextFile: parsed.contextFile,
    });
}

main().catch(err => {
    const scriptName = getConfig().scriptName;
    console.error(`[${scriptName}] ${err?.stack ?? String(err)}`);
    process.exit(1);
});
