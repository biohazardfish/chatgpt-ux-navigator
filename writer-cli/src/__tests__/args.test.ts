import {describe, expect, it} from 'bun:test';
import {parseArgs} from '../args';

describe('parseArgs', () => {
    it('parses command with run and language', () => {
        const parsed = parseArgs(['translate-chapters', '--run', './runs/x', '--language', 'vi']);
        expect(parsed.command).toBe('translate-chapters');
        expect(parsed.runDir).toBe('./runs/x');
        expect(parsed.language).toBe('vi');
        expect(parsed.improve).toBe(false);
    });

    it('parses equals options and improve flag', () => {
        const parsed = parseArgs([
            'translate-chapters',
            '--run=./runs/x',
            '--language=ko',
            '--improve',
            '--context=./ctx.md',
        ]);
        expect(parsed.runDir).toBe('./runs/x');
        expect(parsed.language).toBe('ko');
        expect(parsed.improve).toBe(true);
        expect(parsed.contextFile).toBe('./ctx.md');
    });

    it('throws on unknown option', () => {
        expect(() => parseArgs(['clean', '--wat'])).toThrow('Unknown option: --wat');
    });
});
