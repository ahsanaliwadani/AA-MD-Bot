// ══════════════════════════════════════════════════════════
//  STATE
// ══════════════════════════════════════════════════════════
let _sessions = [], _stats = {}, _settings = {}, _startMs = 0;
let _uptimeInterval = null, _sseSource = null;
let _logAutoScroll = true, _logLevel = 'all', _logLastTs = 0, _logInterval = null;
let _allLogLines = [];
let _bcHistory = [];

const PAGE_META = {
  overview:  ['Overview',   'Bot stats and sessions at a glance'],
  sessions:  ['Sessions',   'Manage all connected WhatsApp numbers'],
  broadcast: ['Broadcast',  'Send messages to connected sessions'],
  moviebox:  ['MovieBox',   'Browse public-domain films and rights-aware download sources'],
  accesskeys:['Access Keys','Generate, search, assign, activate, suspend, revoke and view lifetime access keys'],
  database:  ['Database',   'View and manage all bot database collections'],
  logs:      ['Live Logs',  'Real-time bot log stream'],
  settings:  ['Settings',   'Configure bot behavior and features'],
  pair:      ['Add Number', 'Connect a new WhatsApp number via pairing code'],
};

// ══════════════════════════════════════════════════════════
//  INIT
// ══════════════════════════════════════════════════════════
window.addEventListener('DOMContentLoaded', async () => {
  // Always load public stats for landing
  loadLandingStats();
  loadLandingSessions();
  startLandingSSE();

  // Check if already logged in
  const r = await fetch('/auth/check').then(r=>r.json()).catch(()=>({ok:false}));
  if (r.ok) showApp();
});

// ══════════════════════════════════════════════════════════
//  LANDING PAGE
// ══════════════════════════════════════════════════════════
async function loadLandingStats() {
  try {
    const d = await fetch('/api').then(r=>r.json());
    document.getElementById('lConnected').textContent = d.sessions ?? '—';
    document.getElementById('lPlugins').textContent   = d.plugins  ?? '—';
    document.getElementById('lUptime').textContent    = d.uptime   ?? '—';
  } catch {}
}

async function loadLandingSessions() {
  try {
    const d = await fetch('/status').then(r=>r.json());
    const sessions = d.sessions || [];
    const el = document.getElementById('lSessions');
    if (!sessions.length) { el.innerHTML='<div style="color:var(--text2);font-size:.84rem;text-align:center;padding:16px">No sessions connected yet.</div>'; return; }
    el.innerHTML = `<div class="mini-sessions">${sessions.map(s=>{
      const dc = s.status!=='connected';
      const init = (s.phone||s.id||'?').replace(/\D/g,'').slice(-2)||'??';
      return `<div class="mini-card">
        <div class="mini-avatar ${dc?'dc':''}">${init}</div>
        <div class="mini-info">
          <div class="mini-phone">+${s.phone||s.id}</div>
          <div class="mini-status ${dc?'dc':''}"><span class="mini-dot"></span>${s.status}</div>
        </div>
      </div>`;
    }).join('')}</div>`;
  } catch { document.getElementById('lSessions').innerHTML='<div style="color:var(--text2);font-size:.84rem;text-align:center;padding:16px">Could not load sessions.</div>'; }
}

function startLandingSSE() {
  const es = new EventSource('/events');
  es.addEventListener('pairingCode', e => {
    const {code} = JSON.parse(e.data);
    document.getElementById('lPairCode').textContent = code;
    document.getElementById('lPairBox').style.display = 'block';
    document.getElementById('lPairBtn').disabled = false;
    document.getElementById('lPairBtn').textContent = 'Get Code';
  });
  es.addEventListener('status', () => { loadLandingSessions(); loadLandingStats(); });
  es.onerror = () => { setTimeout(startLandingSSE, 6000); es.close(); };
}

async function landPair() {
  const phone = document.getElementById('lPhone').value.trim().replace(/\D/g,'');
  const errEl = document.getElementById('lPairErr');
  errEl.style.display='none';
  document.getElementById('lPairBox').style.display='none';
  if (!phone || phone.length<7) { errEl.textContent='Please enter a valid phone number'; errEl.style.display='block'; return; }
  const btn = document.getElementById('lPairBtn');
  btn.textContent='Getting…'; btn.disabled=true;
  const r = await fetch('/session/create',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:phone,method:'pairing',phoneNumber:phone})}).then(r=>r.json()).catch(()=>({ok:false,error:'Network error'}));
  if (!r.ok) { errEl.textContent=r.error||'Failed'; errEl.style.display='block'; btn.textContent='Get Code'; btn.disabled=false; }
  // Code arrives via SSE
}

function toggleAdminBox() {
  const box = document.getElementById('loginBox');
  const btn = document.getElementById('adminToggleBtn');
  const open = box.style.display === 'block';
  box.style.display = open ? 'none' : 'block';
  btn.classList.toggle('open', !open);
  if (!open) document.getElementById('pwInput').focus();
}

