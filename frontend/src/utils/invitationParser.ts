/**
 * Invitation URL Parser Utility
 * Validates patient invitation URLs or relative paths against the current app origin.
 * Requires both sessionId and patient access token as required by the backend.
 */

export interface ParseInvitationSuccess {
  ok: true;
  sessionId: string;
  token: string;
}

export interface ParseInvitationFailure {
  ok: false;
  error: string;
  errorCode: 'empty' | 'invalid_format' | 'missing_session_id' | 'missing_token';
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

  // 2. Reject credentials embedded in URL
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

  // 4. Path check: must begin with /join
  if (!parsed.pathname.startsWith('/join')) {
    return {
      ok: false,
      errorCode: 'invalid_format',
      error: 'यह लिंक सही नहीं लग रहा है। डॉक्टर से मिला पूरा लिंक पेस्ट करें।',
    };
  }

  // Reject invalid double slashes
  if (parsed.pathname.includes('//')) {
    return {
      ok: false,
      errorCode: 'invalid_format',
      error: 'यह लिंक सही नहीं लग रहा है। डॉक्टर से मिला पूरा लिंक पेस्ट करें।',
    };
  }

  // 5. Query parameters format: /join?session=xxx&token=yyy
  const querySession = parsed.searchParams.get('session');
  const queryToken = parsed.searchParams.get('token');

  if (parsed.pathname === '/join' || parsed.pathname === '/join/') {
    if (querySession && queryToken) {
      try {
        return {
          ok: true,
          sessionId: decodeURIComponent(querySession.trim()),
          token: decodeURIComponent(queryToken.trim()),
        };
      } catch {
        return {
          ok: false,
          errorCode: 'invalid_format',
          error: 'यह लिंक सही नहीं लग रहा है। डॉक्टर से मिला पूरा लिंक पेस्ट करें।',
        };
      }
    }
    if (queryToken && !querySession) {
      return {
        ok: false,
        errorCode: 'missing_session_id',
        error: 'पुराने या अधूरे लिंक में सत्र पहचान (Session ID) मौजूद नहीं है। कृपया डॉक्टर से नया पूरा लिंक मांगें।',
      };
    }
    return {
      ok: false,
      errorCode: 'invalid_format',
      error: 'यह लिंक सही नहीं लग रहा है। डॉक्टर से मिला पूरा लिंक पेस्ट करें।',
    };
  }

  // Path segments format: /join/<segment>
  const remainder = parsed.pathname.slice('/join/'.length).replace(/\/$/, '');
  if (!remainder) {
    return {
      ok: false,
      errorCode: 'invalid_format',
      error: 'यह लिंक सही नहीं लग रहा है। डॉक्टर से मिला पूरा लिंक पेस्ट करें।',
    };
  }

  const segments = remainder.split('/');

  // Reject extra path segments (e.g. /join/abc/extra)
  if (segments.length > 1) {
    return {
      ok: false,
      errorCode: 'invalid_format',
      error: 'यह लिंक सही नहीं लग रहा है। डॉक्टर से मिला पूरा लिंक पेस्ट करें।',
    };
  }

  const singleSegment = segments[0];

  // Validate percent encoding of singleSegment
  try {
    decodeURIComponent(singleSegment);
  } catch {
    return {
      ok: false,
      errorCode: 'invalid_format',
      error: 'यह लिंक सही नहीं लग रहा है। डॉक्टर से मिला पूरा लिंक पेस्ट करें।',
    };
  }

  // Case A: /join/:sessionId?token=:token
  if (queryToken) {
    try {
      return {
        ok: true,
        sessionId: decodeURIComponent(singleSegment),
        token: decodeURIComponent(queryToken.trim()),
      };
    } catch {
      return {
        ok: false,
        errorCode: 'invalid_format',
        error: 'यह लिंक सही नहीं लग रहा है। डॉक्टर से मिला पूरा लिंक पेस्ट करें।',
      };
    }
  }

  // Case B: Single segment without query token is a legacy or incomplete link missing session ID
  return {
    ok: false,
    errorCode: 'missing_session_id',
    error: 'पुराने या अधूरे लिंक में सत्र पहचान (Session ID) मौजूद नहीं है। कृपया डॉक्टर से नया पूरा लिंक मांगें।',
  };
}
