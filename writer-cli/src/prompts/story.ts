import {basename} from 'node:path';

const STORY_SUMMARY_PROMPT = `Create 5 distinct title-and-summary options for this story.

Goal:
- Hook the reader immediately.
- Highlight the central conflict, tone, and stakes.
- Keep key twists and ending hidden.

For each option:
- Title should be concise and compelling.
- Summary should be 2 to 4 sentences.
- Style should be vivid and cinematic, but concise.
- No spoilers.

Output format (markdown only):
## Option 1
### <title>

<summary>

## Option 2
### <title>

<summary>

...

## Option 5
### <title>

<summary>

Rules:
- Return only these 5 options in the markdown format above.
- Do not include extra explanation, notes, or meta commentary.

Full story:
`;

export function buildStorySection(files: string[], fileContents: string[]): string {
    const sections: string[] = [];

    for (let i = 0; i < files.length; i += 1) {
        const heading = `# ${basename(files[i])}`;
        const body = fileContents[i].trim();
        sections.push(`${heading}\n\n${body}`);
    }

    return sections.join('\n\n---\n\n');
}

export function buildContextSection(contextText: string | null): string {
    if (!contextText) {
        return '';
    }

    return `
Context guidance (suggestion, not strict rules):
- Use this context to improve name consistency, terminology, and style.
- Prioritize natural, rich prose in the target language.
- Adapt context choices when needed for fluency.

Context:
${contextText}
`;
}

export function buildStorySummaryPrompt(story: string): string {
    return STORY_SUMMARY_PROMPT + '\n\n' + story;
}

export function buildStorySummaryTranslationPrompt(
    summary: string,
    languageName: string,
    contextText: string | null
): string {
    return `Translate the 5 markdown options below into ${languageName}.

Goals:
- Keep the same meaning and impact.
- Keep each option concise and compelling.
- Keep the markdown structure exactly:
  - Each option starts with "## Option <N>"
  - Each title line starts with "### "
- Translate both titles and summaries.
- Keep each summary at 2 to 4 sentences.
- Return only the translated options markdown.

${buildContextSection(contextText)}

Options:
${summary}`;
}

export function buildStorySummaryImprovePrompt(
    summary: string,
    languageName: string,
    contextText: string | null
): string {
    return `Improve these translated 5 markdown options in ${languageName}.

Goals:
- Keep the original meaning and stakes for each option.
- Make the writing feel natural, vivid, and fluent for native readers.
- Keep the markdown structure exactly:
  - Each option starts with "## Option <N>"
  - Each title line starts with "### "
- Keep each summary at 2 to 4 sentences.
- Return only the improved options markdown.

${buildContextSection(contextText)}

Options:
${summary}`;
}
