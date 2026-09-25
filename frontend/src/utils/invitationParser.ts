/**
 * Invitation URL Parser Utility
 * Validates patient invitation URLs or relative paths against the current app origin.
 */

export interface ParseInvitationSuccess {
  ok: true;
  token: string;
}

export interface ParseInvitationFailure {
  ok: false;
  error: string;
  errorCode: 'empty' | 'invalid_format';
}

export type ParseInvitationResult = ParseInvitationSuccess | ParseInvitationFailure;

export function parseInvitationInput(
  rawInput: string,
  appOrigin: string
): ParseInvitationResult {
  const trimmed = rawInput.trim();
  if (!trimmed) {
    return {
      ok: false,
      errorCode: 'empty',
      error: 'आमंत्रण लिंक दर्ज करें।',
    };
  }

  // Reject raw malformed percent encodings before URL resolution if needed,
  // or catch URL parsing errors.
  let parsed: URL;
  try {
    parsed = new URL(trimmed, appOrigin);
  } catch {
    return {
      ok: false,
      errorCode: 'invalid_format',
      error: 'यह लिंक सही नहीं लग रहा है। डॉक्टर से मिला पूरा लिंक पेस्ट करें।',
    };
  }

  // 1. Protocol check: only http: and https:
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return {
      ok: false,
      errorCode: 'invalid_format',
      error: 'यह लिंक सही नहीं लग रहा है। डॉक्टर से मिला पूरा लिंक पेस्ट करें।',
    };
  }

  // 2. Reject credentials embedded in URL (e.g., http://user:pass@host/...)
  if (parsed.username || parsed.password) {
    return {
      ok: false,
      errorCode: 'invalid_format',
      error: 'यह लिंक सही नहीं लग रहा है। डॉक्टर से मिला पूरा लिंक पेस्ट करें।',
    };
  }

  // 3. Strict origin check: must match appOrigin
  if (parsed.origin !== appOrigin) {
    return {
      ok: false,
      errorCode: 'invalid_format',
      error: 'यह लिंक सही नहीं लग रहा है। डॉक्टर से मिला पूरा लिंक पेस्ट करें।',
    };
  }

  // 4. Path check: must begin with /join/
  const prefix = '/join/';
  if (!parsed.pathname.startsWith(prefix)) {
    return {
      ok: false,
      errorCode: 'invalid_format',
      error: 'यह लिंक सही नहीं लग रहा है। डॉक्टर से मिला पूरा लिंक पेस्ट करें।',
    };
  }

  // 5. Exactly one non-empty token segment, with optional single trailing slash
  // Reject /join/abc/extra, /join/abc//, /join//, /join/
  const remainder = parsed.pathname.slice(prefix.length);
  if (!remainder) {
    return {
      ok: false,
      errorCode: 'invalid_format',
      error: 'यह लिंक सही नहीं लग रहा है। डॉक्टर से मिला पूरा लिंक पेस्ट करें।',
    };
  }

  // Check for double slashes anywhere in the remainder (e.g. "abc//", "/abc", "abc//def")
  if (remainder.includes('//')) {
    return {
      ok: false,
      errorCode: 'invalid_format',
      error: 'यह लिंक सही नहीं लग रहा है। डॉक्टर से मिला पूरा लिंक पेस्ट करें।',
    };
  }

  const segments = remainder.split('/');
  // Case 1: "token" -> segments: ["token"]
  // Case 2: "token/" -> segments: ["token", ""]
  // Any segments with length > 2, or segments[0] empty, or multiple segments is rejected
  let tokenSegment = '';
  if (segments.length === 1 && segments[0].length > 0) {
    tokenSegment = segments[0];
  } else if (segments.length === 2 && segments[0].length > 0 && segments[1] === '') {
    tokenSegment = segments[0];
  } else {
    return {
      ok: false,
      errorCode: 'invalid_format',
      error: 'यह लिंक सही नहीं लग रहा है। डॉक्टर से मिला पूरा लिंक पेस्ट करें।',
    };
  }

  // 6. Verify URL encoding integrity (no malformed percent-sequences like %8G)
  try {
    decodeURIComponent(tokenSegment);
  } catch {
    return {
      ok: false,
      errorCode: 'invalid_format',
      error: 'यह लिंक सही नहीं लग रहा है। डॉक्टर से मिला पूरा लिंक पेस्ट करें।',
    };
  }

  // Preserve valid token casing and encoding without forcing lowercasing or stripping
  return {
    ok: true,
    token: tokenSegment,
  };
}
