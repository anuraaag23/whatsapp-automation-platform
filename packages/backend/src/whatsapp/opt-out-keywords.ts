/**
 * Detects an inbound message that IS an opt-out/opt-in request, as opposed
 * to one that merely mentions the idea in passing. Deliberately an exact
 * match against the whole (normalized) message body, not a substring or
 * regex-word-boundary match — "please stop calling me at work" or "I want
 * to unsubscribe from your competitor's list, not yours" would both
 * contain a bare substring match, but neither is the contact issuing a
 * clear opt-out instruction to THIS number. Compliance requires acting on
 * unambiguous opt-out signals, not maximum recall.
 */
export type ConsentKeywordDirection = 'OPT_IN' | 'OPT_OUT';

export interface ConsentKeywordMatch {
  direction: ConsentKeywordDirection;
  keyword: string;
}

// Meta's own guidance recommends recognizing STOP/UNSUBSCRIBE as universal
// opt-out signals; the rest are common real-world phrasings kept narrow
// enough to still require the message be (almost) exactly this and nothing
// else.
const OPT_OUT_KEYWORDS = new Set(['stop', 'unsubscribe', 'opt out', 'optout', 'stop all', 'remove me']);
const OPT_IN_KEYWORDS = new Set(['start', 'unstop', 'opt in', 'optin', 'subscribe']);

export function matchConsentKeyword(rawText: string | null | undefined): ConsentKeywordMatch | null {
  if (!rawText) return null;

  const normalized = rawText
    .trim()
    .toLowerCase()
    // Strip trailing/leading punctuation only ("STOP." / "\"stop\"") — not
    // punctuation in the middle, which would start turning this into a
    // fuzzy/substring match again.
    .replace(/^[\s"'.!?]+|[\s"'.!?]+$/g, '');

  if (!normalized) return null;

  if (OPT_OUT_KEYWORDS.has(normalized)) return { direction: 'OPT_OUT', keyword: normalized };
  if (OPT_IN_KEYWORDS.has(normalized)) return { direction: 'OPT_IN', keyword: normalized };
  return null;
}
