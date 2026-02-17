import {buildContextSection} from './story';

export function buildTranslationContextPrompt(story: string, languageName: string): string {
    return `I need a translation context guide for a story that will be translated into ${languageName}.

Create concise but practical guidance that helps produce natural, rich translations while keeping key terms consistent.

Include these sections in markdown:
- Character Names and Preferred Rendering
- Place Names and World Terms
- Honorifics, Titles, and Relationship Terms
- Tone and Voice Guidance
- Style Notes (sentence flow, idioms, register)

Rules:
- Use the target language where appropriate in examples.
- Prioritize readability and natural phrasing over literal translation.
- Keep it compact and directly useful for translators.
- Return only the context guide markdown.

Full story:

${story}`;
}

export function buildTranslationConditioningPrompt(
    languageName: string,
    contextText: string | null
): string {
    return `You are translating markdown story chapters into ${languageName}.

Rules:
1) Translate all normal prose to ${languageName}.
2) Preserve markdown structure and headings.
3) Preserve markdown image lines exactly as-is, e.g. ![Image N](...).
4) Output only the translated chapter markdown and nothing else.

${buildContextSection(contextText)}

Confirm you understand these rules.\n`;
}

export function buildImproveConditioningPrompt(
    languageName: string,
    contextText: string | null
): string {
    return `You are improving already translated markdown story chapters in ${languageName}.

Rules:
1) Keep the language as ${languageName}.
2) Improve natural flow, word choice, and writing style for native readability.
3) Preserve original meaning and chapter structure.
4) Preserve markdown image lines exactly as-is, e.g. ![Image N](...).
5) Output only the improved chapter markdown and nothing else.

${buildContextSection(contextText)}

Confirm you understand these rules.\n`;
}

export function buildImproveChapterPrompt(
    chapterText: string,
    languageName: string
): string {
    return `Improve this chapter in ${languageName} so it reads naturally with polished narrative style.

Remember:
- Keep meaning and structure unchanged.
- Improve fluency, tone consistency, and writing quality.
- Keep markdown image lines ![Image N](...) unchanged.
- Output only the improved chapter markdown.

Chapter:\n\n${chapterText}`;
}
