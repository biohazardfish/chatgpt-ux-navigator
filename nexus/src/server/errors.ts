export type ServerClientErrorKind =
    | 'http_error'
    | 'server_error'
    | 'timeout'
    | 'network'
    | 'invalid_response';

export interface ServerClientErrorOptions {
    kind: ServerClientErrorKind;
    url: string;
    status?: number;
    bodySnippet?: string;
    cause?: unknown;
}

export class ServerClientError extends Error {
    readonly kind: ServerClientErrorKind;
    readonly url: string;
    readonly status?: number;
    readonly bodySnippet?: string;

    constructor(message: string, options: ServerClientErrorOptions) {
        super(message);
        this.name = 'ServerClientError';
        this.kind = options.kind;
        this.url = options.url;
        this.status = options.status;
        this.bodySnippet = options.bodySnippet;
        this.cause = options.cause;
        Object.setPrototypeOf(this, new.target.prototype);
    }
}
