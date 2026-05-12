import { describe, expect, it } from 'vitest';
import { LoginInputSchema, MfaInputSchema } from '../lib/auth/schemas.js';

describe('LoginInputSchema', () => {
  it('accepts a well-formed email + password', () => {
    const result = LoginInputSchema.safeParse({
      email: 'jeff@example.com',
      password: 'a-very-long-secure-password',
    });
    expect(result.success).toBe(true);
  });

  it('rejects malformed email', () => {
    const result = LoginInputSchema.safeParse({ email: 'not-an-email', password: 'x' });
    expect(result.success).toBe(false);
  });

  it('rejects email over RFC 5321 cap', () => {
    const longLocal = 'a'.repeat(310);
    const result = LoginInputSchema.safeParse({
      email: `${longLocal}@example.com`,
      password: 'x',
    });
    expect(result.success).toBe(false);
  });

  it('rejects empty password', () => {
    const result = LoginInputSchema.safeParse({ email: 'jeff@example.com', password: '' });
    expect(result.success).toBe(false);
  });
});

describe('MfaInputSchema', () => {
  it('accepts a 6-digit numeric code', () => {
    const result = MfaInputSchema.safeParse({ session: 'sess', code: '123456' });
    expect(result.success).toBe(true);
  });

  it('rejects a 5-digit code', () => {
    const result = MfaInputSchema.safeParse({ session: 'sess', code: '12345' });
    expect(result.success).toBe(false);
  });

  it('rejects a 7-digit code', () => {
    const result = MfaInputSchema.safeParse({ session: 'sess', code: '1234567' });
    expect(result.success).toBe(false);
  });

  it('rejects alphabetic content', () => {
    const result = MfaInputSchema.safeParse({ session: 'sess', code: '12345a' });
    expect(result.success).toBe(false);
  });

  it('rejects empty session', () => {
    const result = MfaInputSchema.safeParse({ session: '', code: '123456' });
    expect(result.success).toBe(false);
  });
});