// ══════════════════════════════════════════════════════════
//  AUTH
// ══════════════════════════════════════════════════════════
async function doLogin() {
  const btn = document.getElementById('loginBtn');
  const txt = document.getElementById('loginBtnText');
  const err = document.getElementById('loginErr');
  const pw  = document.getElementById('pwInput').value;
  if (!pw) { showErr(err,'Password cannot be empty'); return; }
  err.style.display='none';
  txt.innerHTML = '<span class="spinner"></span>';
  btn.disabled = true;
  const r = await fetch('/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:pw})}).then(r=>r.json()).catch(()=>({ok:false,error:'Network error'}));
  if (r.ok) { showApp(); }
  else { showErr(err, r.error||'Incorrect password'); txt.textContent='Sign In to Admin Panel'; btn.disabled=false; }
}

async function doLogout() {
  await fetch('/auth/logout');
  location.reload();
}

function showErr(el,msg) { el.textContent=msg; el.style.display='block'; }

// ══════════════════════════════════════════════════════════
//  APP
// ══════════════════════════════════════════════════════════
async function showApp() {
  document.getElementById('landingView').style.display='none';
  const app = document.getElementById('app');
  app.style.display='flex';
  app.classList.add('visible');
  await loadAll();
  connectSSE();
  startUptimeTicker();
}

async function loadAll() {
  await Promise.all([loadStats(), loadSessions(), loadSettings(), loadStorage(), loadAccessKeys()]);
  renderOverview();
}

async function loadStats() {
  try {
    const d = await fetch('/admin/stats').then(r=>r.json());
    _stats = d;
    _startMs = Date.now() - (d.uptimeMs||0);
    document.getElementById('sbBotName').textContent = d.botName||'AA MD Bot';
    document.getElementById('sbVer').textContent = 'v'+(d.version||'3.0.0');
  } catch {}
}

async function loadSessions() {
  try {
    const d = await fetch('/admin/sessions').then(r=>r.json());
    _sessions = d.sessions||[];
    updateSessionBadge();
    updateBcTargetSelect();
  } catch {}
}

async function loadSettings() {
  try {
    const d = await fetch('/admin/settings').then(r=>r.json());
    _settings = d;
    applySettingsToForm(d);
  } catch {}
}

// ══════════════════════════════════════════════════════════
//  SSE
// ══════════════════════════════════════════════════════════
function connectSSE() {
  if (_sseSource) _sseSource.close();
  _sseSource = new EventSource('/events');
  _sseSource.addEventListener('status', e => {
    const {sessionId, status} = JSON.parse(e.data);
    const idx = _sessions.findIndex(s=>s.id===sessionId);
    if (idx>=0) _sessions[idx].status = status;
    else _sessions.push({id:sessionId,phone:sessionId,status});
    updateSessionBadge();
    updateBcTargetSelect();
    if (document.getElementById('page-sessions').classList.contains('active')) renderSessions();
    if (document.getElementById('page-overview').classList.contains('active')) renderOverviewSessions();
  });
  _sseSource.addEventListener('pairingCode', e => {
    const {code} = JSON.parse(e.data);
    if (document.getElementById('page-pair').classList.contains('active')) {
      document.getElementById('pairBtnText').textContent='Get Pairing Code';
      document.getElementById('pairBtn').disabled=false;
      document.getElementById('pairCodeVal').textContent = code;
      document.getElementById('pairCodeBox').style.display='block';
      document.getElementById('pairErr').style.display='none';
    }
  });
  _sseSource.addEventListener('pairingCodeError', e => {
    const {error} = JSON.parse(e.data);
    if (document.getElementById('page-pair').classList.contains('active')) {
      document.getElementById('pairBtnText').textContent='Get Pairing Code';
      document.getElementById('pairBtn').disabled=false;
      const errEl = document.getElementById('pairErr');
      errEl.innerHTML = `⚠️ ${error||'Pairing failed'} — <a href="#" onclick="doPair();return false;" style="color:inherit;text-decoration:underline">Tap to retry</a>`;
      errEl.style.display='block';
    }
  });
  _sseSource.onerror = () => { setTimeout(connectSSE, 5000); };
}

function updateSessionBadge() {
  const connected = _sessions.filter(s=>s.status==='connected').length;
  const badge = document.getElementById('sessionBadge');
  badge.textContent = connected;
  badge.className   = 'nav-badge'+(connected===0?' red':'');
}

// ══════════════════════════════════════════════════════════
//  RENDER
// ══════════════════════════════════════════════════════════
function renderOverview() {
  const connected = _sessions.filter(s=>s.status==='connected').length;
  document.getElementById('ovConnected').textContent = connected;
  document.getElementById('ovPlugins').textContent   = _stats.plugins   || 0;
  document.getElementById('ovRam').textContent       = _stats.ram       || 0;
  document.getElementById('ovRamTotal').textContent  = _stats.ramTotal  || 0;
  document.getElementById('ovGroups').textContent    = _stats.groups    || 0;
  document.getElementById('ovUptime').textContent    = _stats.uptime    || '—';
  if (_stats.serverId) document.getElementById('ovServerId').textContent = _stats.serverId;
  if (_stats.version)  document.getElementById('ovBotVer').textContent   = 'v' + _stats.version;
  document.getElementById('ovTotalPlugins').textContent = `${_stats.plugins||0} total`;
  const catsEl = document.getElementById('ovCats');
  catsEl.innerHTML = '';
  for (const [cat,count] of Object.entries(_stats.categories||{})) {
    const pill=document.createElement('div'); pill.className='cat-pill';
    pill.innerHTML=`<strong>${count}</strong> ${cat}`;
    catsEl.appendChild(pill);
  }
  renderOverviewSessions();
}

function renderOverviewSessions() {
  const connected = _sessions.filter(s=>s.status==='connected');
  const el = document.getElementById('ovSessions');
  document.getElementById('ovSessionMeta').textContent = `${connected.length} of ${_sessions.length} online`;
  if (!connected.length) { el.innerHTML=emptyState('No connected numbers. Use <em>Add Number</em> to get started.'); return; }
  el.innerHTML = connected.map(sessionCardHTML).join('');
}

function renderSessions() {
  const el = document.getElementById('sessionsGrid');
  const connected = _sessions.filter(s=>s.status==='connected').length;
  document.getElementById('sessionsSubtitle').textContent = `${connected} connected · ${_sessions.length} total`;
  if (!_sessions.length) { el.innerHTML=emptyState('No sessions. Add a number to get started.'); return; }
  el.innerHTML = _sessions.map(sessionCardHTML).join('');
}

function renderPairSessions() {
  const el = document.getElementById('pairSessions');
  if (!_sessions.length) { el.innerHTML='<div style="color:var(--text2);font-size:.84rem">No sessions yet.</div>'; return; }
  el.innerHTML = _sessions.map(sessionCardHTML).join('');
}

function sessionCardHTML(s) {
  const ok    = s.status==='connected';
  const init  = (s.phone||s.id||'?').replace(/\D/g,'').slice(-2)||'??';
  const phone = s.phone ? '+'+s.phone : s.id;
  const name  = s.name||'WhatsApp';
  const time  = s.connectedAt ? timeSince(s.connectedAt) : '—';
  const bc    = ok?'connected':(s.status==='connecting'||s.status==='reconnecting'?'reconnecting':'disconnected');
  return `<div class="session-card ${ok?'':'disconnected'}" data-session="${s.id}">
    <div class="sc-top">
      <div class="sc-avatar ${ok?'':'dc'}">${init}</div>
      <div class="sc-info">
        <div class="sc-phone">${escHtml(phone)}</div>
        <div class="sc-name">${escHtml(name)}</div>
      </div>
    </div>
    <div style="display:flex;align-items:center;gap:7px;flex-wrap:wrap">
      <span class="sc-badge ${bc}"><span class="sc-badge-dot"></span>${s.status||'unknown'}</span>
      <span style="font-size:.7rem;color:var(--text3);font-family:monospace">${escHtml(s.id)}</span>
    </div>
    <div class="sc-meta">
      <span class="sc-time">${ok?'Connected '+time:s.status}</span>
      <button class="btn-disconnect" onclick="disconnectSession('${escHtml(s.id)}')" ${!ok?'disabled':''}>Disconnect</button>
    </div>
  </div>`;
}

function emptyState(msg) {
  return `<div class="empty-state"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="width:44px;height:44px;color:var(--text3);margin-bottom:12px"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg><p>${msg}</p></div>`;
}

// ══════════════════════════════════════════════════════════
//  SETTINGS
// ══════════════════════════════════════════════════════════
function applySettingsToForm(d) {
  const prefix = Array.isArray(d.prefix)?d.prefix[0]:(d.prefix||'.');
  document.getElementById('setPrefixInput').value = prefix;
  const modeValue = d.botMode === 'self' ? 'private' : (d.botMode || 'public');
  const modeEl = document.querySelector(`input[name="botMode"][value="${modeValue}"]`);
  if (modeEl) modeEl.checked = true;
  document.getElementById('setMaintenance').checked    = !!d.maintenanceMode;
  document.getElementById('setAccessKeysEnforced').checked = !!d.accessKeysEnforced;
  document.getElementById('setAccessKeyVerifyLimit').value = d.accessKeySecurity?.ACCESS_KEY_VERIFY_LIMIT || 5;
  document.getElementById('setAccessKeyVerifyWindow').value = d.accessKeySecurity?.ACCESS_KEY_VERIFY_WINDOW_MS || 900000;
  document.getElementById('setAccessKeyHashIterations').value = d.accessKeySecurity?.ACCESS_KEY_HASH_ITERATIONS || 210000;
  document.getElementById('setAccessKeyPepper').placeholder = d.accessKeySecurity?.ACCESS_KEY_PEPPER_SET ? 'Current pepper saved' : '<secret-pepper>';
  document.getElementById('setAccessKeyPepper').value = '';
  document.getElementById('setAutoRead').checked       = !!d.autoRead;
  document.getElementById('setAutoTyping').checked     = !!d.autoTyping;
  document.getElementById('setAutoStatusView').checked = !!d.autoStatusView;
  document.getElementById('setAutoStatusReact').checked= !!d.autoStatusReact;
  document.getElementById('setWelcome').checked        = !!d.welcomeMessage;
  document.getElementById('setAntiSpam').checked       = !!d.antiSpam;
  document.getElementById('setAntiCall').checked       = !!d.antiCall;
  document.getElementById('setAntiDelete').checked     = !!d.antiDelete;
  document.getElementById('setAntiViewOnce').checked   = !!d.antiViewOnce;
  document.getElementById('setStatusEmoji').value      = d.statusEmoji||'❤️';
}

async function saveSettings() {
  const body = {
    prefix:          [document.getElementById('setPrefixInput').value||'.'],
    botMode:         document.querySelector('input[name="botMode"]:checked')?.value||'public',
    maintenanceMode: document.getElementById('setMaintenance').checked,
    accessKeysEnforced: document.getElementById('setAccessKeysEnforced').checked,
    ACCESS_KEYS_ENFORCED: document.getElementById('setAccessKeysEnforced').checked,
    ACCESS_KEY_VERIFY_LIMIT: Number(document.getElementById('setAccessKeyVerifyLimit').value || 5),
    ACCESS_KEY_VERIFY_WINDOW_MS: Number(document.getElementById('setAccessKeyVerifyWindow').value || 900000),
    ACCESS_KEY_HASH_ITERATIONS: Number(document.getElementById('setAccessKeyHashIterations').value || 210000),
    autoRead:        document.getElementById('setAutoRead').checked,
    autoTyping:      document.getElementById('setAutoTyping').checked,
    autoStatusView:  document.getElementById('setAutoStatusView').checked,
    autoStatusReact: document.getElementById('setAutoStatusReact').checked,
    welcomeMessage:  document.getElementById('setWelcome').checked,
    antiSpam:        document.getElementById('setAntiSpam').checked,
    antiCall:        document.getElementById('setAntiCall').checked,
    antiDelete:      document.getElementById('setAntiDelete').checked,
    antiViewOnce:    document.getElementById('setAntiViewOnce').checked,
    statusEmoji:     document.getElementById('setStatusEmoji').value||'❤️',
  };
  const pepper = document.getElementById('setAccessKeyPepper').value.trim();
  if (pepper) body.ACCESS_KEY_PEPPER = pepper;
  const r = await fetch('/admin/settings',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}).then(r=>r.json()).catch(()=>({ok:false}));
  if (r.ok) {
    const toast = document.getElementById('saveToast');
    toast.style.display='inline-flex';
    setTimeout(()=>toast.style.display='none', 3000);
  }
}

