/*
  Vercel Serverless Function: POST /api/lead-submit
  Receives a lead from the site's public forms (chat widget, contact form,
  free-estimate form) and inserts a row into the Supabase `leads` table.
  After a successful Supabase write, also POSTs to Formspree as a secondary
  notification channel so the client receives an email per submission.

  Accepts either JSON body or form-encoded body. Returns { ok: true, id }
  on success, { ok: false, error } on failure.

  Reads Supabase config from Vercel env vars:
    - SUPABASE_URL          e.g. https://xxxxx.supabase.co
    - SUPABASE_ANON_KEY     the anon/public key (row-level security applies)

  Formspree endpoint (hard-coded — it's a public form ID, not a secret):
    - https://formspree.io/f/mljenlqj
  Failures on the Formspree POST are logged but do NOT fail the request —
  Supabase is the source of truth; Formspree is a notification convenience.

  Security note: with the default RLS policies from /site/admin/data-model.md,
  anon inserts on leads are blocked. Either add a policy that allows anon to
  INSERT on leads (see below), or set SUPABASE_SERVICE_ROLE_KEY in Vercel and
  it will be preferred here (bypasses RLS).

  Suggested RLS policy for anon inserts (run in Supabase SQL editor):
    create policy "anon_can_insert_leads"
      on leads for insert
      to anon
      with check (true);
*/

const FORMSPREE_ENDPOINT = 'https://formspree.io/f/mljenlqj';

module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'POST') {
    res.status(405).send(JSON.stringify({ ok: false, error: 'Method not allowed' }));
    return;
  }

  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  // Prefer service role key for INSERTs (bypasses RLS); fall back to anon
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || anon;

  if (!url || !key) {
    res.status(500).send(JSON.stringify({
      ok: false,
      error: 'Supabase not configured. Set SUPABASE_URL and either SUPABASE_ANON_KEY or SUPABASE_SERVICE_ROLE_KEY.',
    }));
    return;
  }

  try {
    const body = await parseBody(req);

    // Simple honeypot: if bot-field is filled, silently accept and drop
    if (body['bot-field']) {
      res.status(200).send(JSON.stringify({ ok: true, id: 'ignored' }));
      return;
    }

    // Map incoming fields (accept several common shapes)
    const first = body.first_name || '';
    const last  = body.last_name || '';
    const composedName = `${first} ${last}`.trim();
    const name = body.name || body.full_name || composedName;

    const formName = body['form-name'] || body.form_name || 'web';
    const sourceMap = {
      'mason-chat': 'chat_widget',
      contact: 'form',
      estimate: 'form',
    };

    if (!name && !body.email && !body.phone) {
      res.status(400).send(JSON.stringify({
        ok: false,
        error: 'Submission missing name, email and phone. At least one required.',
      }));
      return;
    }

    const row = {
      source:   sourceMap[formName] || 'web',
      project:  body.project || body.project_type || body.service || body.subject || null,
      budget:   body.budget || null,
      timeline: body.timeline || body.start_time || null,
      location: body.location || body.city || body.zip || null,
      name:     name || '(no name)',
      phone:    body.phone || body.tel || null,
      email:    body.email || null,
      status:   'new',
      page:     body.page || body.referrer || null,
      notes:    body.message || body.notes || body.details || null,
    };

    const supaRes = await fetch(`${url}/rest/v1/leads`, {
      method: 'POST',
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      },
      body: JSON.stringify(row),
    });

    if (!supaRes.ok) {
      const text = await supaRes.text();
      throw new Error(`Supabase ${supaRes.status}: ${text.slice(0, 300)}`);
    }

    const inserted = await supaRes.json();
    const id = Array.isArray(inserted) && inserted[0] ? inserted[0].id : null;

    // Secondary notification: fire Formspree so the client gets an email.
    // Any failure here is logged and swallowed — Supabase is authoritative.
    await notifyFormspree(row, body, id);

    res.status(200).send(JSON.stringify({ ok: true, id }));
  } catch (err) {
    res.status(200).send(JSON.stringify({
      ok: false,
      error: err.message || String(err),
    }));
  }
};

// Fire Formspree with the same lead data plus notification-friendly fields.
// Never throws — logs any failure and returns.
async function notifyFormspree(row, body, supabaseId) {
  try {
    const formSource =
      body._form_source ||
      body.form_source ||
      body['form-name'] ||
      row.source ||
      'website';

    // Formspree treats leading-underscore fields as special (subject, reply-to,
    // honeypot, etc). Keep the visible payload human-readable in the email.
    const payload = {
      _subject: `New lead — ${formSource} — ${row.name}`,
      _replyto: row.email || undefined,
      _form_source: formSource,
      name:     row.name,
      email:    row.email || '',
      phone:    row.phone || '',
      project:  row.project || '',
      budget:   row.budget || '',
      timeline: row.timeline || '',
      location: row.location || '',
      notes:    row.notes || '',
      page:     row.page || '',
      source:   row.source,
      supabase_lead_id: supabaseId || '',
      submitted_at: new Date().toISOString(),
    };

    const fsRes = await fetch(FORMSPREE_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!fsRes.ok) {
      const text = await fsRes.text().catch(() => '');
      console.error(
        `[lead-submit] Formspree ${fsRes.status} — Supabase lead ${supabaseId} still saved. ${text.slice(0, 200)}`
      );
    }
  } catch (err) {
    console.error(
      `[lead-submit] Formspree notify failed — Supabase lead ${supabaseId} still saved. ${err.message || err}`
    );
  }
}

async function parseBody(req) {
  // Vercel already parses common bodies but not always urlencoded — handle both
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) {
    return req.body;
  }

  const chunks = [];
  await new Promise((resolve, reject) => {
    req.on('data', (c) => chunks.push(c));
    req.on('end', resolve);
    req.on('error', reject);
  });
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw) return {};

  const ct = (req.headers['content-type'] || '').toLowerCase();
  if (ct.includes('application/json')) {
    try { return JSON.parse(raw); } catch { return {}; }
  }
  if (ct.includes('application/x-www-form-urlencoded')) {
    const out = {};
    raw.split('&').forEach((pair) => {
      const [k, v = ''] = pair.split('=');
      out[decodeURIComponent(k.replace(/\+/g, ' '))] = decodeURIComponent(v.replace(/\+/g, ' '));
    });
    return out;
  }
  try { return JSON.parse(raw); } catch { return {}; }
}
