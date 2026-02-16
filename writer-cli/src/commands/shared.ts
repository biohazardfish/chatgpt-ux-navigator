import {resolve} from 'node:path';
import {postResponsesNewThread} from '../core/http';
import {buildStorySection, buildStorySummaryPrompt} from '../prompts/story';
import type {CommandContext} from '../types';

export async function generateStorySummaryFromFiles(
    ctx: CommandContext,
    files: string[]
): Promise<string> {
    const resolvedFiles = files.map(file => resolve(file));
    const fileContents = await Promise.all(resolvedFiles.map(file => Bun.file(file).text()));
    const story = buildStorySection(resolvedFiles, fileContents);
    const requestPrompt = buildStorySummaryPrompt(story);
    return postResponsesNewThread(
        ctx.config.serverUrl,
        [{role: 'user', content: requestPrompt}],
        ctx.config.writerClientId,
        ctx.config.timeouts.storySummaryMs
    );
}
