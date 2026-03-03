import * as target from './preload';
import { expect, describe, it } from 'vitest';

describe('preload', () => {
    it('is defined', () => {
        expect(target).toBeDefined();
    });
});
