import type { ValidationError } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { flattenValidationErrors, validationException } from '../src/common/validation.exception';

describe('validation error contract', () => {
  it('returns stable field-level details including nested paths', () => {
    const errors = [{ property: 'name', constraints: { isLength: 'name must be longer' } }, { property: 'profile', children: [{ property: 'nickname', constraints: { isString: 'nickname must be a string' } }] }] as ValidationError[];
    expect(flattenValidationErrors(errors)).toEqual([{ field: 'name', messages: ['name must be longer'] }, { field: 'profile.nickname', messages: ['nickname must be a string'] }]);
    expect(validationException(errors)).toMatchObject({ response: { code: 'VALIDATION_ERROR', message: '请求参数校验失败', details: expect.any(Array) }, status: 400 });
  });
});
