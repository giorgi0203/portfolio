import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

export const token = () => randomBytes(32).toString('base64url');
export const identifier = (bytes = 12) =>
  randomBytes(bytes).toString('base64url');
export const digest = (value) =>
  createHash('sha256').update(value).digest('hex');
export class Problem extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
export const fail = (status, message) => {
  throw new Problem(status, message);
};
export function text(value, maximum, label) {
  if (
    typeof value !== 'string' ||
    !value.trim() ||
    value.trim().length > maximum ||
    /[\u0000-\u001f\u007f]/u.test(value)
  )
    fail(400, `${label} must be 1–${maximum} characters.`);
  return value.trim();
}
export function validToken(value) {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{43}$/u.test(value);
}
export function equalHash(expected, value) {
  return (
    validToken(value) &&
    timingSafeEqual(
      Buffer.from(expected, 'hex'),
      Buffer.from(digest(value), 'hex'),
    )
  );
}
