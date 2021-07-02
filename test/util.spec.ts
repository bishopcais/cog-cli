import { describe, expect, test } from '@jest/globals';
import { validSignal } from '../src/util';

describe('validSignal', () => {
  test.each([
    'SIGHUP',
    'SIGUSR1',
    'SIGUSR2',
  ])('validSignal: %s', (signal) => {
    expect(validSignal(signal)).toStrictEqual(true);
  });
});
