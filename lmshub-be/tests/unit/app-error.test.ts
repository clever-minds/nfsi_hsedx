import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import { AppError } from '../../src/core/http/AppError';

/**
 * Guards for the error contract.
 *
 * Every API error carries an English `message` and a translation `key`. The
 * frontend prefers the key so a reader sees their own language, and falls back
 * to `message` when no translation exists — which only works if `message` is
 * English. Error text used to be written in Indonesian and shown verbatim, so
 * an English-speaking buyer got Indonesian pop-ups.
 */

const SRC = path.resolve(__dirname, '../../src');

function tsFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) return tsFiles(full);
    return full.endsWith('.ts') ? [full] : [];
  });
}

/**
 * `AppError.notFound('Course not found', 'course.not_found')` — and the same
 * call written with a template literal.
 *
 * Backticks are not a stylistic detail here. An earlier version of this pattern
 * matched single quotes only, so nine Indonesian messages built by interpolation
 * — `Kursus ${id} tidak ditemukan` and friends — were invisible to every check
 * below while the suite reported green. Any message form that reaches a user has
 * to be a form this regex can see.
 */
const CALL =
  /AppError\.(badRequest|unauthorized|forbidden|notFound|conflict|unprocessable|internal)\(\s*(?:'((?:[^'\\]|\\.)*)'|`((?:[^`\\]|\\.)*)`)\s*(?:,\s*(?:'([a-z0-9_.]+)'|`([a-z0-9_.${}]+)`))?/g;

/** `throw new Error('...')` — surfaced verbatim by some callers. */
const RAW_ERROR = /new Error\(\s*(?:'((?:[^'\\]|\\.)*)'|`((?:[^`\\]|\\.)*)`)/g;

/** Zod's own `{ message: '...' }`, which never passes through AppError. */
const ZOD_MESSAGE = /message:\s*(?:'((?:[^'\\]|\\.)*)'|`((?:[^`\\]|\\.)*)`)/g;

interface Call {
  file: string;
  message: string;
  key?: string;
}

function allCalls(): Call[] {
  const out: Call[] = [];
  for (const file of tsFiles(SRC)) {
    const src = readFileSync(file, 'utf8');
    for (const m of src.matchAll(CALL)) {
      out.push({ file: path.relative(SRC, file), message: m[2] ?? m[3], key: m[4] ?? m[5] });
    }
  }
  return out;
}

describe('AppError', () => {
  it('carries status, http code, translation key and message', () => {
    const err = AppError.notFound('Course not found', 'course.not_found');
    expect(err.status).toBe(404);
    expect(err.code).toBe('NOT_FOUND');
    expect(err.key).toBe('course.not_found');
    expect(err.message).toBe('Course not found');
  });

  it('still works without a key, for errors that need no translation', () => {
    const err = AppError.badRequest('Something specific');
    expect(err.key).toBeUndefined();
    expect(err.status).toBe(400);
  });
});

describe('error call sites', () => {
  const calls = allCalls();

  // Common Indonesian function words. Any of these in a message that reaches a
  // reader means it would be shown to an English-speaking user untranslated.
  const INDONESIAN =
    /\b(tidak|sudah|belum|harus|hanya|dapat|yang|untuk|dari|dengan|anda|ditemukan|gagal|wajib|dipakai|milik|pada|adalah|jangan|bisa|diisi|berisi|boleh|minimal)\b/i;

  it('finds the error call sites to check', () => {
    expect(calls.length).toBeGreaterThan(300);
  });

  it('gives every error a translation key', () => {
    const missing = calls.filter((c) => !c.key).map((c) => `${c.file}: "${c.message}"`);
    expect(missing).toEqual([]);
  });

  it('writes every error message in English', () => {
    const offenders = calls
      .filter((c) => INDONESIAN.test(c.message))
      .map((c) => `${c.file}: "${c.message}"`);

    expect(offenders).toEqual([]);
  });

  it('writes every raw Error and Zod message in English too', () => {
    // AppError is not the only text that reaches a reader. `new Error(...)` is
    // re-thrown verbatim by callers such as the Google sign-in path, and Zod's
    // own `message:` is returned as a field error. Neither was ever scanned.
    const offenders: string[] = [];
    for (const file of tsFiles(SRC)) {
      if (file.includes(`${path.sep}scripts${path.sep}`)) continue;
      const src = readFileSync(file, 'utf8');
      for (const rx of [RAW_ERROR, ZOD_MESSAGE]) {
        for (const m of src.matchAll(rx)) {
          const message = m[1] ?? m[2] ?? '';
          if (INDONESIAN.test(message)) {
            offenders.push(`${path.relative(SRC, file)}: "${message}"`);
          }
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('uses dotted lower_snake keys throughout', () => {
    const malformed = calls
      // A key built at runtime (`order.invalid_${field}`) cannot be checked for
      // shape here; the literal half of it still has to look like the rest.
      .filter((c) => c.key && !c.key.includes('${'))
      .filter((c) => !/^[a-z0-9_]+(\.[a-z0-9_]+)+$/.test(c.key!))
      .map((c) => `${c.file}: ${c.key}`);
    expect(malformed).toEqual([]);
  });
});
