import {describe, expect, it} from 'bun:test';
import {
    buildImproveChapterPrompt,
    buildImproveConditioningPrompt,
} from '../prompts/translation';

describe('translation prompts', () => {
    it('includes context only in improve conditioning prompt', () => {
        const contextText = 'Character: Linh -> Lin';
        const conditioningPrompt = buildImproveConditioningPrompt('Vietnamese', contextText);

        expect(conditioningPrompt).toContain('Context guidance');
        expect(conditioningPrompt).toContain(contextText);
    });

    it('does not include context in improve chapter prompt', () => {
        const chapterPrompt = buildImproveChapterPrompt('Chapter body', 'Vietnamese');

        expect(chapterPrompt).toContain('Chapter body');
        expect(chapterPrompt).not.toContain('Context guidance');
        expect(chapterPrompt).not.toContain('Use context as a suggestion');
    });
});
