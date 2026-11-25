/* AXPER admin console: X1 expert review, X2 bookings, X3 payouts.
   Only profiles with role 'admin' get in (see db/README.md). Every change goes through a database
   function that checks the caller is an admin, so this page can't do more than the database allows. */
(function () {
  'use strict';
  var DB = window.AXPER_DB, root = document.getElementById('root');
  /* Tier names are still an open decision in the MVP spec. Change them here. */
  var TIERS = ['New', 'Silver', 'Gold'];
  var me = null, filter = 'review', phone = '';

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function money(c) { return 'HK$' + Math.round((c || 0) / 100).toLocaleString('en'); }
  function pretty(p) { var d = String(p || '').replace(/\D/g, '').slice(-8); return d ? '+852 ' + d.slice(0, 4) + ' ' + d.slice(4) : ''; }
  function hk(iso, opts) { return iso ? new Intl.DateTimeFormat('en-GB', Object.assign({ timeZone: 'Asia/Hong_Kong' }, opts)).format(new Date(iso)) : ''; }
  function when(iso) { return hk(iso, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false }); }
  function day(d) { return d ? new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }) : ''; }
  function badge(text, tone) { return '<span class="' + (tone === 'tag' ? 'tag' : 'badge' + (tone ? ' ' + tone : '')) + '">' + esc(text) + '</span>'; }
  function toast(msg) {
    var t = document.createElement('div'); t.className = 'toast'; t.setAttribute('role', 'status'); t.textContent = msg;
    document.body.appendChild(t); setTimeout(function () { t.remove(); }, 2600);
  }
  function view() { var h = location.hash.slice(1); return h === 'bookings' || h === 'payouts' ? h : 'experts'; }

  /* ---------- sign in ---------- */
  function signin(msg) {
    root.innerHTML = '<div class="signin"><span class="logo">AXPER<span class="dot">.</span> <span class="m s">Admin</span></span>' +
      '<h1>Sign in</h1><p class="m">For the AXPER team only.</p>' +
      '<form id="phoneForm" style="display:flex;flex-direction:column;gap:12px" novalidate><label class="label" for="phone">Phone number</label>' +
      '<div class="row" style="gap:10px"><div class="prefix">+852</div><input class="input" id="phone" type="tel" inputmode="numeric" autocomplete="tel-national" value="' + esc(phone) + '"></div>' +
      '<button class="btn" type="submit">Send code</button></form>' +
      '<form id="codeForm" hidden style="display:flex;flex-direction:column;gap:12px" novalidate><label class="label" for="code">6-digit code</label>' +
      '<input class="input" id="code" inputmode="numeric" autocomplete="one-time-code" maxlength="6"><button class="btn" type="submit">Sign in</button></form>' +
      '<p class="m s err" id="err" role="alert">' + esc(msg || '') + '</p></div>';
    var err = document.getElementById('err');
    document.getElementById('phoneForm').addEventListener('submit', function (e) {
      e.preventDefault();
      phone = document.getElementById('phone').value.replace(/\D/g, '').slice(0, 8);
      if (phone.length !== 8) { err.textContent = 'Enter an 8-digit Hong Kong number.'; return; }
      var b = e.target.querySelector('button'); b.disabled = true; err.textContent = '';
      DB.sendCode(phone).then(function () {
        e.target.hidden = true; var c = document.getElementById('codeForm'); c.hidden = false; c.querySelector('input').focus();
      }, function (x) { b.disabled = false; err.textContent = x.message; });
    });
    document.getElementById('codeForm').addEventListener('submit', function (e) {
      e.preventDefault();
      var code = document.getElementById('code').value.replace(/\D/g, '');
      if (code.length !== 6) { err.textContent = 'Enter the 6 digits from the SMS.'; return; }
      var b = e.target.querySelector('button'); b.disabled = true; err.textContent = '';
      DB.verifyCode(phone, code).then(start, function (x) { b.disabled = false; err.textContent = x.message; });
    });
  }

  function start() {
    return DB.loadMe().then(function (m) {
      if (!m || m.role !== 'admin') {
        return DB.signOut().then(function () { signin('This number isn’t an AXPER admin. Ask the team to add you.'); });
      }
      me = m; render();
    });
  }

  /* ---------- layout ---------- */
  function shell(title, sub, body) {
    var cur = view();
    var links = [['experts', 'Expert review'], ['bookings', 'Bookings'], ['payouts', 'Payouts']].map(function (l) {
      return '<a href="#' + l[0] + '"' + (l[0] === cur ? ' aria-current="page"' : '') + '>' + l[1] + '</a>';
    }).join('');
    root.innerHTML = '<div class="adm"><nav aria-label="Admin"><span class="logo" style="padding:0 12px 20px">AXPER<span class="dot">.</span> <span class="m s">Admin</span></span>' + links +
      '<div class="who"><span>' + esc(me.name || 'Admin') + '<br>' + esc(me.phone) + '</span><button class="link-btn" style="text-align:left;padding:0;min-height:0" data-act="signout">Sign out</button></div></nav>' +
      '<main><div><h1>' + title + '</h1><p class="m" style="margin-top:6px">' + sub + '</p></div>' + body + '</main></div>';
  }
  function table(cols, rows, empty) {
    if (!rows.length) return '<div class="card empty"><p class="m">' + empty + '</p></div>';
    return '<div class="card" style="padding:0 8px;overflow-x:auto"><table><tr>' + cols.map(function (c) { return '<th>' + c + '</th>'; }).join('') + '</tr>' +
      rows.map(function (r) { return '<tr>' + r.map(function (c) { return '<td>' + c + '</td>'; }).join('') + '</tr>'; }).join('') + '</table></div>';
  }
  function kpis(items) { return '<div class="kpis">' + items.map(function (k) { return '<div class="card"><span class="m s">' + k[0] + '</span><b>' + k[1] + '</b></div>'; }).join('') + '</div>'; }

  /* ---------- X1 expert review ---------- */
  var STATUS = { applied: ['Waiting for photos', 'tag'], id_review: ['ID to check', 'wait'], interview: ['Interview', 'wait'], approved: ['Approved', ''], paused: ['Paused', 'tag'] };
  var FILTERS = [['review', 'To review', ['id_review', 'interview']], ['applied', 'Waiting for photos', ['applied']], ['approved', 'Approved', ['approved']], ['paused', 'Paused', ['paused']], ['all', 'All', null]];

  function experts() {
    return DB.adminExperts().then(function (list) {
      var paths = [];
      list.forEach(function (e) { if (e.id_photo_path) paths.push(e.id_photo_path); if (e.selfie_path) paths.push(e.selfie_path); });
      return DB.signedUrls(paths).then(function (urls) {
        var f = FILTERS.filter(function (x) { return x[0] === filter; })[0];
        var shown = list.filter(function (e) { return !f[2] || f[2].indexOf(e.status) >= 0; });
        var waiting = list.filter(function (e) { return e.status === 'id_review' || e.status === 'interview'; }).length;
        var chips = '<div class="chips">' + FILTERS.map(function (x) {
          var n = list.filter(function (e) { return !x[2] || x[2].indexOf(e.status) >= 0; }).length;
          return '<button class="chip" data-filter="' + x[0] + '" aria-pressed="' + (x[0] === filter) + '">' + x[1] + ' · ' + n + '</button>';
        }).join('') + '</div>';
        var rows = shown.map(function (e) {
          var p = e.profiles || {}, id = esc(e.profile_id);
          var pics = '<div class="thumbs">' +
            (urls[e.id_photo_path] ? '<button class="link-btn" style="padding:0;min-height:0" data-zoom="' + esc(urls[e.id_photo_path]) + '" aria-label="Open ID photo of ' + esc(p.name) + '"><img class="thumb" src="' + esc(urls[e.id_photo_path]) + '" alt=""></button>' : '<span class="thumb"></span>') +
            (urls[e.selfie_path] ? '<button class="link-btn" style="padding:0;min-height:0" data-zoom="' + esc(urls[e.selfie_path]) + '" aria-label="Open selfie of ' + esc(p.name) + '"><img class="thumb round" src="' + esc(urls[e.selfie_path]) + '" alt=""></button>' : '<span class="thumb round"></span>') + '</div>';
          var tier = '<select data-tier="' + id + '" aria-label="Tier for ' + esc(p.name) + '"><option value="">Choose…</option>' +
            TIERS.map(function (t) { return '<option' + (e.tier === t ? ' selected' : '') + '>' + t + '</option>'; }).join('') + '</select>';
          var acts = e.status === 'id_review' ? '<button class="btn" data-review="id_ok" data-id="' + id + '">ID looks right</button><button class="btn ghost" data-review="new_photo" data-id="' + id + '">Ask for new photos</button>' :
            e.status === 'interview' ? '<button class="btn" data-review="approve" data-id="' + id + '">Approve</button><button class="btn ghost" data-review="new_photo" data-id="' + id + '">Ask for new photos</button>' :
            e.status === 'approved' ? '<button class="btn ghost" data-review="pause" data-id="' + id + '">Pause offers</button>' :
            e.status === 'paused' ? '<button class="btn" data-review="approve" data-id="' + id + '">Approve again</button>' :
            '<span class="m s">Waiting for the expert to send photos</span>';
          return ['<b>' + esc(p.name || '—') + '</b><br><span class="m s">' + esc(pretty(p.phone)) + '<br>Joined ' + esc(hk(e.created_at, { day: 'numeric', month: 'short' })) + '</span>',
            esc(e.roles.join(', ')) + '<br><span class="m s">' + esc(e.languages.join(', ')) + '</span>', pics,
            e.interview_at ? esc(when(e.interview_at)) : '<span class="m s">Not booked</span>',
            badge(STATUS[e.status][0], STATUS[e.status][1]), '<div class="acts">' + tier + acts + '</div>'];
        });
        shell('Expert review', waiting + ' expert' + (waiting === 1 ? '' : 's') + ' to review · check the ID, then the interview', chips +
          table(['Expert', 'Roles and languages', 'ID and selfie', 'Interview', 'Status', 'Tier and actions'], rows, 'No experts here.'));
      });
    });
  }

  /* ---------- X2 bookings ---------- */
  var EV = { draft: ['Not paid yet', 'tag'], matching: ['Matching', 'wait'], priced: ['Priced', 'wait'], paid: ['Paid', ''], live: ['On today', ''], done: ['Done', 'tag'], cancelled: ['Cancelled', 'tag'] };
  function bookings() {
    return DB.adminEvents().then(function (list) {
      var today = new Date().toISOString().slice(0, 10);
      var upcoming = list.filter(function (e) { return e.date >= today && e.status !== 'cancelled'; });
      var rows = list.map(function (e) {
        var o = e.organisations || {}, owner = o.profiles || {};
        return ['<b>' + esc(e.name) + '</b><br><span class="m s">' + esc(e.experts_needed + ' × ' + e.role) + (e.backup ? ' + backup' : '') + '</span>',
          esc(o.name) + '<br><span class="m s">' + esc(owner.name) + ' · ' + esc(pretty(owner.phone)) + '</span>',
          esc(day(e.date)) + '<br><span class="m s">' + esc(e.start_time.slice(0, 5) + ' – ' + e.end_time.slice(0, 5)) + '</span>',
          esc(e.place),
          (o.plan === 'pro' ? 'Pro' : 'Lite') + (o.plan_choice === 'pro' && o.plan !== 'pro' ? '<br><span class="m s">chose Pro, not paid</span>' : ''),
          money(e.total_cents), badge(EV[e.status][0], EV[e.status][1])];
      });
      shell('Bookings', 'Every event, soonest first. Matching and payments arrive in the next steps.',
        kpis([['Upcoming events', upcoming.length], ['Value of upcoming events', money(upcoming.reduce(function (s, e) { return s + e.total_cents; }, 0))],
              ['Experts needed', upcoming.reduce(function (s, e) { return s + e.experts_needed; }, 0)]]) +
        table(['Event', 'Organiser', 'Date', 'Place', 'Plan', 'Total', 'Status'], rows, 'No events yet. They appear here as organisers book.'));
    });
  }

  /* ---------- X3 payouts ---------- */
  function payouts() {
    return DB.adminPayouts().then(function (list) {
      var due = list.filter(function (p) { return p.status === 'due'; });
      var rows = list.map(function (p) {
        var x = p.experts || {}, pr = x.profiles || {}, id = esc(p.id);
        return ['<b>' + esc(pr.name) + '</b><br><span class="m s">' + esc(pretty(pr.phone)) + '</span>',
          esc(day(p.week_start)), money(p.amount_cents),
          x.fps_id ? esc(x.payout_name) + '<br><span class="m s">FPS ' + esc(x.fps_id) + '</span>' : '<span class="m s">No FPS details yet</span>',
          p.status === 'paid' ? badge('Paid', '') : badge('Due', 'wait'),
          p.status === 'paid' ? '<span class="m s">' + esc(p.bank_ref) + ' · ' + esc(hk(p.paid_at, { day: 'numeric', month: 'short' })) + '</span>' :
            '<div class="acts"><input class="input ref" placeholder="FPS reference" data-ref="' + id + '" aria-label="FPS reference for ' + esc(pr.name) + '"><button class="btn" data-paid="' + id + '">Mark paid</button></div>'];
      });
      shell('Payouts', 'Pay each expert by FPS, then record the bank reference here.',
        kpis([['To pay', money(due.reduce(function (s, p) { return s + p.amount_cents; }, 0))], ['Experts to pay', due.length], ['Paid so far', (list.length - due.length) + ' of ' + list.length]]) +
        table(['Expert', 'Week of', 'Amount', 'Pay to', 'Status', ''], rows, 'No payouts yet. They appear here once experts finish shifts.'));
    });
  }

  function render() {
    var v = view(), load = v === 'bookings' ? bookings : v === 'payouts' ? payouts : experts;
    return load().catch(function (x) { shell('Something went wrong', esc(x.message) + ' Try reloading the page.', ''); });
  }

  /* ---------- actions ---------- */
  document.addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (!b) return;
    if (b.dataset.act === 'signout') { DB.signOut().then(function () { me = null; signin(); }); return; }
    if (b.dataset.filter) { filter = b.dataset.filter; render(); return; }
    if (b.dataset.zoom) {
      var d = document.createElement('dialog'); d.className = 'zoom';
      d.innerHTML = '<img src="' + esc(b.dataset.zoom) + '" alt="Full-size photo"><form method="dialog" style="margin-top:10px;text-align:right"><button class="btn ghost">Close</button></form>';
      document.body.appendChild(d); d.addEventListener('close', function () { d.remove(); }); d.showModal(); return;
    }
    if (b.dataset.review) {
      var action = b.dataset.review, id = b.dataset.id, sel = document.querySelector('[data-tier="' + id + '"]');
      if (action === 'new_photo' && !confirm('Ask this expert to send new ID photos? They’ll need to upload both again.')) return;
      b.disabled = true;
      DB.adminReview(id, action, sel ? sel.value : '').then(function () {
        toast({ id_ok: 'ID checked. Next: the interview', approve: 'Approved. They now get offers', new_photo: 'Asked for new photos', pause: 'Offers paused' }[action]); render();
      }, function (x) { b.disabled = false; toast(x.message); if (/tier/i.test(x.message) && sel) sel.focus(); });
      return;
    }
    if (b.dataset.paid) {
      var ref = document.querySelector('[data-ref="' + b.dataset.paid + '"]');
      b.disabled = true;
      DB.markPaid(b.dataset.paid, ref ? ref.value : '').then(function () { toast('Marked paid'); render(); },
        function (x) { b.disabled = false; toast(x.message); if (ref) ref.focus(); });
    }
  });
  /* changing an approved expert's tier saves straight away */
  document.addEventListener('change', function (e) {
    var t = e.target.dataset && e.target.dataset.tier; if (!t || !e.target.value) return;
    var row = e.target.closest('tr'); if (!row || !row.querySelector('[data-review="pause"]')) return;
    DB.adminReview(t, 'tier', e.target.value).then(function () { toast('Tier saved'); }, function (x) { toast(x.message); });
  });
  window.addEventListener('hashchange', function () { if (me) render(); });

  if (!DB || !DB.live) { root.innerHTML = '<div class="signin"><h1>Not connected</h1><p class="m">Add the Supabase URL and key to config.js to use the admin console.</p></div>'; return; }
  DB.session().then(function (id) { return id ? start() : signin(); }).catch(function () { signin('Couldn’t reach AXPER. Check your connection.'); });
})();
