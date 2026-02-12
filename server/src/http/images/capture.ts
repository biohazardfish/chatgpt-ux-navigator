import {mkdir} from 'node:fs/promises';
import {extname, join} from 'node:path';

function sanitizeClientId(clientId: string) {
    return clientId.replace(/[^a-zA-Z0-9_-]+/g, '-');
}

function extensionFromContentType(contentType: string | null | undefined): string {
    const ct = String(contentType || '').toLowerCase();
    if (ct.includes('image/png')) return '.png';
    if (ct.includes('image/jpeg')) return '.jpg';
    if (ct.includes('image/webp')) return '.webp';
    if (ct.includes('image/gif')) return '.gif';
    return '.png';
}

async function ensureImagesDir(imagesDir: string): Promise<string> {
    await mkdir(imagesDir, {recursive: true});
    return imagesDir;
}

type SaveImagePayload = {
    imagesDir: string;
    clientId: string;
    dataBase64: string;
    mimeType?: string | null;
    fileName?: string | null;
    fileId?: string | null;
};

export async function saveGeneratedImage(payload: SaveImagePayload): Promise<string> {
    const {imagesDir, clientId, dataBase64, mimeType, fileName, fileId} = payload;

    if (!dataBase64 || typeof dataBase64 !== 'string') {
        throw new Error('Missing image payload');
    }

    const dir = await ensureImagesDir(imagesDir);
    const safeClient = sanitizeClientId(clientId);
    const ts = Date.now();
    const extFromName = fileName ? extname(fileName) : '';
    const ext = extFromName || extensionFromContentType(mimeType);
    const safeFileId = fileId ? `-${fileId.replace(/[^a-zA-Z0-9_-]+/g, '')}` : '';
    const filePath = join(dir, `${safeClient}-${ts}${safeFileId}${ext}`);

    const bytes = Buffer.from(dataBase64, 'base64');
    await Bun.write(filePath, bytes);
    return filePath;
}