async function confirmRestart() {
  if (!confirm('Restart the bot process?\n\nThe bot will be offline for a few seconds during restart.')) return;
  const r = await fetch('/admin/restart',{method:'POST'}).then(r=>r.json()).catch(()=>({ok:false}));
  if (r.ok) alert('Bot is restarting — page will auto-reload in 5s.');
  setTimeout(()=>location.reload(), 5000);
}

// ══════════════════════════════════════════════════════════
//  SESSIONS ACTIONS
// ══════════════════════════════════════════════════════════
async function disconnectSession(id) {
  if (!confirm(`Disconnect this session?\n\nThis removes it from the bot. You can re-add it later.`)) return;
  const r = await fetch(`/admin/session/${encodeURIComponent(id)}`,{method:'DELETE'}).then(r=>r.json()).catch(()=>({ok:false}));
  if (r.ok) { _sessions = _sessions.filter(s=>s.id!==id); renderSessions(); renderOverviewSessions(); renderPairSessions(); updateBcTargetSelect(); }
  else alert('Failed: '+(r.error||'Unknown error'));
}

async function refreshSessions() { await loadSessions(); renderSessions(); }

// ══════════════════════════════════════════════════════════
//  BROADCAST
// ══════════════════════════════════════════════════════════
function updateBcTargetSelect() {
  const sel = document.getElementById('bcTarget');
  const cur = sel.value;
  sel.innerHTML = '<option value="">All connected sessions</option>';
  for (const s of _sessions.filter(x=>x.status==='connected')) {
    const opt = document.createElement('option');
    opt.value = s.id;
    opt.textContent = `+${s.phone||s.id} (${s.name||s.id})`;
    sel.appendChild(opt);
  }
  sel.value = cur;
}

