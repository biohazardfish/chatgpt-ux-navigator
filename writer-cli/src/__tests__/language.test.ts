import {describe, expect, it} from 'bun:test';
import {isSupportedLanguageCode, resolveLanguage} from '../core/language';

describe('language helpers', () => {
    it('resolves supported language', () => {
        expect(resolveLanguage('vi')).toEqual({code: 'vi', name: 'Vietnamese'});
    });

    it('detects supported language codes', () => {
        expect(isSupportedLanguageCode('ja')).toBe(true);
        expect(isSupportedLanguageCode('en')).toBe(false);
    });
});
