import {describe, expect, it} from 'bun:test';
import {
    cleanChapter,
    extractImagePromptBlocks,
    hasImageMarkerBefore,
    insertImageMarkerBeforeBlock,
    normalizeOutput,
} from '../core/markdown';

describe('markdown helpers', () => {
    it('cleans chapter frontmatter and continuity section', () => {
        const input = `---
title: x
---

# Chapter 1/3: Start
Body.

## Continuity and Next Hooks
Notes.
`;
        const output = cleanChapter(input);
        expect(output).toContain('## CHAPTER 1/3: Start');
        expect(output).not.toContain('Continuity and Next Hooks');
    });

    it('inserts image marker before prompt block', () => {
        const input = `Text\n\n\`\`\`image_prompt\nA forest\n\`\`\``;
        const block = extractImagePromptBlocks(input)[0];
        const output = insertImageMarkerBeforeBlock(input, block, 'images/a.png');
        const updatedBlock = extractImagePromptBlocks(output)[0];
        expect(output).toContain('![Image 1](images/a.png)');
        expect(hasImageMarkerBefore(output, updatedBlock.start)).toBe(true);
    });

    it('removes image_prompt blocks during normalization', () => {
        const input = `Hi\n\n\`\`\`image_prompt\na\n\`\`\`\n\nBye`;
        const output = normalizeOutput(input);
        expect(output).toContain('Hi');
        expect(output).toContain('Bye');
        expect(output).not.toContain('image_prompt');
    });

    it('keeps image markers while removing image_prompt blocks', () => {
        const input = `![Image 1](images/a.png)\n\n\`\`\`image_prompt\nA misty forest\n\`\`\`\n\nBody`;
        const output = normalizeOutput(input);
        expect(output).toContain('![Image 1](images/a.png)');
        expect(output).toContain('Body');
        expect(output).not.toContain('A misty forest');
        expect(output).not.toContain('image_prompt');
    });
});
