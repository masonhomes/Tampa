/*
  Vercel Edge Middleware — HTTP Basic Auth for admin surfaces.

  Guards:
    /admin/*      — all admin CRM pages, assets, and subroutes
    /api/leads    — read endpoint that returns every lead in Supabase
    /api/leads/   — same, trailing-slash variant

  Explicitly does NOT guard:
    /api/lead-submit  — public form submission endpoint (must stay open
                         so the site's forms and chat widget keep working)
    /api/keepalive    — has its own CRON_SECRET auth
    all other paths   — public site

  Env vars (set in Vercel → Project → Settings → Environment Variables,
  Production scope):
    ADMIN_USER      — the Basic Auth username
    ADMIN_PASSWORD  — the Basic Auth password

  Behavior:
    - Missing / malformed Authorization header → 401 + WWW-Authenticate
      prompt so the browser shows a login dialog.
    - Credentials mismatch → 401 (same dialog, browser re-prompts).
    - Env vars unset → 500 "fail closed" so a config gap doesn't
      accidentally expose the admin.
    - Match → pass through untouched (return undefined).
*/

export const config = {
  matcher: [
    '/admin/:path*',
    '/api/leads',
    '/api/leads/',
  ],
};

export default function middleware(request) {
  const expectedUser = process.env.ADMIN_USER || '';
  const expectedPass = process.env.ADMIN_PASSWORD || '';

  // Fail closed if the server isn't configured — never accidentally expose
  if (!expectedUser || !expectedPass) {
    return new Response('Admin auth not configured on the server.', {
      status: 500,
      headers: { 'Content-Type': 'text/plain' },
    });
  }

  const authHeader = request.headers.get('authorization') || '';
  if (!authHeader.toLowerCase().startsWith('basic ')) {
    return unauthorized();
  }

  const encoded = authHeader.slice(6).trim();
  let decoded;
  try {
    decoded = atob(encoded);
  } catch (_e) {
    return unauthorized();
  }

  const colonIdx = decoded.indexOf(':');
  if (colonIdx === -1) return unauthorized();

  const providedUser = decoded.slice(0, colonIdx);
  const providedPass = decoded.slice(colonIdx + 1);

  // Timing-safe comparisons — evaluate BOTH regardless of first result
  // so total work is constant regardless of which side is wrong.
  const userOk = timingSafeEqual(providedUser, expectedUser);
  const passOk = timingSafeEqual(providedPass, expectedPass);

  if (!(userOk && passOk)) {
    return unauthorized();
  }

  // Auth OK — let the request through to the target (static page / function)
  return undefined;
}

function unauthorized() {
  return new Response('Unauthorized', {
    status: 401,
    headers: {
      'WWW-Authenticate': 'Basic realm="Mason Homes Admin"',
      'Content-Type': 'text/plain',
      'Cache-Control': 'no-store',
    },
  });
}

// Constant-time string comparison. Iterates the max length of both inputs
// so early return doesn't leak which side was longer. Result bit is
// accumulated with |= so the loop can't short-circuit on first divergence.
function timingSafeEqual(a, b) {
  const enc = new TextEncoder();
  const aBuf = enc.encode(a);
  const bBuf = enc.encode(b);
  const len = Math.max(aBuf.length, bBuf.length);
  let diff = aBuf.length ^ bBuf.length;
  for (let i = 0; i < len; i++) {
    diff |= (aBuf[i] || 0) ^ (bBuf[i] || 0);
  }
  return diff === 0;
}