// ── Broadcast image helpers ──────────────────────────────────────────────────
let _bcImageBase64 = null;
let _bcImageMime   = null;

function onBcImageChange(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (ev) => {
    const dataUrl = ev.target.result;
    _bcImageBase64 = dataUrl.split(',')[1];
    _bcImageMime   = file.type || 'image/jpeg';
    document.getElementById('bcImageName').textContent = file.name;
    document.getElementById('bcImagePreviewImg').src = dataUrl;
    document.getElementById('bcImagePreview').style.display = 'block';
    document.getElementById('bcImageClear').style.display = '';
  };
  reader.readAsDataURL(file);
}

function clearBcImage() {
  _bcImageBase64 = null;
  _bcImageMime   = null;
  document.getElementById('bcImage').value = '';
  document.getElementById('bcImageName').textContent = 'No image selected';
  document.getElementById('bcImagePreview').style.display = 'none';
  document.getElementById('bcImageClear').style.display = 'none';
}


// ══════════════════════════════════════════════════════════
//  ACCESS KEYS
// ══════════════════════════════════════════════════════════
function fmtTime(ts) { return ts ? new Date(ts).toLocaleString() : '—'; }

async function loadAccessKeys() {
  const body = document.getElementById('akBody');
  if (!body) return;
  const search = document.getElementById('akSearch')?.value || '';
  const d = await fetch('/admin/access-keys?search='+encodeURIComponent(search)).then(r=>r.json()).catch(()=>({ok:false,error:'Network error'}));
  if (!d.ok) {
    body.innerHTML = `<tr><td colspan="8" style="text-align:center;color:var(--red);padding:20px">${d.error || 'Unable to load access keys.'}</td></tr>`;
    return;
  }
  const keys = d.keys || [];
  if (!keys.length) { body.innerHTML = '<tr><td colspan="8" style="text-align:center;color:var(--text2);padding:20px">No access keys found.</td></tr>'; return; }
  body.innerHTML = keys.map(k => `<tr>
    <td>+${k.assignedPhone}</td><td>${k.plainKey ? `<code>${k.plainKey}</code><br><button class="btn-sm" onclick="copyAccessKey('${k.plainKey}')">Copy</button>` : '<span style="color:var(--text3)">Not saved</span>'}</td><td>${k.status}</td><td>${fmtTime(k.createdAt)}</td><td>${fmtTime(k.activatedAt)}</td><td>${fmtTime(k.expiresAt)}</td><td>${fmtTime(k.lastUsedAt)}</td>
    <td style="white-space:nowrap">
      <button class="btn-sm" onclick="accessKeyAction('${k.id}','regenerate')">Regenerate</button>
      <button class="btn-sm" onclick="accessKeyAction('${k.id}','activate')">Activate</button>
      <button class="btn-sm" onclick="assignAccessKeyUI('${k.id}', '${k.assignedPhone}')">Assign</button>
      <button class="btn-sm" onclick="accessKeyAction('${k.id}','suspend')">Suspend</button>
      <button class="btn-sm" onclick="accessKeyAction('${k.id}','revoke')">Revoke</button>
      <button class="btn-sm" onclick="viewAccessKeyHistory('${k.id}')">History</button>
      <button class="btn-sm" style="color:var(--red)" onclick="accessKeyAction('${k.id}','delete')">Delete</button>
    </td></tr>`).join('');
}

