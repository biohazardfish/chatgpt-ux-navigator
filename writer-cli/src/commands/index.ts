import {runClean} from './clean';
import {runImageGenChapters} from './imageGenChapters';
import {runImagePrecondition} from './imagePrecondition';
import {runImagePromptChapters} from './imagePromptChapters';
import {runStorySummary} from './storySummary';
import {runTranslateChapters} from './translateChapters';
import {runTranslationContext} from './translationContext';
import type {CommandContext, CommandName} from '../types';

export type CommandRunner = (
    ctx: CommandContext,
    options: {
        runDir: string;
        language: string | null;
        improve: boolean;
        contextFile: string | null;
    }
) => Promise<void>;

export const commandRegistry: Record<CommandName, CommandRunner> = {
    clean: async (ctx, options) => runClean(ctx, options.runDir),
    'image-prompt-chapters': async (ctx, options) => runImagePromptChapters(ctx, options.runDir),
    'story-summary': async (ctx, options) =>
        runStorySummary(ctx, options.runDir, options.language, options.contextFile),
    'image-precondition': async (ctx, options) => runImagePrecondition(ctx, options.runDir),
    'translation-context': async (ctx, options) =>
        runTranslationContext(ctx, options.runDir, String(options.language)),
    'translate-chapters': async (ctx, options) =>
        runTranslateChapters(
            ctx,
            options.runDir,
            String(options.language),
            options.improve,
            options.contextFile
        ),
    'image-gen-chapters': async (ctx, options) => runImageGenChapters(ctx, options.runDir),
};
