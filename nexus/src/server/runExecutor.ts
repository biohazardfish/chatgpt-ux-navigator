import type {Config} from '../config/config.ts';
import {
    createRunDir,
    generateRunId,
    writeRunMeta,
    writeRunPrompt,
    writeRunResponse,
} from '../storage/runs.ts';
import {createServerClient} from './client.ts';
import {ServerClientError} from './errors.ts';

export type ExecuteSessionRunParams = {
    config: Config;
    projectId: string;
    taskId?: string;
    role: string;
    responseId: string;
    prompt: string;
    useTemporaryChat: boolean;
};

export type ExecuteSessionRunResult = {
    runId: string;
    runDir: string;
    responseText: string;
};

export async function executeSessionRun(params: ExecuteSessionRunParams): Promise<ExecuteSessionRunResult> {
    const {config, projectId, taskId, role, responseId, prompt, useTemporaryChat} = params;

    const startedAt = new Date();
    const runId = generateRunId(role, startedAt);
    const runDir = await createRunDir(config, projectId, runId);

    // Failure policy: always create run dir + write prompt before server call.
    await writeRunPrompt(runDir, prompt);

    const client = createServerClient(config);
    try {
        const responseText = useTemporaryChat
            ? await client.postPromptNew({clientId: responseId, input: prompt})
            : await client.postPrompt({clientId: responseId, input: prompt});

        await writeRunResponse(runDir, responseText);

        const completedAt = new Date();
        await writeRunMeta(runDir, {
            runId,
            projectId,
            ...(typeof taskId === 'string' && taskId.trim() ? {taskId} : {}),
            role,
            responseId,
            startedAt: startedAt.toISOString(),
            completedAt: completedAt.toISOString(),
            status: 'success',
        });

        return {runId, runDir, responseText};
    } catch (error) {
        const completedAt = new Date();
        const status = error instanceof ServerClientError && error.kind === 'timeout' ? 'timeout' : 'error';
        const errorString = error instanceof Error ? error.message : String(error);

        // Failure policy: meta.json written last; response.txt must be absent.
        await writeRunMeta(runDir, {
            runId,
            projectId,
            ...(typeof taskId === 'string' && taskId.trim() ? {taskId} : {}),
            role,
            responseId,
            startedAt: startedAt.toISOString(),
            completedAt: completedAt.toISOString(),
            status,
            error: errorString,
        });

        throw error;
    }
}