async function generateAccessKeyUI() {
  const phone = document.getElementById('akPhone').value.trim();
  const days = document.getElementById('akExpiry').value;
  const box = document.getElementById('akGenerated');
  box.style.display='block'; box.style.background='var(--surface2)'; box.style.color='var(--text2)'; box.textContent='Generating…';
  const payload = { phone, expiresInDays: days ? Number(days) : null };
  const r = await fetch('/admin/access-keys/generate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)}).then(r=>r.json()).catch(()=>({ok:false,error:'Network error'}));
  if (r.ok) { box.style.background='var(--green-dim)'; box.style.color='var(--green)'; box.innerHTML = `✅ Key generated and saved in database:<br><strong style="font-family:monospace;font-size:1.1rem">${r.accessKey}</strong><br><button class="btn-sm" onclick="copyAccessKey('${r.accessKey}')">Copy Key</button>`; document.getElementById('akPhone').value=''; loadAccessKeys(); }
  else { box.style.background='var(--red-dim)'; box.style.color='var(--red)'; box.textContent = r.error || 'Failed to generate key'; }
}

async function copyAccessKey(key) {
  try { await navigator.clipboard.writeText(key); alert('Access Key copied.'); }
  catch { prompt('Copy Access Key:', key); }
}

async function accessKeyAction(id, action) {
  if (!confirm(`${action} this access key?`)) return;
  const r = await fetch(`/admin/access-keys/${encodeURIComponent(id)}/${action}`,{method:'POST'}).then(r=>r.json()).catch(()=>({ok:false,error:'Network error'}));
  if (r.ok && r.accessKey) alert('Replacement key generated and saved in database. Copy now or from the Access Keys table:\n\n'+r.accessKey);
  else if (!r.ok) alert(r.error || 'Action failed');
  await loadAccessKeys();
}

async function assignAccessKeyUI(id, currentPhone) {
  const phone = prompt('Assign this access key to WhatsApp number:', currentPhone || '');
  if (!phone) return;
  const r = await fetch(`/admin/access-keys/${encodeURIComponent(id)}/assign`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ phone })}).then(r=>r.json()).catch(()=>({ok:false,error:'Network error'}));
  if (!r.ok) alert(r.error || 'Assign failed');
  await loadAccessKeys();
}

async function viewAccessKeyHistory(id) {
  const r = await fetch(`/admin/access-keys/${encodeURIComponent(id)}/history`,{method:'POST'}).then(r=>r.json()).catch(()=>({ok:false,error:'Network error'}));
  if (!r.ok) return alert(r.error || 'History failed');
  const lines = (r.history || []).map(h => `${fmtTime(h.at)} - ${h.action}${h.actor ? ' by '+h.actor : ''}${h.assignedPhone ? ' phone +'+h.assignedPhone : ''}${h.fromPhone ? ' from +'+h.fromPhone : ''}${h.reason ? ' ('+h.reason+')' : ''}`);
  alert(lines.length ? lines.join('\n') : 'No history recorded.');
}

// ══════════════════════════════════════════════════════════
//  STORAGE
// ══════════════════════════════════════════════════════════
function fmtBytes(b) {
  if (!b || b < 1024) return '0 KB';
  if (b < 1024*1024) return (b/1024).toFixed(0)+' KB';
  if (b < 1024*1024*1024) return (b/1024/1024).toFixed(1)+' MB';
  return (b/1024/1024/1024).toFixed(2)+' GB';
}

async function loadStorage() {
  try {
    const d = await fetch('/admin/storage').then(r=>r.json()).catch(()=>null);
    if (!d?.ok) return;
    // Disk bar
    const pct = d.total ? Math.round(d.used/d.total*100) : 0;
    const bar = document.getElementById('diskBar');
    const lbl = document.getElementById('diskLabel');
    if (bar) { bar.style.width = pct+'%'; bar.style.background = pct>85?'var(--red)':pct>60?'var(--yellow)':'var(--green)'; }
    if (lbl) lbl.textContent = `${fmtBytes(d.used)} / ${fmtBytes(d.total)} (${pct}%)`;
    document.getElementById('storageRefreshMeta').textContent = 'Updated '+new Date().toLocaleTimeString();
    // Folder rows
    const folderIcons = { downloads:'📥', temp:'🕐', logs:'📋', cache:'⚡' };
    const rows = document.getElementById('folderRows');
    if (rows && d.folders) {
      rows.innerHTML = Object.entries(d.folders).map(([k,v])=>`
        <div style="background:var(--surface2);border:1px solid var(--border);border-radius:var(--radius-sm);padding:10px 12px">
          <div style="font-size:.78rem;color:var(--text3);margin-bottom:3px">${folderIcons[k]||'📁'} ${k}</div>
          <div style="font-weight:600;font-size:.92rem">${fmtBytes(v)}</div>
        </div>`).join('');
    }
  } catch {}
}

async function doCleanup(folders) {
  const btn = document.getElementById('cleanBtn');
  const res = document.getElementById('cleanupResult');
  if (btn) { btn.disabled=true; btn.textContent='Cleaning…'; }
  try {
    const d = await fetch('/admin/cleanup',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({folders})}).then(r=>r.json()).catch(()=>null);
    if (d?.ok) {
      res.textContent = `✅ Cleaned ${d.count} file(s), freed ${fmtBytes(d.freed)}`;
      res.style.background='var(--green-dim)'; res.style.color='var(--green)';
    } else {
      res.textContent = '❌ Cleanup failed';
      res.style.background='var(--red-dim)'; res.style.color='var(--red)';
    }
  } catch {
    res.textContent = '❌ Network error';
    res.style.background='var(--red-dim)'; res.style.color='var(--red)';
  }
  res.style.display = 'block';
  if (btn) { btn.disabled=false; btn.textContent='🧹 Clean Downloads & Temp'; }
  setTimeout(()=>{ res.style.display='none'; loadStorage(); }, 3000);
}

