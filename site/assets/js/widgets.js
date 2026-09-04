/* ============================================================
   MASON HOMES WIDGETS — chat concierge, instant estimate, FAB
   Vanilla JS, no dependencies. Persists chat to localStorage.
   Submits leads to Netlify Forms.
   ============================================================ */
(function(){
'use strict';

// -------- Announcement bar --------
if(!sessionStorage.getItem('mh_announce_dismissed')){
  var ab = document.createElement('div');
  ab.className = 'announce-bar';
  ab.innerHTML = '<a class="ab-phone" href="tel:+18139995910"><span class="ab-icon" aria-hidden="true">☎</span>(813) 999-5910</a><span class="ab-sep" aria-hidden="true">·</span><strong class="ab-narrow-hide">Licensed FL General Contractor · CGC062538</strong><span class="ab-sep ab-narrow-hide" aria-hidden="true">·</span><span class="ab-narrow-hide">Meetings by appointment.</span><span class="ab-sep" aria-hidden="true">·</span><a href="/free-estimate/">Start a Project →</a><button class="close" aria-label="Dismiss">×</button>';
  document.body.insertBefore(ab, document.body.firstChild);
  ab.querySelector('.close').addEventListener('click', function(){
    document.body.classList.add('announce-hidden');
    sessionStorage.setItem('mh_announce_dismissed', '1');
  });
} else {
  document.body.classList.add('announce-hidden');
}

// -------- Skip nav --------
var skip = document.createElement('a');
skip.className = 'skip-nav';
skip.href = '#main';
skip.textContent = 'Skip to main content';
document.body.insertBefore(skip, document.body.firstChild);

// -------- FAB --------
var fab = document.createElement('div');
fab.className = 'fab';
fab.innerHTML = ''
+ '<div class="fab-actions">'
+   '<a class="fab-action" href="tel:+18139995910"><span class="icon">☎</span>Call (813) 999-5910</a>'
+   '<button class="fab-action" data-open="estimate"><span class="icon">$</span>Instant Estimate</button>'
+   '<button class="fab-action" data-open="chat"><span class="icon">✦</span>Chat with Mason</button>'
+ '</div>'
+ '<button class="fab-toggle" aria-label="Open menu">'
+   '<span class="fab-badge"></span>'
+   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>'
+ '</button>';
document.body.appendChild(fab);
var fabToggle = fab.querySelector('.fab-toggle');
fabToggle.addEventListener('click', function(){ fab.classList.toggle('open'); });
document.addEventListener('click', function(e){
  if(!fab.contains(e.target) && fab.classList.contains('open')){ fab.classList.remove('open'); }
});

// -------- Modal helpers --------
function makeModal(cls, html){
  var b = document.createElement('div');
  b.className = 'modal-backdrop';
  b.innerHTML = '<div class="modal '+cls+'">'+html+'</div>';
  document.body.appendChild(b);
  b.addEventListener('click', function(e){
    if(e.target === b) closeModal(b);
  });
  return b;
}
function openModal(m){
  m.classList.add('open');
  document.documentElement.style.overflow = 'hidden';
  fab.classList.remove('open');
}
function closeModal(m){
  m.classList.remove('open');
  document.documentElement.style.overflow = '';
}
document.addEventListener('keydown', function(e){
  if(e.key === 'Escape'){
    document.querySelectorAll('.modal-backdrop.open').forEach(closeModal);
  }
});

// -------- CHAT WIDGET --------
var chatModal = makeModal('chat-modal',
    '<div class="chat-header">'
  +   '<div class="chat-avatar">M</div>'
  +   '<div class="chat-title"><strong>Mason</strong><span>Mason Homes Concierge</span></div>'
  +   '<button class="modal-close" aria-label="Close">×</button>'
  + '</div>'
  + '<div class="chat-body" id="chat-body"></div>'
  + '<div class="chat-chips" id="chat-chips"></div>'
  + '<div class="chat-input-row" id="chat-input-row" style="display:none">'
  +   '<input type="text" id="chat-input" placeholder="Type your reply..."/>'
  +   '<button id="chat-send" aria-label="Send">'
  +     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>'
  +   '</button>'
  + '</div>'
  + '<div class="chat-footer">Powered by <strong>Mason Homes</strong> · CGC062538</div>'
);
chatModal.querySelector('.modal-close').addEventListener('click', function(){ closeModal(chatModal); });

var chatBody = chatModal.querySelector('#chat-body');
var chatChips = chatModal.querySelector('#chat-chips');
var chatInputRow = chatModal.querySelector('#chat-input-row');
var chatInput = chatModal.querySelector('#chat-input');
var chatSend = chatModal.querySelector('#chat-send');

var chatState = { step: 0, answers: {} };

function addBotMsg(text, cb){
  // typing indicator
  var t = document.createElement('div');
  t.className = 'chat-typing show';
  t.innerHTML = '<span></span><span></span><span></span>';
  chatBody.appendChild(t);
  chatBody.scrollTop = chatBody.scrollHeight;
  setTimeout(function(){
    t.remove();
    var m = document.createElement('div');
    m.className = 'chat-msg bot';
    m.innerHTML = text;
    chatBody.appendChild(m);
    chatBody.scrollTop = chatBody.scrollHeight;
    if(cb) setTimeout(cb, 250);
  }, 700 + Math.min(text.length * 12, 1200));
}
function addUserMsg(text){
  var m = document.createElement('div');
  m.className = 'chat-msg user';
  m.textContent = text;
  chatBody.appendChild(m);
  chatBody.scrollTop = chatBody.scrollHeight;
}
function showChips(options){
  chatChips.innerHTML = '';
  chatInputRow.style.display = 'none';
  options.forEach(function(opt){
    var c = document.createElement('button');
    c.className = 'chat-chip';
    c.textContent = opt;
    c.addEventListener('click', function(){
      addUserMsg(opt);
      chatChips.innerHTML = '';
      handleAnswer(opt);
    });
    chatChips.appendChild(c);
  });
}
function showInput(placeholder, cb){
  chatChips.innerHTML = '';
  chatInputRow.style.display = 'flex';
  chatInput.value = '';
  chatInput.placeholder = placeholder;
  chatInput.focus();
  var handler = function(){
    var v = chatInput.value.trim();
    if(!v) return;
    addUserMsg(v);
    chatInputRow.style.display = 'none';
    cb(v);
  };
  chatSend.onclick = handler;
  chatInput.onkeypress = function(e){ if(e.key === 'Enter') handler(); };
}

var chatFlow = [
  { q: "Hi — I'm Mason, your Mason Homes concierge. I'll help match you with the right service and get a real estimate started. First — what kind of project are you considering?",
    field: 'project',
    chips: ['Kitchen','Bathroom','Whole Home','Addition','Custom Build','ADU','Something Else'] },
  { q: "Great choice. Roughly what budget range are you working with? (Everything stays confidential.)",
    field: 'budget',
    chips: ['Under $25K','$25K – $50K','$50K – $100K','$100K – $250K','$250K+','Not sure yet'] },
  { q: "Timing helps us plan. When would you ideally like to start?",
    field: 'timeline',
    chips: ['This month','Next 3 months','Next 6 months','Just researching'] },
  { q: "Which area is the project in? We serve Hillsborough, Pinellas, Pasco, Manatee, and Sarasota counties.",
    field: 'location',
    chips: ['South Tampa','Tampa','Carrollwood','Brandon','Wesley Chapel','St. Petersburg','Clearwater','Other Tampa Bay'] },
  { q: "Perfect. Last few things — what's your first name?", field: 'name', input: 'Your name' },
  { q: "Thanks. What's the best phone number to reach you?", field: 'phone', input: '(813) 555-0123' },
  { q: "And your email? I'll send you a written summary of what we discussed plus example project photos.", field: 'email', input: 'you@example.com' }
];

function handleAnswer(v){
  var step = chatFlow[chatState.step];
  chatState.answers[step.field] = v;
  chatState.step++;
  if(chatState.step < chatFlow.length){
    askNext();
  } else {
    submitChat();
  }
}
function askNext(){
  var step = chatFlow[chatState.step];
  addBotMsg(step.q, function(){
    if(step.chips) showChips(step.chips);
    else if(step.input) showInput(step.input, handleAnswer);
  });
}

function submitChat(){
  addBotMsg("One moment — I'm getting a real person notified for you...", function(){
    // Submit to Supabase via the /api/lead-submit Vercel function
    var payload = Object.assign({}, chatState.answers, {
      'form-name': 'mason-chat',
      _form_source: 'chat_widget',
      source: 'chat_widget',
      page: window.location.pathname
    });
    fetch('/api/lead-submit', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify(payload)
    })
      .then(function(){ showChatSuccess(); })
      .catch(function(){ showChatSuccess(); }); // still show success — user has our number
  });
}

function showChatSuccess(){
  chatBody.innerHTML = '';
  chatChips.innerHTML = '';
  chatInputRow.style.display = 'none';
  var wrap = document.createElement('div');
  wrap.className = 'chat-success';
  wrap.innerHTML = '<div class="icon">✓</div><h3>You’re all <em>set</em>.</h3><p>Our team will follow up shortly. If you can’t wait, call us directly:</p><a href="tel:+18139995910">(813) 999-5910 &rarr;</a>';
  chatBody.appendChild(wrap);
  // clear localStorage
  localStorage.removeItem('mh_chat_state');
}

function startChat(){
  chatBody.innerHTML = '';
  chatChips.innerHTML = '';
  chatInputRow.style.display = 'none';
  chatState = { step: 0, answers: {} };
  askNext();
}

// -------- ESTIMATE WIDGET --------
var estimateModal = makeModal('est-modal',
    '<button class="modal-close" aria-label="Close" style="position:absolute;top:22px;right:22px;background:none;border:0;color:var(--muted);cursor:pointer;width:36px;height:36px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-size:22px;line-height:1;font-family:Inter,sans-serif;font-weight:200;z-index:3">×</button>'
  + '<div class="est-header">'
  +   '<div class="eyebrow">Ballpark Estimator</div>'
  +   '<h3>Get an <em>instant</em> ballpark.</h3>'
  + '</div>'
  + '<div class="est-body" id="est-body">'
  +   '<div class="est-field">'
  +     '<label>Project Type</label>'
  +     '<select id="est-type">'
  +       '<option value="kitchen">Kitchen Remodel</option>'
  +       '<option value="bathroom">Bathroom Remodel</option>'
  +       '<option value="whole-home">Whole-Home Renovation</option>'
  +       '<option value="addition">Home Addition</option>'
  +       '<option value="custom">Custom Home Build</option>'
  +       '<option value="adu">ADU Construction</option>'
  +       '<option value="flooring">Flooring Installation</option>'
  +     '</select>'
  +   '</div>'
  +   '<div class="est-field">'
  +     '<label>Scope</label>'
  +     '<select id="est-scope">'
  +       '<option value="basic">Basic — cosmetic refresh</option>'
  +       '<option value="mid" selected>Mid-Range — full but standard finishes</option>'
  +       '<option value="high">High-End — custom finishes and layout changes</option>'
  +     '</select>'
  +   '</div>'
  +   '<div class="est-field" id="est-sqft-field">'
  +     '<label>Approximate Square Footage</label>'
  +     '<input type="number" id="est-sqft" value="200" min="50" max="5000"/>'
  +   '</div>'
  +   '<div class="est-result" id="est-result">'
  +     '<div class="label">Estimated Range</div>'
  +     '<div class="range" id="est-range">$25,000 – $60,000</div>'
  +     '<div class="note">Based on 2026 Tampa market data. Real projects vary based on scope, permits, and material selections — click below for a fixed-scope quote.</div>'
  +   '</div>'
  +   '<button class="est-btn" onclick="window.location.href=\'/free-estimate/\'"><span>Get a Real Fixed-Scope Estimate</span></button>'
  + '</div>'
);
estimateModal.querySelector('.modal-close').addEventListener('click', function(){ closeModal(estimateModal); });

// Estimate calculator
var priceMatrix = {
  kitchen:   { basic: [10000, 25000],  mid: [25000, 60000],  high: [60000, 120000] },
  bathroom:  { basic: [4000, 14000],   mid: [18000, 45000],  high: [45000, 75000] },
  'whole-home': { basic: [50000, 150000], mid: [150000, 350000], high: [300000, 700000] },
  addition:  { basic: [15000, 40000],  mid: [40000, 120000], high: [120000, 300000] },
  custom:    { basic: [300000, 500000], mid: [500000, 900000], high: [800000, 1500000] },
  adu:       { basic: [40000, 100000], mid: [80000, 180000], high: [150000, 250000] },
  flooring:  { basic: [3000, 8000],    mid: [8000, 18000],   high: [18000, 40000] }
};
var sqftScaling = { // multiplies base by sqft factor for scale-based projects
  addition: true, custom: true, adu: true, flooring: true, 'whole-home': true
};
var sqftBase = { addition: 400, custom: 2500, adu: 600, flooring: 1000, 'whole-home': 2000 };

function fmt(n){ return '$' + Math.round(n/1000)*1 + 'K'; }
function fmtRange(a,b){ return fmt(a) + ' – ' + fmt(b) + (b >= 100000 ? '+' : ''); }

function calcEst(){
  var type = document.getElementById('est-type').value;
  var scope = document.getElementById('est-scope').value;
  var sqft = parseInt(document.getElementById('est-sqft').value) || 200;
  var base = priceMatrix[type][scope];
  var lo = base[0], hi = base[1];
  if(sqftScaling[type] && sqftBase[type]){
    var factor = sqft / sqftBase[type];
    lo = Math.round(lo * factor);
    hi = Math.round(hi * factor);
  }
  document.getElementById('est-range').innerHTML = '<em>' + fmtRange(lo, hi) + '</em>';
  var sqftField = document.getElementById('est-sqft-field');
  sqftField.style.display = (type === 'kitchen' || type === 'bathroom') ? 'none' : 'block';
}
['est-type','est-scope','est-sqft'].forEach(function(id){
  document.getElementById(id).addEventListener('change', calcEst);
  document.getElementById(id).addEventListener('input', calcEst);
});
calcEst();

// -------- Open handlers --------
fab.querySelectorAll('[data-open]').forEach(function(el){
  el.addEventListener('click', function(){
    var type = el.dataset.open;
    if(type === 'chat'){ openModal(chatModal); startChat(); }
    else if(type === 'estimate'){ openModal(estimateModal); }
  });
});

// Also allow other elements sitewide to open the widgets
document.addEventListener('click', function(e){
  var target = e.target.closest('[data-widget]');
  if(!target) return;
  e.preventDefault();
  var t = target.dataset.widget;
  if(t === 'chat'){ openModal(chatModal); startChat(); }
  else if(t === 'estimate'){ openModal(estimateModal); }
});

// -------- Site-wide form submit handler --------
// Any <form data-submit-endpoint="/api/lead-submit"> is intercepted here,
// serialized to JSON and POSTed to Supabase via the Vercel function.
document.addEventListener('submit', function(e){
  var form = e.target;
  if(!form.matches || !form.matches('form[data-submit-endpoint]')) return;
  e.preventDefault();

  var endpoint = form.dataset.submitEndpoint;
  var successMsg = form.dataset.successMessage || 'Thank you — we’ll follow up shortly.';
  var button = form.querySelector('button[type="submit"],input[type="submit"]');
  var originalLabel = button ? button.innerHTML : null;
  if(button){ button.disabled = true; button.innerHTML = 'Sending…'; }

  var data = {};
  new FormData(form).forEach(function(v, k){ data[k] = v; });
  data.page = data.page || window.location.pathname;

  fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  })
    .then(function(r){ return r.json().catch(function(){ return { ok:false }; }); })
    .then(function(res){
      if(res && res.ok){
        showFormSuccess(form, successMsg);
      } else {
        if(button){ button.disabled = false; button.innerHTML = originalLabel; }
        alert('Sorry — that didn’t go through. Please call (813) 999-5910 or try again.');
      }
    })
    .catch(function(){
      if(button){ button.disabled = false; button.innerHTML = originalLabel; }
      alert('Sorry — network issue. Please call (813) 999-5910 or try again.');
    });
});

function showFormSuccess(form, msg){
  var note = document.createElement('div');
  note.style.cssText = 'padding:20px 22px;background:rgba(200,98,60,.08);border-left:3px solid var(--bronze,#c8623c);border-radius:2px;font-family:"Inter",sans-serif;font-size:15px;color:var(--charcoal,#1a1814);line-height:1.55;margin:12px 0';
  note.innerHTML = '<strong style="display:block;margin-bottom:6px;font-family:\'JetBrains Mono\',monospace;font-size:11px;letter-spacing:.22em;text-transform:uppercase;color:var(--bronze,#c8623c);font-weight:500">Received</strong>' + msg;
  form.replaceWith(note);
}

})();
