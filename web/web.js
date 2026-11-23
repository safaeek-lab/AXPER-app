/* AXPER website (W1–W5). Shares saved progress with the phone app through the same
   localStorage key, so a shift accepted here shows up in the app and the other way round. */
(function () {
  'use strict';
  var A = window.AXPER, OFFERS = A.OFFERS;
  var page = document.body.getAttribute('data-page');

  /* ---------- state shared with app.js ---------- */
  function load() { try { return JSON.parse(localStorage.getItem(A.KEY)) || {}; } catch (e) { return {}; } }
  function save(s) { try { localStorage.setItem(A.KEY, JSON.stringify(s)); } catch (e) {} }
  var state = load();
  state.offers = state.offers || {};

  /* ---------- helpers ---------- */
  function $(sel, root) { return (root || document).querySelector(sel); }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function pay(o) { return 'HK$' + (o.hours * o.rate).toLocaleString('en'); }
  function money(n) { return 'HK$' + n.toLocaleString('en'); }
  function offer(id) { for (var i = 0; i < OFFERS.length; i++) if (OFFERS[i].id === id) return OFFERS[i]; return null; }
  function initials(name) { return String(name || '').trim().split(/\s+/).map(function (w) { return w[0] || ''; }).join('').slice(0, 2).toUpperCase() || 'ME'; }
  function short(place) { return place.split(',')[0]; }
  function minus30(t) {
    var p = t.split(':'), m = +p[0] * 60 + +p[1] - 30, h = Math.floor(m / 60), mm = m % 60;
    return (h < 10 ? '0' : '') + h + ':' + (mm < 10 ? '0' : '') + mm;
  }
  function toast(msg) {
    var t = document.createElement('div'); t.className = 'toast'; t.setAttribute('role', 'status'); t.textContent = msg;
    document.body.appendChild(t); setTimeout(function () { t.remove(); }, 2400);
  }
  function needSignIn() {
    if (state.signedIn) return false;
    location.replace('signin.html?next=' + encodeURIComponent(location.pathname.split('/').pop() + location.search));
    return true;
  }
  /* "today" for the sample shifts, which are all in November */
  var TODAY = 13;

  document.addEventListener('click', function (e) {
    var b = e.target.closest('[data-lang]');
    if (b) toast('繁體中文 and 简体中文 are coming in the next build');
    var s = e.target.closest('[data-soon]');
    if (s) toast(s.getAttribute('data-soon'));
  });

  /* ---------- W1 website home ---------- */
  if (page === 'home') {
    var lines = {
      Brands: 'For premium launches and activations, staffed by experts we have already vetted.',
      Organisers: 'For conferences, exhibitions and gala dinners that need a reliable team on the day.',
      'Event agencies': 'Extra hands for your client events, booked in minutes and briefed before the day.',
      'Marketing agencies': 'Brand ambassadors and booth staff for roadshows, sampling and pop-ups.'
    };
    var tabs = document.querySelectorAll('[role="tab"]');
    Array.prototype.forEach.call(tabs, function (t) {
      t.addEventListener('click', function () {
        Array.prototype.forEach.call(tabs, function (x) { x.setAttribute('aria-selected', String(x === t)); x.tabIndex = x === t ? 0 : -1; });
        $('#audienceText').textContent = lines[t.textContent];
      });
      t.addEventListener('keydown', function (e) {
        if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
        var i = Array.prototype.indexOf.call(tabs, t) + (e.key === 'ArrowRight' ? 1 : -1);
        var to = tabs[(i + tabs.length) % tabs.length]; to.focus(); to.click(); e.preventDefault();
      });
    });
    /* Plans for organisers: fill the lists from data.js and remember which plan was clicked */
    Array.prototype.forEach.call(document.querySelectorAll('[data-plan-list]'), function (ul) {
      ul.innerHTML = A.PLANS[ul.getAttribute('data-plan-list')].map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('');
    });
    $('#proPrice').textContent = A.proPrice();
    Array.prototype.forEach.call(document.querySelectorAll('[data-plan-pick]'), function (a) {
      a.addEventListener('click', function () {
        state.org = state.org || {};
        state.org.planPick = a.getAttribute('data-plan-pick');
        save(state);
      });
    });
    $('#bookForm').addEventListener('submit', function (e) {
      e.preventDefault();
      var f = e.target, err = $('#bookErr'), n = parseInt(f.count.value, 10);
      if (!f.date.value.trim()) { err.textContent = 'Add the date of your event.'; f.date.focus(); return; }
      if (!f.place.value.trim()) { err.textContent = 'Add where the event is.'; f.place.focus(); return; }
      if (!(n >= 1 && n <= 10)) { err.textContent = 'Choose between 1 and 10 experts. For more, we’ll call you after booking.'; f.count.focus(); return; }
      state.org = state.org || {};
      state.org.event = Object.assign(state.org.event || { name: 'Product launch', time: '09:00 - 17:00', role: 'Usher' }, { date: f.date.value.trim(), place: f.place.value.trim(), count: n });
      state.org.booked = false;
      save(state);
      location.href = '/#/organiser';
    });
  }

  /* ---------- W3 expert sign in ---------- */
  if (page === 'signin') {
    var next = new URLSearchParams(location.search).get('next');
    if (!next || !/^[a-z]+\.html(\?id=[a-z]+)?$/.test(next)) next = 'dashboard.html';
    var stepPhone = $('#stepPhone'), stepCode = $('#stepCode'), boxes = Array.prototype.slice.call(document.querySelectorAll('.code'));
    var verify = $('#verifyBtn'), timer;
    if (state.phone) $('#phone').value = state.phone;
    function check() { verify.disabled = !boxes.every(function (b) { return /^\d$/.test(b.value); }); }
    function countdown() {
      var left = 45, el = $('#resend'); clearInterval(timer);
      el.disabled = true;
      timer = setInterval(function () {
        left--; el.textContent = left > 0 ? 'Didn’t get it? Resend in 0:' + (left < 10 ? '0' : '') + left : 'Resend code';
        if (left <= 0) { clearInterval(timer); el.disabled = false; }
      }, 1000);
      el.textContent = 'Didn’t get it? Resend in 0:45';
    }
    $('#phoneForm').addEventListener('submit', function (e) {
      e.preventDefault();
      var d = $('#phone').value.replace(/\D/g, '').slice(0, 8);
      if (d.length !== 8) { $('#phoneErr').textContent = 'Enter an 8-digit Hong Kong number.'; $('#phone').focus(); return; }
      state.phone = d.slice(0, 4) + ' ' + d.slice(4);
      $('#sentTo').textContent = 'Sent by SMS to +852 ' + state.phone;
      stepPhone.hidden = true; stepCode.hidden = false;
      boxes.forEach(function (b) { b.value = ''; }); check(); boxes[0].focus(); countdown();
    });
    $('#changeNumber').addEventListener('click', function () { stepCode.hidden = true; stepPhone.hidden = false; clearInterval(timer); $('#phone').focus(); });
    $('#resend').addEventListener('click', function () { toast('New code sent'); countdown(); });
    boxes.forEach(function (b, i) {
      b.addEventListener('input', function () {
        var v = b.value.replace(/\D/g, '');
        if (v.length > 1) v.split('').slice(0, 6 - i).forEach(function (d, k) { boxes[i + k].value = d; }); else b.value = v;
        var empty = boxes.find(function (x) { return !x.value; });
        if (b.value && empty) empty.focus();
        check();
      });
      b.addEventListener('keydown', function (e) { if (e.key === 'Backspace' && !b.value && i > 0) boxes[i - 1].focus(); });
    });
    $('#codeForm').addEventListener('submit', function (e) {
      e.preventDefault(); if (verify.disabled) return;
      state.signedIn = true; save(state); location.href = next;
    });
  }

  /* ---------- W4 expert dashboard ---------- */
  if (page === 'dashboard' && !needSignIn()) {
    var first = (state.name || '').split(' ')[0];
    var hour = new Date().getHours();
    $('#hello').textContent = (hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening') + (first ? ', ' + first : '');
    $('#me').textContent = initials(state.name);
    var booked = OFFERS.filter(function (o) { return state.offers[o.id] === 'accepted'; }).sort(function (a, b) { return a.sort - b.sort; });
    var open = OFFERS.filter(function (o) { return !state.offers[o.id]; });
    var v = state.verify;
    $('#badges').innerHTML = (v === 'verified' ? '<span class="tag lime">✓ Verified</span>' : v === 'review' ? '<span class="tag" style="color:var(--warn)">ID in review</span>' : '<a class="tag" href="/#/verify" style="color:var(--warn);text-decoration:none">Verify your ID</a>') +
      '<span class="tag">' + booked.length + ' shift' + (booked.length === 1 ? '' : 's') + ' booked</span>';

    var nx = booked[0];
    $('#next').innerHTML = nx ?
      '<div class="row between" style="flex-wrap:wrap"><p class="lbl" style="color:var(--lime)">Next shift' + (nx.sort === TODAY + 1 ? ' · tomorrow' : '') + '</p><span class="tag">' + nx.role + '</span></div>' +
      '<div><h2 style="font-size:28px;font-weight:700">' + nx.event + '</h2><p class="m" style="margin-top:4px">' + nx.date + ' · ' + nx.time + '</p></div>' +
      '<div class="facts"><div><p class="lbl">Arrive by</p><p>' + nx.arrive + '</p></div><div><p class="lbl">Where</p><p>' + short(nx.place) + ', ' + nx.spot + '</p></div>' +
      '<div><p class="lbl">Wear</p><p>' + nx.wear + ', ' + nx.wear2.toLowerCase() + '</p></div><div><p class="lbl">On-site contact</p><p>' + nx.contact.split(',')[0] + '</p></div></div>' +
      '<div class="row" style="gap:10px;flex-wrap:wrap"><a class="btn inline" href="shift.html?id=' + nx.id + '">Read the brief</a>' +
      '<a class="btn ghost inline" href="https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(nx.place) + '" target="_blank" rel="noopener">Get directions</a>' +
      '<button class="btn ghost inline" disabled style="border-style:dashed;opacity:1;color:var(--muted)">QR check-in opens ' + minus30(nx.arrive) + '</button></div>' :
      '<p class="lbl" style="color:var(--lime)">Next shift</p><div><h2 style="font-size:28px;font-weight:700">No shifts booked yet</h2>' +
      '<p class="m" style="margin-top:4px">Accept a shift below and its brief, place and dress code show up here.</p></div>' +
      '<a class="btn inline" href="#shifts" style="align-self:flex-start">Find shifts</a>';

    var total = booked.reduce(function (s, o) { return s + o.hours * o.rate; }, 0);
    $('#earnTotal').textContent = money(total);
    $('#earnLines').innerHTML = '<div class="line"><span class="m">Paid</span><span>HK$0</span></div>' +
      (nx ? '<div class="line"><span class="m">Next payout · ' + nx.paid + '</span><span class="ok">' + pay(nx) + '</span></div>' : '<div class="line"><span class="m">Next payout</span><span>None yet</span></div>') +
      (booked.length > 1 ? '<div class="line"><span class="m">Later shifts</span><span>+ ' + money(total - nx.hours * nx.rate) + '</span></div>' : '');

    var filter = 'All';
    var tests = {
      All: function () { return true; },
      'This week': function (o) { return o.sort <= TODAY + 2; },
      Usher: function (o) { return o.role === 'Usher'; },
      Registration: function (o) { return o.role === 'Registration'; },
      Weekends: function (o) { return /^(Sat|Sun)/.test(o.date); }
    };
    function list() {
      var rows = open.filter(tests[filter]);
      $('#shiftList').innerHTML = rows.length ? rows.map(function (o) {
        return '<div class="card shift-row"><div style="flex:1 1 300px;min-width:0"><div class="row" style="gap:8px;flex-wrap:wrap"><span class="title">' + o.role + ' · ' + o.event + '</span>' +
          '<span class="tag">' + o.langs + '</span>' + (o.repeat ? '<span class="tag accent">Repeat organiser</span>' : '') + '</div>' +
          '<p class="m" style="margin-top:4px">' + o.date + ' · ' + o.time + ' · ' + o.place + '</p></div>' +
          '<div class="row" style="gap:16px"><div style="text-align:right"><div style="font-size:18px;font-weight:700">' + pay(o) + '</div><div class="m s">' + o.hours + ' h × HK$' + o.rate + '</div></div>' +
          '<a class="pill" href="shift.html?id=' + o.id + '" aria-label="View ' + esc(o.role + ' · ' + o.event) + '">View</a></div></div>';
      }).join('') : '<div class="card"><p class="m">' + (open.length ? 'No shifts match this filter.' : 'You’ve answered every offer. New shifts appear here.') + '</p></div>';
    }
    Array.prototype.forEach.call(document.querySelectorAll('[data-filter]'), function (b) {
      b.addEventListener('click', function () {
        filter = b.getAttribute('data-filter');
        Array.prototype.forEach.call(document.querySelectorAll('[data-filter]'), function (x) { x.setAttribute('aria-pressed', String(x === b)); });
        list();
      });
    });
    list();

    var roles = state.roles || { Usher: true }, days = state.days || {};
    var checks = [
      ['ID verified', v === 'verified', '/#/verify', v === 'review' ? 'In review' : 'Verify now'],
      ['Roles and languages', Object.keys(roles).some(function (k) { return roles[k]; }), '/#/join', 'Add now'],
      ['Payout account', false, null, 'Add now'],
      ['Weekly availability', Object.keys(days).some(function (k) { return days[k]; }), '/#/offers', 'Add now']
    ];
    var done = checks.filter(function (c) { return c[1]; }).length;
    $('#checkCount').textContent = done + ' of 4 done';
    $('#checkBars').innerHTML = checks.map(function (c, i) { return '<i class="' + (i < done ? 'on' : '') + '"></i>'; }).join('');
    $('#checkRows').innerHTML = checks.map(function (c) {
      var right = c[1] ? '<span class="ok">Done</span>' : c[2] ? '<a href="' + c[2] + '">' + c[3] + '</a>' :
        '<button class="link-btn" style="color:var(--text);padding:0;min-height:0" data-soon="Payouts by FPS are coming in the next build">' + c[3] + '</button>';
      return '<div class="line"><span>' + c[0] + '</span>' + right + '</div>';
    }).join('');
  }

  /* ---------- W5 shift details ---------- */
  if (page === 'shift' && !needSignIn()) {
    var o = offer(new URLSearchParams(location.search).get('id')) || OFFERS[0];
    document.title = o.role + ' · ' + o.event + ' · AXPER';
    function render() {
      var st = state.offers[o.id], acc = st === 'accepted';
      $('#banner').hidden = !acc;
      $('#bannerTitle').textContent = 'You’re booked for ' + o.date;
      $('#tags').innerHTML = '<span class="tag">' + o.role + '</span><span class="tag">' + o.langs + ' needed</span>' + (o.repeat ? '<span class="tag accent">Repeat organiser</span>' : '');
      $('#title').textContent = o.event;
      $('#sub').textContent = o.date + ' · ' + o.time + ' · ' + o.place;
      $('#where').textContent = short(o.place) + ', ' + o.spot;
      $('#whereNote').textContent = o.note;
      $('#map').href = 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(o.place);
      $('#when').textContent = 'Arrive ' + o.arrive + ' for a 15-minute briefing';
      $('#whenNote').textContent = 'Shift ' + o.time + '. QR check-in opens at ' + minus30(o.arrive) + '.';
      $('#wear').textContent = o.wear;
      $('#wearNote').textContent = o.wear2 + '.';
      $('#tasks').innerHTML = o.tasks.map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('');
      $('#contact').textContent = acc ? o.contact : 'Shown once you accept';
      $('#contactNote').textContent = acc ? 'Call or message from the app. AXPER support is on call during your shift.' : 'AXPER support is on call during every shift.';
      $('#teamText').textContent = 'You and ' + o.team.length + ' other expert' + (o.team.length === 1 ? '' : 's');
      $('#team').innerHTML = o.team.map(function (i) { return '<span class="av" aria-hidden="true" style="width:40px;height:40px;font-size:13px">' + i + '</span>'; }).join('');
      $('#pay').textContent = pay(o);
      $('#payRows').innerHTML = '<div class="line"><span class="m">' + o.hours + ' h × HK$' + o.rate + '</span><span>' + pay(o) + '</span></div>' +
        '<div class="line"><span class="m">Paid by</span><span>' + o.paid + '</span></div>' +
        '<div class="line"><span class="m">Paid to</span><span>FPS · not set up yet</span></div>';
      $('#cancelNote').textContent = 'You can cancel free until ' + o.cancelBy + ' (48 hours before).';
      $('#keepPay').textContent = 'If the organiser cancels after ' + o.cancelBy.split(',')[0] + ', you still get paid [minimum hours].';
      $('#actions').innerHTML = acc ?
        '<div class="booked-pill">Booked</div><button class="btn ghost small" data-act="undo">Can’t make it?</button>' :
        st === 'declined' ?
        '<p class="m center">You passed on this shift.</p><button class="btn ghost small" data-act="undo">Undo</button><a class="btn small" href="dashboard.html#shifts">Back to shifts</a>' :
        '<button class="btn" data-act="accept">Accept shift</button><button class="btn ghost small" data-act="decline">Not for me</button>';
    }
    document.addEventListener('click', function (e) {
      var b = e.target.closest('[data-act]'); if (!b) return;
      var act = b.getAttribute('data-act');
      if (act === 'accept') { state.offers[o.id] = 'accepted'; toast('You’re booked'); window.scrollTo({ top: 0, behavior: 'smooth' }); }
      if (act === 'decline') state.offers[o.id] = 'declined';
      if (act === 'undo') delete state.offers[o.id];
      if (act === 'ics') { A.ics(o.role + ' · ' + o.event, o.date, o.time, o.place, 'Arrive ' + o.arrive + '. ' + o.note); return; }
      save(state); render();
    });
    render();
  }
})();
