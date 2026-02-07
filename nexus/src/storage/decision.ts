import {join} from 'node:path';
import {Config} from '../config/config.ts';
import {DECISIONS_DIR, getDateString} from './layout.ts';
import {getNextSequenceId} from './ids.ts';
import {ensureDir} from '../fs/ensureDirs.ts';

export async function appendDecision(
    config: Config,
    projectId: string,
    title: string,
    content: string
): Promise<string> {
    const projectDir = join(config.projectsDir, projectId);
    const decisionsDir = join(projectDir, DECISIONS_DIR);

    await ensureDir(decisionsDir);

    const slug = title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');

    const id = await getNextSequenceId(decisionsDir, '');
    const filename = `${id}-${slug}.md`;
    const filePath = join(decisionsDir, filename);

    const date = getDateString();
    const fileContent = `---
Date: ${date}
Status: accepted
---

# ${title}

${content}
`;

    await Bun.write(filePath, fileContent);

    return filePath;
}
