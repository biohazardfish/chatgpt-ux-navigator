import {describe, it, expect, beforeEach, afterEach, mock} from 'bun:test';
import {handlePostImagesById, handlePostImagesByIdActivate} from '../src/http/routes/images';
import type {AppConfig} from '../src/config/config';
import {setClient} from '../src/ws/hub';
import {inflightTerminate} from '../src/http/responses/inflight';

const config: AppConfig = {
    port: 0,
    promptsDir: '/tmp',
    filesRoot: '/tmp',
    imagesDir: '/tmp/images',
    noStream: false,
    debug: false,
    debugLogFile: '/tmp/server-debug.jsonl',
    requestTimeout: 360,
};

const CLIENT_ID = 'image-client';

describe('POST /images/:client_id', () => {
    beforeEach(() => {
        setClient(CLIENT_ID, null);
        inflightTerminate(CLIENT_ID, null, null);
    });

    afterEach(() => {
        setClient(CLIENT_ID, null);
        inflightTerminate(CLIENT_ID, null, null);
    });

    it('should return 404 if client not connected', async () => {
        const req = new Request(`http://localhost/images/${CLIENT_ID}`, {
            method: 'POST',
            body: JSON.stringify({input: 'Image prompt'}),
        });

        const res = await handlePostImagesById(req, config, new URL(req.url));
        expect(res.status).toBe(404);
    });

    it('should send prompt.image to the client', async () => {
        let parsed: any = null;
        const mockSend = mock((msg: string) => {
            parsed = JSON.parse(msg);
            inflightTerminate(CLIENT_ID, null, null);
        });
        setClient(CLIENT_ID, {send: mockSend} as any);

        const req = new Request(`http://localhost/images/${CLIENT_ID}`, {
            method: 'POST',
            body: JSON.stringify({input: 'Generate a fox'}),
        });

        const res = await handlePostImagesById(req, config, new URL(req.url));
        expect(res.status).toBe(200);
        expect(parsed?.type).toBe('prompt.image');
        expect(parsed?.input).toContain('Generate a fox');
    });

    it('should send image.activate for /activate', async () => {
        let parsed: any = null;
        const mockSend = mock((msg: string) => {
            parsed = JSON.parse(msg);
        });
        setClient(CLIENT_ID, {send: mockSend} as any);

        const req = new Request(`http://localhost/images/${CLIENT_ID}/activate`, {
            method: 'POST',
        });

        const res = await handlePostImagesByIdActivate(req, config, new URL(req.url));
        expect(res.status).toBe(200);
        expect(parsed?.type).toBe('image.activate');
        const body = (await res.json()) as any;
        expect(body.ok).toBe(true);
        expect(body.activated).toBe(true);
        expect(body.client_id).toBe(CLIENT_ID);
    });

    it('should accept /images/:client_id/activate with trailing slash', async () => {
        let parsed: any = null;
        const mockSend = mock((msg: string) => {
            parsed = JSON.parse(msg);
        });
        setClient(CLIENT_ID, {send: mockSend} as any);

        const req = new Request(`http://localhost/images/${CLIENT_ID}/activate/`, {
            method: 'POST',
        });

        const res = await handlePostImagesByIdActivate(req, config, new URL(req.url));
        expect(res.status).toBe(200);
        expect(parsed?.type).toBe('image.activate');
    });

    it('should return 404 for /activate if client not connected', async () => {
        const req = new Request(`http://localhost/images/${CLIENT_ID}/activate`, {
            method: 'POST',
        });

        const res = await handlePostImagesByIdActivate(req, config, new URL(req.url));
        expect(res.status).toBe(404);
    });
});
