export type CommandName =
    | 'clean'
    | 'story-summary'
    | 'image-prompt-chapters'
    | 'image-precondition'
    | 'image-gen-chapters'
    | 'translation-context'
    | 'translate-chapters';

export type ParsedArgs = {
    command: string | null;
    runDir: string | null;
    language: string | null;
    improve: boolean;
    contextFile: string | null;
    showHelp: boolean;
};

export type ApiMessage = {role: 'user'; content: string};
export type ApiRequest = {input: ApiMessage[]};

export type LanguageCode = 'vi' | 'ko' | 'ja';

export type RunPaths = {
    runDir: string;
    messagesDir: string;
    processedDir: string;
    imagesDir: string;
    storySummaryPath: string;
    preconditionPath: string;
};

export type SimplePromptBlock = {
    start: number;
};

export type ImagePromptBlock = {
    prompt: string;
    start: number;
    end: number;
    index: number;
};

export type Endpoints = {
    imagePromptUrl: string;
    activateUrl: string;
    newChatUrl: string;
    clientId: string;
};

export type WriterCliConfig = {
    scriptName: string;
    serverUrl: string;
    writerClientId: string;
    imageClientId: string;
    timeouts: {
        storySummaryMs: number;
        translationContextMs: number;
        imageGenPreconditionMs: number;
        chapterTranslatorMs: number;
        imageGenMs: number;
        imagePrompterMs: number;
        conditioningMs: number;
    };
};

export type CommandContext = {
    config: WriterCliConfig;
};
