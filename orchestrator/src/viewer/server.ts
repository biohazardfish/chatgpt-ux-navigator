import {join, resolve} from 'path';
import {loadRunArtifacts} from './loadRunArtifacts';
import {assertRunsRootDirectory, listRuns, resolveRunDirectory} from './listRuns';

type StartViewerParams = {
    runsRoot: string;
    port?: number;
};

export async function startViewer(params: StartViewerParams): Promise<Bun.Server> {
    const runsRoot = resolve(params.runsRoot);
    const port = params.port ?? 8787;
    const publicDir = join(import.meta.dir, 'public');

    await assertRunsRootDirectory(runsRoot);

    const server = Bun.serve({
        hostname: '127.0.0.1',
        port,
        async fetch(request) {
            const url = new URL(request.url);

            if (url.pathname === '/api/runs') {
                try {
                    const runs = await listRuns(runsRoot);
                    return Response.json({
                        runs_root: runsRoot,
                        runs,
                    });
                } catch (error) {
                    return Response.json(
                        {
                            error: error instanceof Error ? error.message : String(error),
                        },
                        {status: 500}
                    );
                }
            }

            if (url.pathname === '/api/run') {
                try {
                    const runFolder = url.searchParams.get('run');
                    if (!runFolder) {
                        return Response.json(
                            {error: 'Missing required query parameter: run'},
                            {status: 400}
                        );
                    }

                    let runDir: string;
                    try {
                        runDir = resolveRunDirectory(runsRoot, runFolder);
                    } catch (error) {
                        return Response.json(
                            {
                                error: error instanceof Error ? error.message : String(error),
                            },
                            {status: 400}
                        );
                    }

                    const data = await loadRunArtifacts(runDir);
                    return Response.json(data);
                } catch (error) {
                    return Response.json(
                        {
                            error: error instanceof Error ? error.message : String(error),
                        },
                        {status: 404}
                    );
                }
            }

            if (url.pathname === '/' || url.pathname === '/index.html') {
                return new Response(Bun.file(join(publicDir, 'index.html')));
            }

            if (url.pathname === '/app.js') {
                return new Response(Bun.file(join(publicDir, 'app.js')), {
                    headers: {
                        'content-type': 'application/javascript; charset=utf-8',
                    },
                });
            }

            if (url.pathname === '/viewer.css') {
                return new Response(Bun.file(join(publicDir, 'viewer.css')), {
                    headers: {
                        'content-type': 'text/css; charset=utf-8',
                    },
                });
            }

            return new Response('Not Found', {status: 404});
        },
    });

    console.log('👀 Viewer server started');
    console.log(`📁 Runs root: ${runsRoot}`);
    console.log(`🌐 Open: http://127.0.0.1:${port}/?view=overview`);
    console.log('   Selected view is kept in query params.');

    return server;
}