async function sendBroadcast() {
  const msg = document.getElementById('bcMessage').value.trim();
  const target = document.getElementById('bcTarget').value;
  const resultEl = document.getElementById('bcResult');
  const btn = document.getElementById('bcBtn');
  const txt = document.getElementById('bcBtnText');
  resultEl.style.display = 'none';
  if (!msg && !_bcImageBase64) { resultEl.textContent='Please enter a message or attach an image.'; resultEl.className='bc-result err'; resultEl.style.display='block'; return; }
  txt.innerHTML = '<span class="spinner"></span> Sending…'; btn.disabled=true;
  const payload = { message: msg, targetSession: target || undefined };
  if (_bcImageBase64) { payload.image = _bcImageBase64; payload.imageMime = _bcImageMime; }
  const r = await fetch('/admin/broadcast',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)}).then(r=>r.json()).catch(()=>({ok:false,error:'Network error'}));
  txt.textContent='Send Broadcast'; btn.disabled=false;
  if (r.ok) {
    resultEl.textContent = `✅ Sent to ${r.sent} session(s)${r.failed?`, ${r.failed} failed`:''}`;
    resultEl.className = 'bc-result ok';
    addBcHistory(msg||'[image]', r.sent, r.failed||0);
    document.getElementById('bcMessage').value = '';
    clearBcImage();
  } else {
    resultEl.textContent = '❌ '+(r.error||'Failed to send');
    resultEl.className = 'bc-result err';
  }
  resultEl.style.display = 'block';
}

function addBcHistory(msg, sent, failed) {
  const now = new Date().toLocaleTimeString();
  _bcHistory.unshift({ time:now, msg:msg.slice(0,60)+(msg.length>60?'…':''), sent, failed });
  if (_bcHistory.length > 20) _bcHistory.pop();
  renderBcHistory();
}

function renderBcHistory() {
  const tbody = document.getElementById('bcHistory');
  if (!_bcHistory.length) { tbody.innerHTML='<tr><td colspan="4" style="color:var(--text2);text-align:center;padding:20px">No broadcasts yet.</td></tr>'; return; }
  tbody.innerHTML = _bcHistory.map(h=>`<tr>
    <td style="color:var(--text2);white-space:nowrap">${h.time}</td>
    <td>${escHtml(h.msg)}</td>
    <td><span class="bc-badge sent">${h.sent}</span></td>
    <td>${h.failed?`<span class="bc-badge fail">${h.failed}</span>`:'-'}</td>
  </tr>`).join('');
}

// ══════════════════════════════════════════════════════════
//  MOVIEBOX — curated, rights-aware viewing and download sources
// ══════════════════════════════════════════════════════════
const MOVIEBOX_LIBRARY = [
  { title: 'Big Buck Bunny', year: '2008', creator: 'Blender Foundation', tags: 'animation comedy open movie creative commons', source: 'https://studio.blender.org/films/big-buck-bunny/' },
  { title: 'Sintel', year: '2010', creator: 'Blender Foundation', tags: 'animation fantasy open movie creative commons', source: 'https://studio.blender.org/films/sintel/' },
  { title: 'Tears of Steel', year: '2012', creator: 'Blender Foundation', tags: 'science fiction live action open movie creative commons', source: 'https://studio.blender.org/films/tears-of-steel/' },
  { title: 'Cosmos Laundromat', year: '2015', creator: 'Blender Foundation', tags: 'animation comedy open movie creative commons', source: 'https://studio.blender.org/films/cosmos-laundromat/' },
  { title: 'Elephants Dream', year: '2006', creator: 'Blender Foundation', tags: 'animation science fiction open movie creative commons', source: 'https://studio.blender.org/films/elephants-dream/' },
];

function renderMovieBox(items) {
  const results = document.getElementById('movieboxResults');
  if (!items.length) {
    results.innerHTML = '<article class="movie-empty"><span>🔎</span><strong>No verified source found</strong><p>Try another title, or use an official rights-holder link for movies not listed here.</p></article>';
    return;
  }
  results.innerHTML = items.map(item => `<article class="movie-card"><div class="movie-card-year">${escHtml(item.year)} · Verified source</div><h3>${escHtml(item.title)}</h3><p>${escHtml(item.creator)} · Open the official film page to watch, read the licence, and download where the rights holder permits.</p><a class="btn-sm" href="${item.source}" target="_blank" rel="noopener noreferrer">Open official source ↗</a></article>`).join('');
}

function searchMovieBox() {
  const input = document.getElementById('movieboxQuery');
  const query = input.value.trim().toLowerCase();
  const status = document.getElementById('movieboxStatus');
  const button = document.getElementById('movieboxSearchBtn');
  button.disabled = true;
  button.textContent = 'Searching…';
  const matches = MOVIEBOX_LIBRARY.filter(item => !query || `${item.title} ${item.creator} ${item.tags}`.toLowerCase().includes(query));
  renderMovieBox(matches);
  status.textContent = query ? `${matches.length} verified legal source${matches.length === 1 ? '' : 's'} found for “${input.value.trim()}”.` : `Showing ${matches.length} verified legal movie sources.`;
  button.disabled = false;
  button.textContent = 'Search library';
}

// ══════════════════════════════════════════════════════════
//  DATABASE PANEL
// ══════════════════════════════════════════════════════════
let _dbData = {}, _dbCollection = 'settings', _dbEditKey = null;

