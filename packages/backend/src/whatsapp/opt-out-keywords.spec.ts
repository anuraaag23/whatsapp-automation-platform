import { matchConsentKeyword } from './opt-out-keywords';

describe('matchConsentKeyword', () => {
  it.each(['STOP', 'stop', '  Stop  ', 'Stop.', '"stop"', 'unsubscribe', 'opt out', 'optout', 'stop all', 'remove me'])(
    'matches %j as OPT_OUT',
    (text) => {
      const result = matchConsentKeyword(text);
      expect(result?.direction).toBe('OPT_OUT');
    },
  );

  it.each(['START', 'start', 'unstop', 'opt in', 'optin', 'subscribe'])('matches %j as OPT_IN', (text) => {
    const result = matchConsentKeyword(text);
    expect(result?.direction).toBe('OPT_IN');
  });

  it.each([
    'please stop calling me at work',
    'I want to unsubscribe from your competitor, not you',
    'can you stop sending me these please',
    'started my new job today',
    'lets start the meeting',
    'Hi there',
    '',
    '   ',
  ])('does NOT match %j — keyword only within a normal sentence', (text) => {
    expect(matchConsentKeyword(text)).toBeNull();
  });

  it('returns null for null/undefined input', () => {
    expect(matchConsentKeyword(null)).toBeNull();
    expect(matchConsentKeyword(undefined)).toBeNull();
  });
});
