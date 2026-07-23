import { HttpStatus, type ValidationError } from '@nestjs/common';
import { AppException } from './app-exception';

export type ValidationIssue = { field: string; messages: string[] };

export function validationException(errors: ValidationError[]) {
  return new AppException('VALIDATION_ERROR', '请求参数校验失败', HttpStatus.BAD_REQUEST, flattenValidationErrors(errors));
}

export function flattenValidationErrors(errors: ValidationError[], parent = ''): ValidationIssue[] {
  return errors.flatMap((error) => {
    const field = parent ? `${parent}.${error.property}` : error.property;
    const own = error.constraints ? [{ field, messages: Object.values(error.constraints) }] : [];
    return [...own, ...flattenValidationErrors(error.children ?? [], field)];
  });
}
