import type {LanguageCode} from '../types';

export const SUPPORTED_TRANSLATE_LANGUAGES: Record<LanguageCode, string> = {
    vi: 'Vietnamese',
    ko: 'Korean',
    ja: 'Japanese',
};

export function resolveLanguage(language: string): {code: LanguageCode; name: string} {
    const code = language.toLowerCase() as LanguageCode;
    const name = SUPPORTED_TRANSLATE_LANGUAGES[code];

    if (!name) {
        throw new Error(
            `Unsupported --language '${language}'. Supported ISO 639 codes: ${Object.keys(SUPPORTED_TRANSLATE_LANGUAGES).join(', ')}`
        );
    }

    return {code, name};
}

export function isSupportedLanguageCode(language: string): boolean {
    return Object.prototype.hasOwnProperty.call(SUPPORTED_TRANSLATE_LANGUAGES, language);
}
