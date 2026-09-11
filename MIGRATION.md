# Mason Homes — Migration to GitHub + Vercel

Playbook for moving this repo off Netlify onto the client's own GitHub and Vercel accounts. Everything in the repo is already ported to Vercel-compatible shape: `vercel.json` at the project root, serverless function at `/api/leads.js`, static site served from `/site/`. No code changes should be needed during migration.

Old Netlify files (`netlify.toml`, `netlify/functions/`) are left in place as historical reference — Vercel ignores them, and they document the previous config if we ever need to revert.

---

## Step 1 — GitHub

**Client account (needs to happen once):**
1. Client signs up at [github.com](https://github.com) — free account is fine.
2. Client creates a **new empty repository**. Suggested name: `mason-homes-site`. **Do not** initialize with README, .gitignore, or license (we're pushing a full repo, so a clean empty repo is important).
3. Client invites the developer as a **collaborator** (Settings → Collaborators → Add people) so we can push. Alternatively, client creates a Personal Access Token with `repo` scope and shares it privately.

**From this working copy (developer machine):**
```bash
cd /Users/user/Projects/mason-homes

# Add the client's new repo as a second remote (keep old one as backup)
git remote add client git@github.com:<CLIENT-USERNAME>/mason-homes-site.git

# Push master + all history to the client's repo
git push client master
```

If the client uses HTTPS instead of SSH:
```bash
git remote add client https://github.com/<CLIENT-USERNAME>/mason-homes-site.git
git push client master
# GitHub will prompt for username + Personal Access Token
```

Verify: refresh the client's GitHub repo page — full commit history should be visible.

---

## Step 2 — Vercel

1. Client signs up at [vercel.com](https://vercel.com) using **"Continue with GitHub"** so the two accounts are linked.
2. On the Vercel dashboard: **Add New → Project**.
3. Vercel lists the client's GitHub repos. Select **mason-homes-site**. (First time only: Vercel asks to install the Vercel GitHub App — grant access to that repo.)
4. **Configure Project screen**:
   - **Framework Preset**: `Other`
   - **Root Directory**: `.` (leave as default, do NOT change to `site/` — Vercel needs the root to find `vercel.json` and `/api/`)
   - **Build Command**: leave blank (Vercel reads `vercel.json` — it's already set to no-build)
   - **Output Directory**: leave blank (also set by `vercel.json` → `site`)
   - **Install Command**: leave blank
5. **Environment Variables** — expand this section and add:
   - `NETLIFY_API_TOKEN` = *(Personal Access Token from the old Netlify account — needed only if you want the admin CRM to keep reading past Netlify Forms submissions)*
   - `NETLIFY_SITE_ID` = *(the "API ID" from the old Netlify site)*
   - Skip this section entirely if the client has already decided to migrate forms to a new destination (Formspree / Supabase / Vercel API).
6. Click **Deploy**. First deploy takes 60–90 seconds.
7. Vercel gives you `<project>.vercel.app` — verify the homepage loads, then check `/admin/`, `/gallery/`, `/services/`, `/locations/tampa/`, `/api/leads`.

---

## Step 3 — Custom Domain

**Current state:** `masonhomesconstruction.com` is pointed at a Durable/Next.js site (not our work). To make our Vercel deploy the live production site, DNS needs to change.

1. In Vercel: Project → **Settings → Domains → Add** → enter `masonhomesconstruction.com` and `www.masonhomesconstruction.com`.
2. Vercel shows the required DNS records (typically an A record for the apex and a CNAME for www). Copy them.
3. Log in to whoever owns the domain's DNS (probably the client's registrar — GoDaddy, Namecheap, Cloudflare, etc.).
4. Delete the old Durable A/CNAME records for the domain root and www.
5. Add the new Vercel records.
6. Propagation is usually 5–30 minutes. Vercel auto-provisions SSL once DNS resolves.

**If DNS is behind Cloudflare** (which the current setup appears to be, based on response headers): set the record type to A and turn OFF the orange proxy cloud initially so Vercel can validate the domain. Once validated, the proxy can be turned back on if desired.

---

## Step 4 — Forms Decision (Required)

The three website forms currently declare `data-netlify="true"`, which is a no-op on Vercel. Once the Netlify site is inactive, form submissions won't go anywhere unless we re-point them.

**Forms in play:**
- `/contact/` → form name `contact`
- `/free-estimate/` → form name `estimate`
- Chat widget on every page → form name `mason-chat` (posted via `/assets/js/widgets.js`)

**Pick one:**

### Option A — Formspree (fastest, ~10 min)
Free tier: 50 submissions/month. Best if the client wants to be live tomorrow with no infrastructure work.
1. Client signs up at [formspree.io](https://formspree.io/), free plan.
2. Creates one form endpoint per form (or one shared endpoint). Formspree gives a URL like `https://formspree.io/f/xnqogpxa`.
3. Update the three form action URLs — one Edit per file, or a bulk find-and-replace.
4. Formspree sends submissions to the client's email inbox and shows them in a dashboard.

Trade-off: Admin CRM stops seeing new leads unless we also add a webhook. Fine for a launch, not fine long-term.

### Option B — Vercel API + Resend email (~30 min)
Client signs up at [resend.com](https://resend.com) (free tier: 100 emails/day). Developer builds `/api/submit-lead.js` that receives the POST and emails the client. Only piece the client provides is the Resend API key as a Vercel env var.

Trade-off: Same as Formspree on the admin CRM side (no automatic pipeline into the dashboard), but no third-party dependency other than Resend.

### Option C — Supabase (real solution, ~1–2 hr)
The migration plan already lives in `/site/admin/data-model.md`. Client creates a Supabase project (free tier is generous), runs the migration SQL, and we swap the form submission code + admin `mhDB.get()` calls for `supabase-js`. Result: leads write directly into a real database, admin CRM reads live, multi-device sync just works.

Recommendation for tomorrow: **Option A** to get launched quickly, then plan Option C for the next work session. The forms will keep working during the eventual Supabase migration.

---

## Step 5 — Cleanup (optional, after everything is verified)

- Old GitHub repo (`soldbytal-ui/masonhomesconstruction`) can be archived or left alone as backup.
- Old Netlify site can be deleted once the client is comfortable that all Netlify Forms submissions have been read or exported. Until then, the paused site's forms table remains accessible via the Netlify API (which is why `NETLIFY_API_TOKEN` in the Vercel env vars keeps working).
- `netlify.toml` and `netlify/functions/` can be deleted from the repo once the client is on Vercel and doesn't plan to return. Leaving them is harmless.

---

## Files at a Glance

| File / Path                | Purpose |
|---------------------------|---------|
| `vercel.json`             | Vercel build + headers + cache config. Equivalent of the old `netlify.toml`. |
| `api/leads.js`            | Vercel serverless function that powers `/api/leads` (admin CRM lead sync). |
| `site/`                   | The static site (what gets served). Every URL under the domain maps to a file here. |
| `site/admin/`             | Admin CRM prototype. Protected by HTTP Basic Auth at the Vercel Edge Middleware layer (see `/middleware.js`) — requires `ADMIN_USER` + `ADMIN_PASSWORD` env vars set on Vercel Production. Excluded from `robots.txt`. |
| `site/admin/data-model.md`| Supabase migration plan for when the CRM moves off localStorage. |
| `netlify.toml`, `netlify/functions/` | Old Netlify config, kept for reference. Ignored by Vercel. |

---

## Sanity Checklist (after Vercel deploy)

- [ ] `https://<project>.vercel.app/` loads the homepage
- [ ] `https://<project>.vercel.app/services/kitchen-remodeling/` loads (trailing slash routing works)
- [ ] `https://<project>.vercel.app/gallery/` loads (large image page, verify no broken images)
- [ ] `https://<project>.vercel.app/admin/` shows an HTTP Basic Auth prompt (browser-native dialog). Credentials from `ADMIN_USER` + `ADMIN_PASSWORD` env vars.
- [ ] `https://<project>.vercel.app/api/leads` returns JSON — either `{configured: true, leads: [...]}` or `{configured: false, message: "..."}`
- [ ] View the page source of the homepage — verify `<script type="application/ld+json">` blocks are still present (Organization, WebSite, FAQPage schema)
- [ ] Check `robots.txt` and `sitemap.xml` at the root — should return 200 OK with expected content
- [ ] `masonhomesconstruction.com` resolves to the new site (once DNS cuts over)
- [ ] SSL certificate is valid (Vercel auto-provisions via Let's Encrypt)