async function loadDbCollection() {
  const col = document.getElementById('dbCollection').value;
  _dbCollection = col;
  document.getElementById('dbStatus').textContent = 'Loading…';
  document.getElementById('dbBody').innerHTML = '<tr><td colspan="3" style="text-align:center;color:var(--text2);padding:24px">Loading…</td></tr>';
  try {
    const r = await fetch(`/admin/db?collection=${encodeURIComponent(col)}`).then(r=>r.json());
    if (!r.ok) throw new Error(r.error || 'Failed');
    _dbData = r.data || {};
    const keys = Object.keys(_dbData);
    document.getElementById('dbStatus').textContent = `${keys.length} entr${keys.length===1?'y':'ies'} in ${col}`;
    renderDbTable();
  } catch(e) {
    document.getElementById('dbStatus').textContent = '⚠️ ' + e.message;
    document.getElementById('dbBody').innerHTML = `<tr><td colspan="3" style="text-align:center;color:var(--red);padding:24px">${escHtml(e.message)}</td></tr>`;
  }
}

function renderDbTable() {
  const filter = (document.getElementById('dbSearch')?.value || '').toLowerCase();
  const keys = Object.keys(_dbData).filter(k => !filter || k.toLowerCase().includes(filter) || JSON.stringify(_dbData[k]).toLowerCase().includes(filter));
  const tbody = document.getElementById('dbBody');
  if (!keys.length) {
    tbody.innerHTML = '<tr><td colspan="3" style="text-align:center;color:var(--text2);padding:24px">No entries found.</td></tr>';
    return;
  }
  tbody.innerHTML = keys.map(k => {
    const valStr = JSON.stringify(_dbData[k], null, 1);
    return `<tr>
      <td><span class="db-key">${escHtml(k)}</span></td>
      <td><span class="db-val">${escHtml(valStr)}</span></td>
      <td style="white-space:nowrap">
        <button class="db-btn" onclick="openDbEdit(${JSON.stringify(k)})">Edit</button>
        <button class="db-btn del" onclick="deleteDbEntry(${JSON.stringify(k)})">Del</button>
      </td>
    </tr>`;
  }).join('');
}

function openDbEdit(key) {
  _dbEditKey = key;
  document.getElementById('dbModalTitle').textContent = 'Edit Entry';
  document.getElementById('dbModalKey').value = key;
  document.getElementById('dbModalKey').readOnly = true;
  document.getElementById('dbModalValue').value = JSON.stringify(_dbData[key], null, 2);
  document.getElementById('dbModalError').style.display = 'none';
  document.getElementById('dbModalOverlay').classList.add('open');
}

function openDbAdd() {
  _dbEditKey = null;
  document.getElementById('dbModalTitle').textContent = 'Add Entry';
  document.getElementById('dbModalKey').value = '';
  document.getElementById('dbModalKey').readOnly = false;
  document.getElementById('dbModalValue').value = '';
  document.getElementById('dbModalError').style.display = 'none';
  document.getElementById('dbModalOverlay').classList.add('open');
}

function closeDbModal() {
  document.getElementById('dbModalOverlay').classList.remove('open');
  _dbEditKey = null;
}

async function saveDbEntry() {
  const key = document.getElementById('dbModalKey').value.trim();
  const rawVal = document.getElementById('dbModalValue').value.trim();
  const errEl = document.getElementById('dbModalError');
  errEl.style.display = 'none';
  if (!key) { errEl.textContent = 'Key is required.'; errEl.style.display='block'; return; }
  let value;
  try { value = JSON.parse(rawVal); } catch { errEl.textContent = 'Value must be valid JSON (e.g. true, 42, "text", {}, [])'; errEl.style.display='block'; return; }
  try {
    const r = await fetch('/admin/db/set', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ collection: _dbCollection, key, value }) }).then(r=>r.json());
    if (!r.ok) throw new Error(r.error || 'Save failed');
    closeDbModal();
    await loadDbCollection();
  } catch(e) { errEl.textContent = '⚠️ ' + e.message; errEl.style.display='block'; }
}

async function deleteDbEntry(key) {
  if (!confirm(`Delete key "${key}" from ${_dbCollection}?\n\nThis cannot be undone.`)) return;
  try {
    const r = await fetch('/admin/db/delete', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ collection: _dbCollection, key }) }).then(r=>r.json());
    if (!r.ok) throw new Error(r.error || 'Delete failed');
    await loadDbCollection();
  } catch(e) { alert('Delete failed: ' + e.message); }
}

// ══════════════════════════════════════════════════════════
//  LIVE LOGS
// ══════════════════════════════════════════════════════════
function setLogLevel(lvl) {
  _logLevel = lvl;
  ['all','info','warn','error'].forEach(l=>{
    const el = document.getElementById(`logLvl${l.charAt(0).toUpperCase()+l.slice(1)}`);
    if (el) el.classList.toggle('active', l===lvl);
  });
  renderLogs();
}

function filterLogs() { renderLogs(); }
function clearLogs()  { _allLogLines=[]; renderLogs(); }
function toggleAutoScroll() { _logAutoScroll = document.getElementById('logAutoScroll').checked; }

function parseLogLevel(line) {
  if (/"level":"(WARN|WARN )"|level.*warn|\bWARN\b/i.test(line))  return 'warn';
  if (/"level":"(ERROR|ERR)"|level.*error|\bERROR\b|\bERR\b/i.test(line))  return 'error';
  if (/"level":"(DEBUG|TRACE)"|level.*debug|\bDEBUG\b/i.test(line)) return 'debug';
  if (/"level":"INFO"|level.*info|\bINFO\b|✅|🚀|📦|📡|🌐|🎂|👁️/i.test(line)) return 'info';
  if (/⚠️|WARNING/i.test(line)) return 'warn';
  if (/❌|ERROR|FATAL/i.test(line)) return 'error';
  return 'plain';
}

