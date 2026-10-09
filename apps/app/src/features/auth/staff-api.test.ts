import { describe, expect, it } from 'vitest';
import { AuthFlowError, parsePinCheck } from './staff-api';

describe('parsePinCheck', () => {
  it.each(['ok', 'locked_out', 'no_pin', 'no_branch_access', 'inactive'] as const)(
    'reads %s',
    (result) => {
      expect(parsePinCheck({ result })).toEqual({ result });
    },
  );

  it('reads the tries left after a wrong PIN', () => {
    expect(parsePinCheck({ result: 'wrong_pin', tries_left: 3 })).toEqual({
      result: 'wrong_pin',
      triesLeft: 3,
    });
  });

  it.each([null, 'ok', {}, { result: 'maybe' }, { result: 'wrong_pin' }])(
    'refuses an answer it does not know: %j',
    (data) => {
      expect(() => parsePinCheck(data)).toThrow(AuthFlowError);
    },
  );
});
