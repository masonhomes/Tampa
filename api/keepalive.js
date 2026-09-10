/*
  Vercel Serverless Function: GET /api/keepalive
  Called by Vercel Cron once a day to prevent Supabase's free-tier
  auto-pause (which happens after ~7 days of no activity and cost the
  project a day of form outage).

  Behavior:
    - Reads CRON_SECRET from env and requires "Authorization: Bearer
      <CRON_SECRET>" on the request. Vercel Cron injects this header
      automatically when the env var is set.
    - Runs a lightweight count query against the leads table via
      Supabase PostgREST. Any successful round trip resets Supabase's
      "recent activity" timer.
    - Returns 200 with the current lead count on success.
    - Returns 500 if Supabase is unreachable or errors.
    - Returns 401 if the auth header is missing or wrong.

  Manual test (from any machine with the secret):
    curl -H "Authorization: Bearer $CRON_SECRET" \
      https://<project>.vercel.app/api/keepalive

  Env vars used:
    - CRON_SECRET                  32-char shared secret
    - SUPABASE_URL                 same as /api/lead-submit
    - SUPABASE_SERVICE_ROLE_KEY    preferred (bypasses RLS)
      or SUPABASE_ANON_KEY         fallback (requires anon SELECT policy
                                   on leads, which the default schema
                                   grants to authenticated only — so
                                   service_role is recommended here)
*/

module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');

  const cronSecret = process.env.CRON_SECRET;
  const auth = req.headers.authorization || '';

  if (!cronSecret) {
    res.status(500).send(JSON.stringify({
      ok: false,
      error: 'CRON_SECRET not configured on the server.',
    }));
    return;
  }

  if (auth !== `Bearer ${cronSecret}`) {
    res.status(401).send(JSON.stringify({ ok: false, error: 'Unauthorized' }));
    return;
  }

  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    res.status(500).send(JSON.stringify({
      ok: false,
      error: 'Supabase not configured.',
    }));
    return;
  }

  try {
    const supaRes = await fetch(`${url}/rest/v1/leads?select=count`, {
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        Accept: 'application/json',
      },
    });

    if (!supaRes.ok) {
      const text = await supaRes.text();
      res.status(500).send(JSON.stringify({
        ok: false,
        error: `Supabase ${supaRes.status}: ${text.slice(0, 200)}`,
      }));
      return;
    }

    const rows = await supaRes.json();
    const count = Array.isArray(rows) && rows[0] && rows[0].count != null
      ? rows[0].count
      : 0;

    res.status(200).send(JSON.stringify({
      ok: true,
      count,
      checked_at: new Date().toISOString(),
    }));
  } catch (err) {
    res.status(500).send(JSON.stringify({
      ok: false,
      error: err.message || String(err),
    }));
  }
};
