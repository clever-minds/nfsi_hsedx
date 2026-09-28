// Logika wizard pemasangan.
//
// Berkas terpisah, BUKAN <script> inline: `helmet()` memasang
// `script-src 'self'` untuk seluruh aplikasi, termasuk halaman ini. Skrip
// inline ditolak diam-diam oleh peramban, dan wizard berhenti di "Loading…"
// tanpa pesan apa pun. Melonggarkan CSP demi satu halaman jauh lebih mahal
// daripada memindahkan berkas.
// Deliberately dependency-free and un-built: the installer must run on a machine
// where nothing has been set up yet, which is exactly when a build step or a CDN
// is least likely to work.
var API = location.origin + '/api/v1';
var state = { step: 1, db: null };

function $(id) { return document.getElementById(id); }
function esc(s) { return String(s).replace(/[&<>"]/g, function (c) {
  return { '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c]; }); }

function marks(n) {
  for (var i = 1; i <= 4; i++) $('s' + i).className = i <= n ? 'on' : '';
}

function api(path, body) {
  return fetch(API + path, {
    method: body ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  }).then(function (r) {
    return r.json().then(function (j) {
      if (!r.ok) throw new Error((j.error && j.error.message) || ('HTTP ' + r.status));
      return j.data;
    });
  });
}

function say(kind, text) {
  var el = $('msg');
  if (!el) return;
  el.className = 'msg ' + kind;
  el.textContent = text;
}

function busy(on, label) {
  var b = $('go');
  if (!b) return;
  b.disabled = on;
  b.textContent = on ? label : b.dataset.label;
}

// ── Step 1: requirements ────────────────────────────────────────────────
function stepRequirements() {
  marks(1);
  api('/install/status').then(function (d) {
    if (d.installed) return showInstalled();

    var rows = d.requirements.map(function (r) {
      return '<div class="req"><span class="' + (r.ok ? 'tick">✓' : 'cross">✗') + '</span>' +
             '<div><b>' + esc(r.name) + '</b><span>' + esc(r.detail) + '</span></div></div>';
    }).join('');

    var allOk = d.requirements.every(function (r) { return r.ok; });

    $('card').innerHTML =
      '<h2>Server requirements</h2>' +
      '<p class="hint">Checked on the machine running the backend.</p>' + rows +
      '<button id="go" data-label="Continue"' + (allOk ? '' : ' disabled') + '>Continue</button>' +
      '<div id="msg"></div>';

    if (allOk) $('go').onclick = stepDatabase;
    else say('bad', 'Fix the items marked ✗, then reload this page.');
  }).catch(function (e) {
    $('card').innerHTML = '<h2>Cannot reach the backend</h2><p class="hint">' + esc(e.message) + '</p>';
  });
}

// ── Step 2: database ────────────────────────────────────────────────────
function stepDatabase() {
  marks(2);
  $('card').innerHTML =
    '<h2>Database</h2>' +
    '<p class="hint">A PostgreSQL 14+ database that already exists and is empty.</p>' +
    '<div class="row">' +
      '<div><label>Host</label><input id="host" value="127.0.0.1"></div>' +
      '<div style="max-width:130px"><label>Port</label><input id="port" value="5432"></div>' +
    '</div>' +
    '<label>Database name</label><input id="database" placeholder="lmshub">' +
    '<label>User</label><input id="user" placeholder="postgres">' +
    '<label>Password</label><input id="password" type="password">' +
    '<div class="check"><input type="checkbox" id="ssl"><label for="ssl" style="margin:0">Require SSL</label></div>' +
    '<button id="go" data-label="Test connection">Test connection</button>' +
    '<div id="msg"></div>';

  $('go').onclick = function () {
    var db = {
      host: $('host').value.trim(), port: Number($('port').value),
      database: $('database').value.trim(), user: $('user').value.trim(),
      password: $('password').value, ssl: $('ssl').checked,
    };
    busy(true, 'Connecting…');
    api('/install/database', db).then(function (d) {
      state.db = db;
      say('good', 'Connected to ' + d.version + '. Creating the schema…');
      busy(true, 'Creating schema…');
      return api('/install/migrate', db);
    }).then(function () {
      stepAdmin();
    }).catch(function (e) {
      busy(false);
      say('bad', e.message);
    });
  };
}

// ── Step 3: admin + addresses ───────────────────────────────────────────
function stepAdmin() {
  marks(3);
  var origin = location.origin;
  $('card').innerHTML =
    '<h2>Administrator</h2>' +
    '<p class="hint">The account you will sign in with. You can add more later.</p>' +
    '<label>Full name</label><input id="adminName" value="Administrator">' +
    '<label>Email</label><input id="adminEmail" type="email" placeholder="you@your-domain.com">' +
    '<label>Password<span class="desc">At least 10 characters.</span></label>' +
    '<input id="adminPassword" type="password">' +
    '<label style="margin-top:24px">Backend address<span class="desc">Where this API answers. Used to build webhook and email links.</span></label>' +
    '<input id="appUrl" value="' + esc(origin) + '">' +
    '<label>Storefront address<span class="desc">Where visitors browse courses. Same domain if one proxy serves both.</span></label>' +
    '<input id="webUrl" value="' + esc(origin) + '">' +
    '<button id="go" data-label="Finish install">Finish install</button>' +
    '<div id="msg"></div>';

  $('go').onclick = function () {
    var body = Object.assign({}, state.db, {
      adminName: $('adminName').value.trim(),
      adminEmail: $('adminEmail').value.trim(),
      adminPassword: $('adminPassword').value,
      appUrl: $('appUrl').value.trim(),
      webUrl: $('webUrl').value.trim(),
    });
    busy(true, 'Finishing…');
    api('/install/finish', body).then(function () {
      stepDone(body.webUrl);
    }).catch(function (e) {
      busy(false);
      say('bad', e.message);
    });
  };
}

// ── Step 4: done ────────────────────────────────────────────────────────
function stepDone(webUrl) {
  marks(4);
  $('card').innerHTML =
    '<div class="done"><h2>Installed</h2>' +
    '<p class="hint">Credentials were written to <code>.env</code> and the sign-in secrets were generated for you.</p>' +
    '<ol>' +
      '<li><b>Restart the backend</b> so it picks up the new configuration — <code>pm2 restart lmshub-be</code>, or restart your service.</li>' +
      '<li>If the storefront sits on a different domain, set <code>apiUrl</code> in <code>config.js</code> next to its <code>index.html</code>.</li>' +
      '<li>Sign in at <a href="' + esc(webUrl) + '/login">' + esc(webUrl) + '/login</a> and set your branding and payment methods under Settings.</li>' +
    '</ol>' +
    '<p class="hint" style="margin-top:16px">This installer has locked itself and will refuse to run again.</p></div>';
}

function showInstalled() {
  marks(4);
  $('card').innerHTML =
    '<h2>Already installed</h2>' +
    '<p class="hint">This system has an administrator account, so the installer is closed. ' +
    'Sign in instead, or remove the admin account from the database if you genuinely need to start over.</p>';
}

stepRequirements();
