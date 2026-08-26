// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { isObjectNotFoundError } from './r2';

describe('R2 object absence handling', () => {
  it('treats an absent object as already deleted', () => {
    expect(isObjectNotFoundError({ name: 'NotFound' })).toBe(true);
    expect(isObjectNotFoundError({ $metadata: { httpStatusCode: 404 } })).toBe(true);
    expect(isObjectNotFoundError({ $metadata: { httpStatusCode: 503 } })).toBe(false);
  });
});