function renderLogs() {
  const filter = (document.getElementById('logFilter')?.value||'').toLowerCase();
  const box = document.getElementById('logBox');
  const lines = _allLogLines.filter(l=>{
    if (_logLevel!=='all' && l.level!==_logLevel) return false;
    if (filter && !l.line.toLowerCase().includes(filter)) return false;
    return true;
  });
  box.innerHTML = lines.map(l=>{
    let ts = '';
    try { ts=`<span class="log-ts">${new Date(l.ts).toLocaleTimeString()}</span>`; } catch {}
    return `<div class="log-line ${l.level}">${ts}${escHtml(l.line)}</div>`;
  }).join('');
  if (_logAutoScroll) box.scrollTop = box.scrollHeight;
}

async function pollLogs() {
  try {
    const url = `/admin/logs?limit=150&since=${_logLastTs}`;
    const d = await fetch(url).then(r=>r.json());
    if (d.logs && d.logs.length) {
      for (const l of d.logs) {
        _allLogLines.push({ ts:l.ts, line:l.line, level:parseLogLevel(l.line) });
      }
      if (_allLogLines.length > 500) _allLogLines = _allLogLines.slice(-500);
      _logLastTs = d.lastTs || _logLastTs;
      renderLogs();
    }
    document.getElementById('logStatus').textContent = `Last update: ${new Date().toLocaleTimeString()} · ${_allLogLines.length} lines`;
  } catch { document.getElementById('logStatus').textContent = 'Connection error — retrying…'; }
}

function startLogPolling() {
  if (_logInterval) clearInterval(_logInterval);
  _logLastTs = 0; _allLogLines = [];
  pollLogs();
  _logInterval = setInterval(pollLogs, 3000);
}

function stopLogPolling() {
  if (_logInterval) { clearInterval(_logInterval); _logInterval=null; }
}

// ══════════════════════════════════════════════════════════
//  PAIR
// ══════════════════════════════════════════════════════════
async function doPair() {
  const phone  = document.getElementById('pairPhone').value.trim().replace(/\D/g,'');
  const sid    = document.getElementById('pairSessionId').value.trim() || phone;
  const errEl  = document.getElementById('pairErr');
  errEl.style.display='none';
  document.getElementById('pairCodeBox').style.display='none';
  if (!phone||phone.length<7) { errEl.textContent='Please enter a valid phone number'; errEl.style.display='block'; return; }
  document.getElementById('pairBtnText').innerHTML='<span class="spinner"></span> Connecting…';
  document.getElementById('pairBtn').disabled=true;
  const r = await fetch('/session/create',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:sid,method:'pairing',phoneNumber:phone})}).then(r=>r.json()).catch(()=>({ok:false,error:'Network error'}));
  if (!r.ok) {
    document.getElementById('pairBtnText').textContent='Get Pairing Code';
    document.getElementById('pairBtn').disabled=false;
    errEl.textContent=r.error||'Failed to create session';
    errEl.style.display='block';
    return;
  }
  // Session created — code arrives via SSE (pairingCode event).
  // Keep button disabled & show waiting text; SSE handler re-enables on success/error.
  document.getElementById('pairBtnText').innerHTML='<span class="spinner"></span> Waiting for code…';
  // Safety fallback: re-enable after 30s in case SSE is missed
  setTimeout(()=>{
    if(document.getElementById('pairBtn').disabled){
      document.getElementById('pairBtnText').textContent='Get Pairing Code';
      document.getElementById('pairBtn').disabled=false;
    }
  }, 30000);
}

// ══════════════════════════════════════════════════════════
//  NAVIGATION
// ══════════════════════════════════════════════════════════
function showPage(name, el) {
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n=>n.classList.remove('active'));
  document.getElementById('page-'+name).classList.add('active');
  if (el) el.classList.add('active');
  const meta = PAGE_META[name]||[name,''];
  document.getElementById('pageTitle').textContent = meta[0];
  document.getElementById('pageSub').textContent   = meta[1];
  if (name==='sessions')  renderSessions();
  if (name==='pair')      renderPairSessions();
  if (name==='overview')  { renderOverview(); loadStorage(); }
  if (name==='broadcast') { updateBcTargetSelect(); renderBcHistory(); }
  if (name==='moviebox')  { document.getElementById('movieboxQuery')?.focus(); }
  if (name==='database')  { loadDbCollection(); }
  if (name==='logs')      startLogPolling();
  else                    stopLogPolling();
  closeSidebar();
}

function openSidebar()  { document.getElementById('sidebar').classList.add('open'); document.getElementById('sbOverlay').classList.add('visible'); }
function closeSidebar() { document.getElementById('sidebar').classList.remove('open'); document.getElementById('sbOverlay').classList.remove('visible'); }

// ══════════════════════════════════════════════════════════
//  UPTIME TICKER
// ══════════════════════════════════════════════════════════
function startUptimeTicker() {
  if (_uptimeInterval) clearInterval(_uptimeInterval);
  _uptimeInterval = setInterval(()=>{
    if (!_startMs) return;
    const ms = Date.now()-_startMs;
    document.getElementById('uptimeTicker').textContent = fmtDuration(ms);
    document.getElementById('ovUptime').textContent = fmtDuration(ms);
  },1000);
}

function fmtDuration(ms) {
  const s=Math.floor(ms/1000),m=Math.floor(s/60),h=Math.floor(m/60),d=Math.floor(h/24);
  if (d>0) return `${d}d ${h%24}h ${m%60}m`;
  if (h>0) return `${h}h ${m%60}m ${s%60}s`;
  if (m>0) return `${m}m ${s%60}s`;
  return `${s}s`;
}

function timeSince(ts) {
  const ms=Date.now()-ts,s=Math.floor(ms/1000),m=Math.floor(s/60),h=Math.floor(m/60),d=Math.floor(h/24);
  if (d>0) return `${d}d ago`;
  if (h>0) return `${h}h ago`;
  if (m>0) return `${m}m ago`;
  return 'just now';
}

function escHtml(str) {
  return String(str||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
