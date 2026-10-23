import { beforeEach, describe, expect, it } from 'vitest';
import { migrateLegacyLocalStorage } from './legacyStorage';

beforeEach(() => localStorage.clear());

describe('migrateLegacyLocalStorage', () => {
  it('renames every jamkey-prefixed key to the keel prefix and removes the old one', () => {
    localStorage.setItem('jamkey.settings', '{"state":{"a4":442},"version":1}');
    localStorage.setItem('jamkey.ui.piano', '1');
    localStorage.setItem('jamkey.ui.inspector', '1:scales');
    localStorage.setItem('jamkey-auth', '{"access_token":"t"}');
    localStorage.setItem('jamkey-auth-code-verifier', 'v');
    localStorage.setItem('other', 'x');

    expect(migrateLegacyLocalStorage(localStorage)).toBe(5);

    expect(localStorage.getItem('keel.settings')).toBe('{"state":{"a4":442},"version":1}');
    expect(localStorage.getItem('keel.ui.piano')).toBe('1');
    expect(localStorage.getItem('keel.ui.inspector')).toBe('1:scales');
    expect(localStorage.getItem('keel-auth')).toBe('{"access_token":"t"}');
    expect(localStorage.getItem('keel-auth-code-verifier')).toBe('v');
    expect(localStorage.getItem('other')).toBe('x');
    for (const k of Object.keys(localStorage)) expect(k.startsWith('jamkey')).toBe(false);
  });

  it('never overwrites a value already stored under the new key', () => {
    localStorage.setItem('jamkey.ui.piano', '1');
    localStorage.setItem('keel.ui.piano', '0');
    expect(migrateLegacyLocalStorage(localStorage)).toBe(0);
    expect(localStorage.getItem('keel.ui.piano')).toBe('0');
    expect(localStorage.getItem('jamkey.ui.piano')).toBeNull();
  });

  it('ignores keys that merely begin with the letters', () => {
    localStorage.setItem('jamkeyboard', '1');
    expect(migrateLegacyLocalStorage(localStorage)).toBe(0);
    expect(localStorage.getItem('jamkeyboard')).toBe('1');
  });

  it('is a no-op without storage', () => {
    expect(migrateLegacyLocalStorage(undefined)).toBe(0);
  });
});
