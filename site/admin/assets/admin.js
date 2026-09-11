/* ================================================================
   MASON HOMES ADMIN — CRM Core JS
   localStorage data model, seed data, rendering helpers.
   Data model is Supabase-ready — see /admin/data-model.md

   Authentication is enforced at the Vercel Edge Middleware layer
   (see /middleware.js). By the time any code here runs, the request
   has already passed HTTP Basic Auth against the ADMIN_USER +
   ADMIN_PASSWORD env vars. No client-side auth gate is needed and
   no password lives in this file.
   ================================================================ */

(function(){
'use strict';

// ---------- DATA MODEL (localStorage; mirrors Supabase schema) ----------
const DB_KEY = 'mh_admin_db_v1';
const SCHEMAS = ['leads','projects','estimates','invoices','team','tasks','communications','settings'];

function loadDB(){
  try { return JSON.parse(localStorage.getItem(DB_KEY)) || null; } catch(e) { return null; }
}
function saveDB(db){ localStorage.setItem(DB_KEY, JSON.stringify(db)); }
function uid(){ return 'id_' + Math.random().toString(36).slice(2,10) + Date.now().toString(36).slice(-4); }
function nowISO(){ return new Date().toISOString(); }

function seedIfEmpty(){
  const existing = loadDB();
  if(existing && existing.leads) return existing;

  const db = {
    leads: [],
    projects: [],
    estimates: [],
    invoices: [],
    team: [
      { id: uid(), name:'Founder / Owner', role:'owner', email:'info@masonhomesfl.com', phone:'(813) 999-5910', active:true },
    ],
    tasks: [],
    communications: [],
    settings: {
      company_name:'Mason Homes Inc',
      display_name:'Mason Homes',
      license:'CGC062538',
      phone:'(813) 999-5910',
      email:'info@masonhomesfl.com',
      address:'5816 Little River Dr, Tampa, FL 33615',
      hours:'Mon – Sat · 8a – 6p',
      contingency_default_pct:10,
      trades_labor_rate_hr:52,
    },
  };

  saveDB(db);
  return db;
}

let db;
function getDB(){ db = db || loadDB() || seedIfEmpty(); return db; }
function resetDB(){ localStorage.removeItem(DB_KEY); db = null; return seedIfEmpty(); }

window.mhDB = { get: getDB, save: saveDB, reset: resetDB, uid, nowISO };

// ---------- LIVE LEAD SYNC (Supabase via /api/leads Vercel function) ----------
async function syncFromNetlify(){
  try {
    const res = await fetch('/api/leads', { cache:'no-store' });
    if(!res.ok) return { ok:false, error:'HTTP ' + res.status };
    const data = await res.json();
    if(!data.configured) return { ok:true, configured:false, added:0, message:data.message };
    if(data.error) return { ok:false, configured:true, error:data.error };

    const db = getDB();
    const existingIds = new Set(db.leads.map(l => l.id));
    let added = 0;
    (data.leads || []).forEach(lead => {
      if(!existingIds.has(lead.id)){
        db.leads.push(lead);
        added++;
      }
    });
    if(added > 0) saveDB(db);
    return { ok:true, configured:true, added, total:(data.leads||[]).length, fetched_at:data.fetched_at };
  } catch(err) {
    return { ok:false, error: err.message || String(err) };
  }
}

window.mhLeads = { sync: syncFromNetlify };

// Sync banner HTML helper — shows current sync state at top of a page
function syncBannerHTML(state){
  state = state || { phase:'syncing' };
  const cls = { syncing:'', ok:'ok', setup:'warn', error:'err' }[state.phase] || '';
  let msg = '';
  if(state.phase === 'syncing'){
    msg = '<strong>Syncing…</strong> checking Supabase for new leads.';
  } else if(state.phase === 'ok'){
    if(state.added > 0){
      msg = '<strong>' + state.added + ' new lead' + (state.added===1?'':'s') + ' imported.</strong> Live sync active · '
        + state.total + ' total in Supabase.';
    } else {
      msg = '<strong>Up to date.</strong> Live sync active · ' + state.total + ' lead' + (state.total===1?'':'s') + ' in Supabase.';
    }
  } else if(state.phase === 'setup'){
    msg = '<strong>Supabase not configured.</strong> Add <code>SUPABASE_URL</code> and <code>SUPABASE_ANON_KEY</code> in Vercel → Project Settings → Environment Variables. Until then, admin only shows locally-added leads.';
  } else if(state.phase === 'error'){
    msg = '<strong>Sync failed.</strong> ' + (state.error || 'Unknown error') + ' — retry in a moment.';
  }
  return ''
    + '<div class="sync-banner ' + cls + '" id="sync-banner">'
    +   '<span class="dot"></span>'
    +   '<div class="msg">' + msg + '</div>'
    +   '<button class="refresh" id="sync-refresh"' + (state.phase==='syncing'?' disabled':'') + '>' + (state.phase==='syncing'?'Syncing…':'Refresh') + '</button>'
    + '</div>';
}

// Attach a banner to a page. renderFn = () => void, re-renders page after sync completes.
async function attachSyncBanner(root, renderFn){
  const holder = document.createElement('div');
  holder.id = 'sync-banner-holder';
  holder.innerHTML = syncBannerHTML({ phase:'syncing' });
  root.prepend(holder);

  async function doSync(){
    holder.innerHTML = syncBannerHTML({ phase:'syncing' });
    const res = await syncFromNetlify();
    let state;
    if(!res.ok){
      state = { phase:'error', error: res.error };
    } else if(!res.configured){
      state = { phase:'setup' };
    } else {
      state = { phase:'ok', added: res.added, total: res.total };
    }
    holder.innerHTML = syncBannerHTML(state);
    holder.querySelector('#sync-refresh').addEventListener('click', doSync);
    if(res.ok && res.configured && res.added > 0){
      renderFn();
      // Re-attach the holder since renderFn may have wiped root
      const newRoot = document.getElementById('content');
      if(newRoot && !document.getElementById('sync-banner-holder')){
        newRoot.prepend(holder);
      }
    }
  }
  holder.querySelector('#sync-refresh').addEventListener('click', doSync);
  doSync();
}

window.mhSync = { banner: attachSyncBanner };

// ---------- FORMATTING HELPERS ----------
function fmtMoney(n){
  if(n == null) return '—';
  const abs = Math.abs(n);
  if(abs >= 1000000) return '$' + (n/1000000).toFixed(1) + 'M';
  if(abs >= 1000) return '$' + Math.round(n/1000) + 'K';
  return '$' + n.toLocaleString();
}
function fmtMoneyFull(n){
  if(n == null) return '—';
  return '$' + n.toLocaleString(undefined, { minimumFractionDigits:0, maximumFractionDigits:0 });
}
function fmtDate(d){
  if(!d) return '—';
  const dt = new Date(d);
  return dt.toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' });
}
function fmtDateShort(d){
  if(!d) return '—';
  const dt = new Date(d);
  return dt.toLocaleDateString('en-US', { month:'short', day:'numeric' });
}
function fmtRelative(d){
  if(!d) return '—';
  const dt = new Date(d);
  const diff = Date.now() - dt.getTime();
  const mins = Math.floor(diff / 60000);
  const hrs = Math.floor(mins / 60);
  const days = Math.floor(hrs / 24);
  if(mins < 60) return mins < 1 ? 'just now' : mins + 'm ago';
  if(hrs < 24) return hrs + 'h ago';
  if(days < 30) return days + 'd ago';
  return fmtDateShort(d);
}
function initials(name){
  return (name||'').split(/\s+/).slice(0,2).map(s=>s[0]||'').join('').toUpperCase() || '?';
}

window.mhFmt = { money:fmtMoney, moneyFull:fmtMoneyFull, date:fmtDate, dateShort:fmtDateShort, relative:fmtRelative, initials };

// ---------- LAYOUT (sidebar + topbar) ----------
// Note: no client-side login screen. HTTP Basic Auth is enforced at
// /middleware.js before any admin asset is served, so by the time this
// file runs, the visitor is already authenticated.
function currentPath(){
  const p = location.pathname.replace(/^\/admin\//, '').replace(/\/$/, '');
  if(!p || p === 'index.html') return 'dashboard';
  return p.split('/')[0];
}

function svgIcon(name){
  const icons = {
    dashboard: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/></svg>',
    leads: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
    projects: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>',
    estimates: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/></svg>',
    schedule: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>',
    tasks: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>',
    invoices: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>',
    team: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
    reports: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>',
    settings: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',
    search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>',
    bell: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>',
    plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>',
    logout: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>',
    external: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>',
    trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>',
    close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
  };
  return icons[name] || '';
}

function renderSidebar(active, badges){
  badges = badges || {};
  const items = [
    { section:'Command Center' },
    { key:'dashboard', href:'/admin/', icon:'dashboard', label:'Dashboard' },
    { key:'leads', href:'/admin/leads/', icon:'leads', label:'Leads', badge:badges.leads },
    { section:'Delivery' },
    { key:'projects', href:'/admin/projects/', icon:'projects', label:'Projects' },
    { key:'tasks', href:'/admin/tasks/', icon:'tasks', label:'Tasks', badge:badges.tasks },
    { key:'schedule', href:'/admin/schedule/', icon:'schedule', label:'Schedule' },
    { section:'Financials' },
    { key:'estimates', href:'/admin/estimates/', icon:'estimates', label:'Estimates' },
    { key:'invoices', href:'/admin/invoices/', icon:'invoices', label:'Invoices' },
    { section:'Company' },
    { key:'team', href:'/admin/team/', icon:'team', label:'Team' },
    { key:'reports', href:'/admin/reports/', icon:'reports', label:'Reports' },
    { key:'settings', href:'/admin/settings/', icon:'settings', label:'Settings' },
  ];
  const cfg = getDB().settings;
  const nav = items.map(i => {
    if(i.section) return '<div class="nav-section">' + i.section + '</div>';
    const active_cls = i.key === active ? ' active' : '';
    const b = i.badge ? '<span class="badge">' + i.badge + '</span>' : '';
    return '<a href="' + i.href + '" class="nav-link' + active_cls + '"><span class="icon">' + svgIcon(i.icon) + '</span>' + i.label + b + '</a>';
  }).join('');
  return ''
    + '<aside class="sidebar">'
    +   '<div class="brand">'
    +     '<a href="/admin/"><div><div class="logo">MASON HOMES</div><span class="tag">Admin · CRM</span></div></a>'
    +   '</div>'
    +   '<nav>' + nav + '</nav>'
    +   '<div class="user-block">'
    +     '<div class="user"><div class="avatar">M</div><div><div class="name">' + cfg.company_name + '</div><div class="role">Owner</div></div></div>'
    +     '<div class="actions">'
    +       '<a href="/" title="Back to site">' + svgIcon('external') + ' Site</a>'
    +       '<a href="#" id="logout-link">' + svgIcon('logout') + ' Logout</a>'
    +     '</div>'
    +   '</div>'
    + '</aside>';
}

function renderTopbar(title, actionsHTML){
  return ''
    + '<div class="topbar">'
    +   '<div class="page-title">' + title + '</div>'
    +   '<div class="search"><span class="icon">' + svgIcon('search') + '</span><input type="search" placeholder="Search leads, projects, clients..."/></div>'
    +   '<div class="topbar-actions">' + (actionsHTML||'')
    +     '<button class="icon-btn" title="Notifications">' + svgIcon('bell') + '<span class="dot"></span></button>'
    +   '</div>'
    + '</div>';
}

function renderLayout(pageKey, title, actions){
  const db = getDB();
  const badges = { leads: db.leads.filter(l => l.status === 'new').length || null, tasks: db.tasks.filter(t => t.status === 'todo').length || null };
  return renderSidebar(pageKey, badges) + '<main class="main">' + renderTopbar(title, actions) + '<div class="content" id="content"></div></main>';
}

// ---------- BOOT ----------
window.mhBoot = function(pageKey, title, mount){
  document.body.innerHTML = '<div class="admin">' + renderLayout(pageKey, title) + '</div>';
  // "Logout" for HTTP Basic Auth: browsers manage the credential cache,
  // so the cleanest exit is navigating off the admin. Closing the tab
  // fully clears the cached credentials.
  document.getElementById('logout-link').addEventListener('click', function(e){
    e.preventDefault();
    location.href = '/';
  });
  mount(document.getElementById('content'));
};

// ---------- CHART primitives (pure SVG, no dependencies) ----------
function bars(data, opts){
  opts = opts || {};
  const w = opts.width || 640, h = opts.height || 240;
  const pad = { t:20, r:20, b:36, l:44 };
  const iw = w - pad.l - pad.r, ih = h - pad.t - pad.b;
  const max = Math.max.apply(null, data.map(d => d.value)) || 1;
  const bw = iw / data.length * 0.68;
  const gap = iw / data.length * 0.32;
  const barW = iw / data.length - gap;
  const bars = data.map((d,i) => {
    const x = pad.l + i * (barW + gap) + gap/2;
    const bh = (d.value/max) * ih;
    const y = pad.t + ih - bh;
    return ''
      + '<rect x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" width="' + barW.toFixed(1) + '" height="' + bh.toFixed(1) + '" fill="#c8623c" rx="1"><title>' + d.label + ': ' + d.value + '</title></rect>'
      + '<text x="' + (x + barW/2).toFixed(1) + '" y="' + (pad.t + ih + 20).toFixed(1) + '" text-anchor="middle" class="label">' + d.label + '</text>';
  }).join('');
  // Y gridlines
  const grid = [0.25, 0.5, 0.75, 1].map(f => {
    const y = pad.t + ih * (1 - f);
    return ''
      + '<line x1="' + pad.l + '" y1="' + y + '" x2="' + (pad.l+iw) + '" y2="' + y + '" class="gridline"/>'
      + '<text x="' + (pad.l - 8) + '" y="' + (y+3) + '" text-anchor="end" class="label">' + Math.round(max*f).toLocaleString() + '</text>';
  }).join('');
  return '<svg viewBox="0 0 ' + w + ' ' + h + '" preserveAspectRatio="none">' + grid + bars + '</svg>';
}

function sparkline(values, opts){
  opts = opts || {};
  const w = opts.width || 160, h = opts.height || 36;
  const min = Math.min.apply(null, values), max = Math.max.apply(null, values);
  const range = max - min || 1;
  const step = w / (values.length - 1 || 1);
  let d = 'M ';
  values.forEach((v,i) => {
    const x = i * step;
    const y = h - ((v - min) / range) * (h - 4) - 2;
    d += (i === 0 ? '' : 'L ') + x.toFixed(1) + ' ' + y.toFixed(1) + ' ';
  });
  // area under curve
  const last = (values.length - 1) * step;
  const area = d + 'L ' + last.toFixed(1) + ' ' + h + ' L 0 ' + h + ' Z';
  return '<svg viewBox="0 0 ' + w + ' ' + h + '" preserveAspectRatio="none" class="sparkline"><path d="' + area + '" fill="#c8623c" opacity=".14"/><path d="' + d + '" fill="none" stroke="#c8623c" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
}

function donut(segments, opts){
  opts = opts || {};
  const size = opts.size || 180, r = size/2 - 12, cx = size/2, cy = size/2, sw = 24;
  const total = segments.reduce((s,x) => s + x.value, 0) || 1;
  let cum = 0;
  const arcs = segments.map(seg => {
    const frac = seg.value / total;
    const startA = cum * 2 * Math.PI - Math.PI/2;
    cum += frac;
    const endA = cum * 2 * Math.PI - Math.PI/2;
    const x1 = cx + r * Math.cos(startA), y1 = cy + r * Math.sin(startA);
    const x2 = cx + r * Math.cos(endA), y2 = cy + r * Math.sin(endA);
    const largeArc = frac > 0.5 ? 1 : 0;
    return '<path d="M ' + x1 + ' ' + y1 + ' A ' + r + ' ' + r + ' 0 ' + largeArc + ' 1 ' + x2 + ' ' + y2 + '" stroke="' + seg.color + '" stroke-width="' + sw + '" fill="none" stroke-linecap="butt"><title>' + seg.label + ': ' + seg.value + '</title></path>';
  }).join('');
  return '<svg viewBox="0 0 ' + size + ' ' + size + '" style="width:' + size + 'px;height:' + size + 'px">' + arcs + '<text x="' + cx + '" y="' + (cy-4) + '" text-anchor="middle" class="value-label" style="font-family:Cormorant Garamond,serif;font-size:26px;font-weight:300;fill:#1a1814">' + total + '</text><text x="' + cx + '" y="' + (cy+16) + '" text-anchor="middle" class="label">Total</text></svg>';
}

window.mhCharts = { bars, sparkline, donut };
window.mhIcon = svgIcon;

// Global search — simple filter across leads/projects
document.addEventListener('input', function(e){
  if(e.target.matches('.topbar .search input')){
    const q = e.target.value.trim().toLowerCase();
    document.querySelectorAll('.data-table tbody tr').forEach(function(row){
      if(!q){ row.style.display = ''; return; }
      row.style.display = row.textContent.toLowerCase().includes(q) ? '' : 'none';
    });
  }
});

// Drawer (lead/project detail)
window.mhDrawer = {
  open: function(html){
    let d = document.getElementById('mh-drawer');
    if(!d){
      d = document.createElement('div');
      d.className = 'modal-backdrop';
      d.id = 'mh-drawer';
      document.body.appendChild(d);
      d.addEventListener('click', function(e){
        if(e.target === d) window.mhDrawer.close();
      });
      document.addEventListener('keydown', function(e){
        if(e.key === 'Escape') window.mhDrawer.close();
      });
    }
    d.innerHTML = '<div class="drawer">' + html + '</div>';
    setTimeout(function(){ d.classList.add('open'); }, 20);
    const closeBtn = d.querySelector('.drawer-close');
    if(closeBtn) closeBtn.addEventListener('click', window.mhDrawer.close);
  },
  close: function(){
    const d = document.getElementById('mh-drawer');
    if(d) d.classList.remove('open');
  }
};

})();
