/* Axper app for organisers and experts.
   With config.js filled in, sign-in uses real SMS codes and accounts, events and availability are saved in Supabase
   (see db.js). With config.js empty it runs as a preview: everything is saved in this browser only.
   ID checks, payments, matching and offers are still simulated in both modes. */
(function () {
  'use strict';

  var KEY = window.AXPER.KEY;
  var DB = window.AXPER_DB || { live: false };
  var ROLES = ['Usher', 'Registration', 'Booth', 'Setup crew'];
  var LANGS = ['Cantonese', 'English', 'Mandarin'];
  var DAYS = [['mon', 'Mon'], ['tue', 'Tue'], ['wed', 'Wed'], ['thu', 'Thu'], ['fri', 'Fri'], ['sat', 'Sat'], ['sun', 'Sun']];
  var TIMES = ['Morning', 'Afternoon', 'Evening'];

  var OFFERS = window.AXPER.OFFERS; /* shared with the website, see data.js */

  /* Sample experts an organiser gets matched with (preview data). */
  var EXPERTS = [
    { i: 'AL', name: 'Amy L.', langs: 'English, Cantonese', rating: '4.9', events: 32, live: 'ok', at: '08:42' },
    { i: 'KW', name: 'Kevin W.', langs: 'Mandarin, English', rating: '4.8', events: 18, live: 'ok', at: '08:50' },
    { i: 'JT', name: 'Jessica T.', langs: 'Cantonese, English', rating: '4.9', events: 27, live: 'way', at: '09:05' },
    { i: 'DO', name: 'Daniel O.', langs: 'English', rating: '4.7', events: 12, live: 'late', at: '25' },
    { i: 'MC', name: 'Mandy C.', langs: 'Cantonese, Mandarin', rating: '4.8', events: 21, live: 'ok', at: '08:38' },
    { i: 'RH', name: 'Ryan H.', langs: 'English, Cantonese', rating: '4.6', events: 9, live: 'ok', at: '08:47' },
    { i: 'SY', name: 'Sandy Y.', langs: 'Cantonese, English', rating: '4.9', events: 40, live: 'ok', at: '08:35' },
    { i: 'BN', name: 'Ben N.', langs: 'Mandarin, Cantonese', rating: '4.7', events: 15, live: 'ok', at: '08:44' },
    { i: 'GL', name: 'Grace L.', langs: 'English, Mandarin', rating: '4.8', events: 23, live: 'ok', at: '08:51' },
    { i: 'TC', name: 'Tom C.', langs: 'Cantonese', rating: '4.6', events: 11, live: 'ok', at: '08:40' }
  ];
  var BACKUP = { i: 'WC', name: 'Wing C.', langs: 'Cantonese, English', rating: '4.8', events: 19, live: 'way', at: '09:20' };
  var MAX_EXPERTS = EXPERTS.length, RATE = 80, FEE = 0.1;

  /* ---------- state ---------- */
  function freshOrg() {
    return {
      phone: '', email: '', via: 'phone', name: '', company: '', signedIn: false,
      event: { name: '', date: '', time: '', place: '', role: 'Usher', count: 6 },
      backup: true, booked: false, swapped: false, brief: '', showAll: false,
      plan: '', planPick: 'lite' /* '' until the organiser picks Lite or Pro after sign-up */
    };
  }
  function fresh() {
    return {
      mode: 'expert', /* which flow the shared code screen belongs to */
      phone: '', name: '', roles: { Usher: true }, langs: { Cantonese: true },
      signedIn: false, idPhoto: false, selfie: false, verify: 'none', /* none | review | verified */
      days: { fri: true, sat: true, sun: true }, times: { Morning: true, Afternoon: true },
      dateFree: {}, repeat: true, calMonth: 0, calSel: '', /* My schedule: one-off changes to the weekly pattern, by date */
      offers: {}, lang: 'EN', org: freshOrg()
    };
  }
  var state = load();
  var uploading = {}; /* ID photos on their way up, by key */
  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      if (raw) { var s = Object.assign(fresh(), JSON.parse(raw)); s.org = Object.assign(freshOrg(), s.org); return s; }
    } catch (e) {}
    return fresh();
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {} }

  /* ---------- helpers ---------- */
  var app = document.getElementById('app');
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function go(path) { location.hash = '#' + path; }
  function pay(o) { return 'HK$' + (o.hours * o.rate).toLocaleString('en'); }
  function offer(id) { for (var i = 0; i < OFFERS.length; i++) if (OFFERS[i].id === id) return OFFERS[i]; return null; }
  function toast(msg) {
    var t = document.createElement('div'); t.className = 'toast'; t.setAttribute('role', 'status'); t.textContent = msg;
    document.body.appendChild(t); setTimeout(function () { t.remove(); }, 2200);
  }
  function money(n) { return 'HK$' + Math.round(n).toLocaleString('en'); }
  function hoursOf(t) {
    var m = String(t).match(/(\d{1,2}):(\d{2})\D+(\d{1,2}):(\d{2})/);
    if (!m) return 8;
    var h = (+m[3] * 60 + +m[4] - (+m[1] * 60 + +m[2])) / 60;
    if (h <= 0) h += 24;
    return Math.round(h * 2) / 2;
  }
  /* O2 drop-downs: dates from tomorrow for 6 months, times every 30 minutes */
  var WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], MO = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function dateOptions(cur) {
    var out = [], d = new Date(), seen = false;
    d.setHours(12, 0, 0, 0);
    for (var i = 1; i <= 183; i++) {
      d.setDate(d.getDate() + 1);
      var v = WD[d.getDay()] + ' ' + d.getDate() + ' ' + MO[d.getMonth()];
      if (v === cur) seen = true;
      out.push('<option value="' + v + '"' + (v === cur ? ' selected' : '') + '>' + v + ' ' + d.getFullYear() + '</option>');
    }
    return '<option value=""' + (seen ? '' : ' selected') + ' disabled>Choose a date</option>' + out.join('');
  }
  function timeParts(t) {
    function p(x) { var m = String(x || '').match(/(\d{1,2}):(\d{2})/); return m ? (+m[1] < 10 ? '0' : '') + +m[1] + ':' + (+m[2] < 30 ? '00' : '30') : ''; }
    var a = String(t || '').split(/\s+[-–]\s*/);
    return { start: p(a[0]), end: p(a[1]) };
  }
  function timeOptions(cur, label) {
    var out = ['<option value=""' + (cur ? '' : ' selected') + ' disabled>' + label + '</option>'];
    for (var i = 0; i < 48; i++) {
      var v = (i < 20 ? '0' : '') + Math.floor(i / 2) + ':' + (i % 2 ? '30' : '00');
      out.push('<option value="' + v + '"' + (v === cur ? ' selected' : '') + '>' + v + '</option>');
    }
    return out.join('');
  }
  function lengthText(t) { var tp = timeParts(t); if (!tp.start || !tp.end) return ''; var h = hoursOf(t); return 'Shift length: <b>' + h + (h === 1 ? ' hour' : ' hours') + '</b>'; }
  function isOther(e) { return !!e.other || (!!e.role && ROLES.indexOf(e.role) < 0); }
  function quote() {
    var e = state.org.event, h = hoursOf(e.time), base = e.count * h * RATE, fee = base * FEE;
    return { hours: h, base: base, fee: fee, total: base + fee };
  }
  function team() { return EXPERTS.slice(0, state.org.event.count); }
  function av(p, cls) { return '<span class="av' + (cls ? ' ' + cls : '') + '" aria-hidden="true">' + p.i + '</span>'; }
  var I = {
    close: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    globe: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><path d="M3 12h18"/></svg>',
    share: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v12M8 7l4-4 4 4M5 13v6h14v-6"/></svg>',
    calW: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M8 3v4M16 3v4"/></svg>',
    pinW: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 21s-6-5.5-6-10a6 6 0 0 1 12 0c0 4.5-6 10-6 10z"/><circle cx="12" cy="11" r="2"/></svg>',
    back: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg>',
    id: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#C8F169" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="12" r="2.5"/><path d="M14 10h4M14 14h3"/></svg>',
    person: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#C8F169" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="9" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/></svg>',
    clock: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#C8F169" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
    pin: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#C8F169" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 21s-6-5.5-6-10a6 6 0 0 1 12 0c0 4.5-6 10-6 10z"/><circle cx="12" cy="11" r="2"/></svg>',
    shirt: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#C8F169" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 4l-4 3 2 4 2-1v10h8V10l2 1 2-4-4-3c-1 2-2.5 3-4 3s-3-1-4-3z"/></svg>',
    list: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h10"/></svg>',
    brief: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="7" width="18" height="13" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/></svg>',
    cal: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M8 3v4M16 3v4"/></svg>'
  };
  function backBtn(to, label) { return '<a class="icon-btn" href="#' + to + '" aria-label="' + (label || 'Back') + '">' + I.back + '</a>'; }
  function progress(n, of) {
    var s = ''; for (var i = 1; i <= of; i++) s += '<i class="' + (i <= n ? 'on' : '') + '"></i>';
    return '<div class="progress" aria-hidden="true">' + s + '</div>';
  }
  function tabs(active) {
    return '<nav class="tabs" aria-label="Main"><div class="tabs-inner">' +
      '<a class="tab" href="#/offers"' + (active === 'offers' ? ' aria-current="page"' : '') + '>' + I.list + 'Offers</a>' +
      '<a class="tab" href="#/schedule"' + (active === 'schedule' ? ' aria-current="page"' : '') + '>' + I.cal + 'My schedule</a>' +
      '<a class="tab" href="#/shifts"' + (active === 'shifts' ? ' aria-current="page"' : '') + '>' + I.brief + 'My shifts</a>' +
      '</div></nav>';
  }
  function chips(list, sel, group) {
    return list.map(function (x) {
      return '<button type="button" class="chip" data-toggle="' + group + '" data-val="' + esc(x) + '" aria-pressed="' + (!!sel[x]) + '">' + esc(x) + '</button>';
    }).join('');
  }
  function needAccount() { if (!state.signedIn) { go('/join'); return true; } return false; }

  /* ---------- screens ---------- */
  var screens = {};

  screens.home = function () {
    var o = state.org;
    var have = o.booked ? '#/booked' : o.signedIn ? '#/event' : state.signedIn ? '#/offers' : '#/signin';
    return '<div class="row between"><span class="logo">AXPER<span class="dot">.</span></span>' +
      '<button type="button" class="chip lang" data-lang="next" aria-label="Language">' + I.globe + '</button></div>' +
      '<div class="grow"></div>' +
      '<div><h1 class="big-title">Event experts, simply booked.</h1><p class="m" style="margin-top:12px;font-size:16px">Find experts for your event, or find your next shift.</p></div>' +
      '<div style="display:flex;flex-direction:column;gap:12px;margin-top:8px">' +
      '<a class="choice primary" href="#/organiser"><b>I need experts</b><span style="font-size:15px">Post an event and pick your team</span></a>' +
      '<a class="choice" href="#/join"><b>I want to work</b><span class="m">Find shifts at events in Hong Kong</span></a></div>' +
      '<section class="card steps" aria-label="How it works"><p class="m s" style="font-size:14px">How it works</p>' +
      '<span>1&nbsp;&nbsp;Share your event details</span><span>2&nbsp;&nbsp;Review the price and experts</span><span>3&nbsp;&nbsp;Confirm, and we handle the rest</span></section>' +
      '<div class="grow"></div>' +
      '<a class="btn ghost small" href="' + have + '">I already have an account</a>';
  };

  /* ---------- organiser flow: O1 sign-up → code → O2 event → O3 price → O4 booked → O5 event day ---------- */
  function needOrg() { if (!state.org.signedIn) { go('/organiser'); return true; } return false; }

  screens.organiser = function () {
    if (state.org.signedIn) { go(state.org.booked ? '/booked' : '/event'); return ''; }
    var o = state.org;
    return '<div class="row between">' + backBtn('/') + '<span class="m">Organiser</span></div>' +
      '<div><h1>Create your account</h1><p class="m" style="margin-top:6px">Book event experts with your phone number or email.</p></div>' +
      '<div class="seg" role="group" aria-label="Sign up with">' +
      '<button type="button" data-act="via" data-val="phone" aria-pressed="' + (o.via !== 'email') + '">Phone</button>' +
      '<button type="button" data-act="via" data-val="email" aria-pressed="' + (o.via === 'email') + '">Email</button></div>' +
      '<form id="orgForm" class="grow" style="display:flex;flex-direction:column;gap:16px" novalidate>' +
      (o.via === 'email' ?
        '<div><label class="label" for="email">Email</label><input class="input" id="email" name="email" type="email" inputmode="email" autocomplete="email" placeholder="you@company.com" value="' + esc(o.email) + '" required>' +
        '<p class="m s" style="margin-top:6px">We’ll email you a 6-digit code.</p></div>' :
        '<div><label class="label" for="phone">Phone number</label><div class="row" style="gap:10px"><div class="prefix">+852</div>' +
        '<input class="input" id="phone" name="phone" type="tel" inputmode="numeric" autocomplete="tel-national" placeholder="9123 4567" value="' + esc(o.phone) + '" required></div></div>') +
      '<div><label class="label" for="name">Your name</label><input class="input" id="name" name="name" autocomplete="name" placeholder="Chris Lee" value="' + esc(o.name) + '" required></div>' +
      '<div><label class="label" for="company">Company or event name (optional)</label><input class="input" id="company" name="company" autocomplete="organization" value="' + esc(o.company) + '"></div>' +
      '<p class="m s" id="joinErr" role="alert" style="color:#FF8A80"></p>' +
      '<div class="grow"></div><button class="btn" type="submit">Send code</button>' +
      '<p class="m s center">By continuing you accept the Terms and Privacy Policy.</p></form>';
  };

  /* O1b: choose a plan right after sign-up */
  screens.plan = function () {
    if (needOrg()) return '';
    var o = state.org, pick = o.planPick === 'pro' ? 'pro' : 'lite', P = window.AXPER.PLANS;
    function card(key, name, price) {
      return '<button type="button" class="plan" data-plan="' + key + '" aria-pressed="' + (pick === key) + '">' +
        '<span class="row between" style="width:100%"><b style="font-size:20px">' + name + '</b>' +
        (key === 'pro' ? '<span class="badge">Most cover</span>' : '') + '</span>' +
        '<span class="price">' + price + '</span>' +
        '<ul>' + P[key].map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul></button>';
    }
    return '<div class="row between">' + backBtn(o.plan ? '/event' : '/organiser') + '<span class="m">Organiser</span></div>' +
      '<div><h1>Choose your plan</h1><p class="m" style="margin-top:6px">Start free. Upgrade when you need more.</p></div>' +
      card('lite', 'Lite', 'Free') + card('pro', 'Pro', window.AXPER.proPrice()) +
      '<div class="grow"></div><button type="button" class="btn" data-act="choosePlan">Continue with ' + (pick === 'pro' ? 'Pro' : 'Lite') + '</button>' +
      '<p class="m s center">' + (pick === 'pro' ? 'Preview: no payment is taken.' : 'You can change your plan any time.') + '</p>';
  };

  screens.event = function () {
    if (needOrg()) return '';
    if (!state.org.plan) { go('/plan'); return ''; }
    var e = state.org.event, tp = timeParts(e.time), other = isOther(e);
    return '<div class="row between"><a class="icon-btn" href="#/" aria-label="Close">' + I.close + '</a><span class="m">Step 1 of 3</span></div>' + progress(1, 3) +
      '<div><h1>Book experts</h1><p class="m" style="margin-top:6px">Tell us the basics. We handle the rest.</p></div>' +
      '<form id="eventForm" class="grow" style="display:flex;flex-direction:column;gap:14px" novalidate>' +
      '<div><label class="label" for="evName">Event name</label><input class="input" id="evName" name="evName" placeholder="What is the event called?" value="' + esc(e.name) + '" required></div>' +
      '<div><label class="label" for="evDate">Date</label><select class="input select" id="evDate" name="evDate" required>' + dateOptions(e.date) + '</select></div>' +
      '<div><div class="row"><div class="grow" style="min-width:0"><label class="label" for="evStart">Start time</label><select class="input select" id="evStart" name="evStart" data-time required>' + timeOptions(tp.start, 'Start') + '</select></div>' +
      '<div class="grow" style="min-width:0"><label class="label" for="evEnd">End time</label><select class="input select" id="evEnd" name="evEnd" data-time required>' + timeOptions(tp.end, 'End') + '</select></div></div>' +
      '<p class="m s" id="evLength" aria-live="polite" style="margin-top:8px">' + lengthText(tp.start + ' - ' + tp.end) + '</p></div>' +
      '<div><label class="label" for="evPlace">Place</label><input class="input" id="evPlace" name="evPlace" autocomplete="street-address" placeholder="Where is the event?" value="' + esc(e.place) + '" required></div>' +
      '<div><p class="label" id="roleL">Role</p><div class="chips" role="group" aria-labelledby="roleL">' +
      ROLES.map(function (r) { return '<button type="button" class="chip" data-pick="role" data-val="' + esc(r) + '" aria-pressed="' + (!other && e.role === r) + '">' + esc(r) + '</button>'; }).join('') +
      '<button type="button" class="chip" data-pick="role" data-val="" data-other aria-pressed="' + other + '">Other</button></div>' +
      '<input class="input" id="evRoleOther" name="evRoleOther" maxlength="60" aria-label="Role you need" placeholder="What role do you need?" style="margin-top:10px" value="' + (other ? esc(e.role) : '') + '"' + (other ? '' : ' hidden') + '></div>' +
      '<div class="card row between"><span class="n" id="countL">How many experts?</span><div class="stepper">' +
      '<button type="button" class="icon-btn" data-act="less" aria-label="Fewer experts">−</button>' +
      '<output class="n" id="count" aria-labelledby="countL" aria-live="polite">' + e.count + '</output>' +
      '<button type="button" class="icon-btn" data-act="more" aria-label="More experts">+</button></div></div>' +
      '<p class="m s" id="joinErr" role="alert" style="color:#FF8A80"></p>' +
      '<div class="grow"></div><button class="btn" type="submit">See price and experts</button></form>';
  };

  screens.review = function () {
    if (needOrg()) return '';
    var o = state.org, e = o.event, q = quote(), list = team();
    var shown = o.showAll ? list : list.slice(0, 2), more = list.length - shown.length;
    var people = shown.map(function (p) {
      return '<div class="card person">' + av(p) + '<div class="grow"><div class="n">' + p.name + '</div><div class="m s">' + esc(e.role) + ' · ' + p.langs + '</div></div>' +
        '<div style="text-align:right"><div class="n">' + p.rating + '</div><div class="m s">' + p.events + ' events</div></div></div>';
    }).join('');
    return '<div class="row between">' + backBtn('/event') + '<span class="m">Step 2 of 3</span></div>' + progress(2, 3) +
      '<div><h1>Your experts</h1><p class="m" style="margin-top:6px">' + list.length + ' verified expert' + (list.length === 1 ? '' : 's') + ' matched</p></div>' +
      people +
      (more > 0 ? '<button type="button" class="chip" data-act="showAll" style="align-self:flex-start">Show ' + more + ' more</button>' : '') +
      '<section class="card" aria-label="Price" style="display:flex;flex-direction:column;gap:10px">' +
      '<div class="sum"><span class="m">Plan</span><span>' + (o.plan === 'pro' ? 'Pro' : 'Lite · free') + ' · <a href="#/plan" style="color:var(--text)">Change</a></span></div>' +
      '<div class="sum"><span class="m">' + e.count + ' expert' + (e.count === 1 ? '' : 's') + ' × ' + q.hours + ' h × HK$' + RATE + '</span><span>' + money(q.base) + '</span></div>' +
      '<div class="sum"><span class="m">AXPER service fee</span><span>' + money(q.fee) + '</span></div>' +
      '<div class="sum total"><span class="n">Total</span><span class="n">' + money(q.total) + '</span></div></section>' +
      (o.plan === 'pro' ?
        '<label class="card row between" for="backup"><span><span class="n" style="display:block">Add a backup expert</span><span class="m s">Charged only if used</span></span>' +
        '<input type="checkbox" class="check" id="backup" data-check="backup"' + (o.backup ? ' checked' : '') + '></label>' :
        '<a class="card row between" href="#/plan" style="text-decoration:none;color:var(--text)"><span><span class="n" style="display:block">Backup experts</span><span class="m s">Included with Pro, with insurance and pre-training</span></span><span class="m">Upgrade</span></a>') +
      '<div class="grow"></div><button type="button" class="btn" data-act="pay">Confirm and pay ' + money(q.total) + '</button>' +
      '<p class="m s center">Preview: no payment is taken.</p>';
  };

  function longDate(d) {
    var days = { Mon: 'Monday', Tue: 'Tuesday', Wed: 'Wednesday', Thu: 'Thursday', Fri: 'Friday', Sat: 'Saturday', Sun: 'Sunday' };
    var mon = { Jan: 'January', Feb: 'February', Mar: 'March', Apr: 'April', May: 'May', Jun: 'June', Jul: 'July', Aug: 'August', Sep: 'September', Oct: 'October', Nov: 'November', Dec: 'December' };
    var m = String(d).match(/^(\w{3})\w*\s+(\d{1,2})\s+(\w{3})/);
    return m && days[m[1]] && mon[m[3]] ? days[m[1]] + ', ' + m[2] + ' ' + mon[m[3]] : d;
  }
  function shareText() {
    var e = state.org.event;
    return e.name + ' · ' + e.date + ', ' + e.time + ' · ' + e.place + '. ' + e.count + ' AXPER experts confirmed.';
  }

  screens.booked = function () {
    if (needOrg()) return '';
    var o = state.org; if (!o.booked) { go('/review'); return ''; }
    var e = o.event, list = team();
    var stack = list.slice(0, 4).map(function (p) { return av(p); }).join('') + (list.length > 4 ? '<span class="av" aria-hidden="true">+' + (list.length - 4) + '</span>' : '');
    var host = { i: (o.name || 'You').split(/\s+/).map(function (w) { return w[0]; }).join('').slice(0, 2).toUpperCase() };
    return '<div class="row between">' + backBtn('/review') + '<span class="m">Booked</span>' +
      '<button type="button" class="icon-btn" data-act="share" aria-label="Share">' + I.share + '</button></div>' +
      '<div><h1>' + esc(e.name) + '</h1><div class="row" style="margin-top:10px;gap:8px">' + av(host, 'sm') + '<span class="m">Hosted by ' + esc(o.name) + '</span></div></div>' +
      '<div class="row"><span class="box">' + I.calW + '</span><div><div class="n">' + esc(longDate(e.date)) + '</div><div class="m s">' + esc(e.time) + '</div></div></div>' +
      '<div class="row"><span class="box">' + I.pinW + '</span><div><div class="n">' + esc(e.place) + '</div><div class="m s">' + esc(e.role) + '</div></div></div>' +
      '<div class="card row between"><div class="stack">' + stack + '</div><div style="text-align:right"><div class="n">Confirmed</div>' +
      '<div class="m s">' + list.length + ' expert' + (list.length === 1 ? '' : 's') + (o.backup ? ' + 1 backup' : '') + '</div></div></div>' +
      '<div class="grow" style="display:flex;flex-direction:column"><label class="label" for="brief" style="font-size:17px;font-weight:600;color:var(--text)">Event brief</label>' +
      '<textarea class="input grow" id="brief" data-brief placeholder="Dress code, where to meet, who to ask for on the day">' + esc(o.brief) + '</textarea></div>' +
      '<a class="btn" href="https://wa.me/?text=' + encodeURIComponent(shareText()) + '" target="_blank" rel="noopener">Share on WhatsApp</a>' +
      '<button type="button" class="btn ghost small" data-act="ics">Add to calendar</button>' +
      '<a class="m s center" href="#/live">Open the event day view</a>';
  };

  screens.live = function () {
    if (needOrg()) return '';
    var o = state.org; if (!o.booked) { go('/review'); return ''; }
    var e = o.event, list = team().slice();
    var lateAt = -1;
    list.forEach(function (p, i) { if (p.live === 'late') lateAt = i; });
    if (o.swapped && lateAt >= 0) list[lateAt] = BACKUP;
    var on = list.filter(function (p) { return p.live === 'ok'; }).length;
    var bars = list.map(function (p, i) { return '<i class="' + (i < on ? 'on' : '') + '"></i>'; }).join('');
    var rows = list.map(function (p) {
      var st = p.live === 'ok' ? '<span class="ok">On site · ' + p.at + '</span>' :
        p.live === 'way' ? '<span class="way">' + (p === BACKUP ? 'Backup on the way · ETA ' : 'On the way · ETA ') + p.at + '</span>' :
        '<span class="late">Not arrived · ' + p.at + ' min late</span>';
      var late = p.live === 'late';
      return '<div class="card' + (late ? ' alert' : '') + '"><div class="person">' + av(p) + '<div class="grow"><div class="n">' + p.name + '</div><div class="m s">' + st + '</div></div></div>' +
        (late && o.backup ? '<button type="button" class="btn small" data-act="swap" style="margin-top:12px">Swap in backup</button>' : '') + '</div>';
    }).join('');
    return '<div class="row between">' + backBtn('/booked') + '<span class="m">Live · ' + esc(e.date) + '</span></div>' +
      '<div><h1>' + esc(e.name) + '</h1><p class="m" style="margin-top:6px">Experts scan a QR code to check in</p></div>' +
      '<section class="card" aria-label="Check-ins"><div class="sum" style="align-items:baseline"><span style="font-size:34px;font-weight:700">' + on + ' of ' + list.length + '</span><span class="m">on site</span></div>' +
      '<div class="progress" style="margin-top:12px" aria-hidden="true">' + bars + '</div></section>' +
      rows + '<div class="grow"></div>' +
      '<button type="button" class="btn ghost" data-act="msgAll">Message all experts</button>' +
      '<p class="m s center">Preview: check-ins are sample data.</p>';
  };

  screens.join = function () {
    return '<div class="row between">' + backBtn('/') + '<span class="m">Step 1 of 2</span></div>' + progress(1, 2) +
      '<div><h1>Join as an expert</h1><p class="m" style="margin-top:6px">Two quick steps, then browse shifts.</p></div>' +
      '<form id="joinForm" style="display:flex;flex-direction:column;gap:16px" novalidate>' +
      '<div><label class="label" for="phone">Phone number</label><div class="row" style="gap:10px"><div class="prefix">+852</div>' +
      '<input class="input" id="phone" name="phone" type="tel" inputmode="numeric" autocomplete="tel-national" placeholder="9876 5432" value="' + esc(state.phone) + '" required></div></div>' +
      '<div><label class="label" for="name">Your name</label><input class="input" id="name" name="name" autocomplete="name" placeholder="Amy Lam" value="' + esc(state.name) + '" required></div>' +
      '<div><p class="label" id="rolesL">What can you do?</p><div class="chips" role="group" aria-labelledby="rolesL">' + chips(ROLES, state.roles, 'roles') + '</div></div>' +
      '<div><p class="label" id="langsL">Languages</p><div class="chips" role="group" aria-labelledby="langsL">' + chips(LANGS, state.langs, 'langs') + '</div></div>' +
      '<p class="m s" id="joinErr" role="alert" style="color:#FF8A80"></p>' +
      '<button class="btn" type="submit">Send code and continue</button></form>';
  };

  screens.signin = function () {
    return '<div class="row between">' + backBtn('/') + '<span class="m">Sign in</span></div>' +
      '<div style="margin-top:12px"><h1>Welcome back</h1><p class="m" style="margin-top:6px">We’ll text you a 6-digit code.</p></div>' +
      '<form id="signinForm" style="display:flex;flex-direction:column;gap:16px" novalidate>' +
      '<div><label class="label" for="phone">Phone number</label><div class="row" style="gap:10px"><div class="prefix">+852</div>' +
      '<input class="input" id="phone" name="phone" type="tel" inputmode="numeric" autocomplete="tel-national" placeholder="9876 5432" value="' + esc(state.phone) + '"></div></div>' +
      '<p class="m s" id="joinErr" role="alert" style="color:#FF8A80"></p>' +
      '<button class="btn" type="submit">Send code</button></form>';
  };

  screens.code = function () {
    var boxes = ''; for (var i = 1; i <= 6; i++) boxes += '<input class="code" inputmode="numeric" maxlength="1" aria-label="Digit ' + i + '" autocomplete="' + (i === 1 ? 'one-time-code' : 'off') + '">';
    var org = state.mode === 'organiser';
    var head = org ? '<div class="row between">' + backBtn('/organiser') + '<span class="m">Organiser</span></div>' :
      '<div class="row between">' + backBtn(state.name ? '/join' : '/signin') + '<span class="m">Step 1 of 2</span></div>' + progress(1, 2);
    return head +
      '<div><h1>Enter your code</h1><p class="m" style="margin-top:6px">Sent to ' + (org && state.org.via === 'email' ? esc(state.org.email) : '+852 ' + esc(org ? state.org.phone : state.phone)) + '</p></div>' +
      '<div class="codes" id="codes">' + boxes + '</div>' +
      '<p class="m s">' + (DB.live ? 'It can take up to a minute to arrive.' : 'Preview: any 6 digits work.') + '</p>' +
      '<p class="m s" id="codeErr" role="alert" style="color:#FF8A80"></p>' +
      '<div class="grow"></div><button class="btn" id="verifyCode" disabled>Continue</button>' +
      '<button type="button" class="btn ghost small" data-act="resend">Resend code</button>';
  };

  screens.verify = function () {
    if (needAccount()) return '';
    if (state.verify !== 'none') {
      /* already sent: show where things stand instead of the upload boxes */
      var st = state.verify === 'verified' ? ['✓ Verified', 'Your ID is checked. You get shift offers that match your roles and your schedule.'] :
        state.verify === 'paused' ? ['Paused', 'AXPER has paused your offers for now. We’ll be in touch by SMS.'] :
        ['ID in review', 'AXPER checks your photos, usually within 1 working day.'];
      return '<div class="row between">' + backBtn('/offers') + '<span class="m">Your ID</span></div>' +
        '<div><h1>Verify your ID</h1></div>' +
        '<div class="card" style="display:flex;flex-direction:column;gap:8px"><span class="badge' + (state.verify === 'verified' ? '' : ' wait') + '" style="align-self:flex-start">' + st[0] + '</span>' +
        '<p class="m" style="margin:0">' + st[1] + '</p></div>' +
        '<div class="grow"></div><a class="btn ghost small" href="#/offers">Back to offers</a>';
    }
    function task(key, title, sub, ico, round, capture) {
      var done = state[key], up = uploading[key];
      return '<label class="task' + (done ? ' done' : '') + '" style="position:relative">' +
        '<span class="ico" style="' + (round ? 'border-radius:24px' : '') + '">' + ico + '</span>' +
        '<span class="grow"><span style="display:block;font-size:18px;font-weight:600">' + title + '</span><span class="m s" style="display:block">' + sub + '</span></span>' +
        '<span class="status">' + (up ? 'Uploading…' : done ? '✓ Added' : (key === 'selfie' ? 'Take' : 'Add')) + '</span>' +
        '<input class="file" type="file" accept="image/*"' + (capture ? ' capture="' + capture + '"' : '') + ' data-file="' + key + '" aria-label="' + title + '"' + (up ? ' disabled' : '') + '></label>';
    }
    var ready = state.idPhoto && state.selfie && !uploading.idPhoto && !uploading.selfie;
    return '<div class="row between">' + backBtn('/join') + '<span class="m">Step 2 of 2</span></div>' + progress(2, 2) +
      '<div><h1>Verify your ID</h1><p class="m" style="margin-top:6px">Organisers see a verified badge on your profile.</p></div>' +
      task('idPhoto', 'Photo of your ID', 'Hong Kong ID card', I.id, false, 'environment') +
      task('selfie', 'Picture', 'To match your ID', I.person, true, 'user') +
      '<div class="card"><h2>What happens next</h2><p class="m" style="margin-top:6px">We check your ID, usually within 1 working day. You can browse shifts while you wait.</p></div>' +
      '<p class="m s" id="verifyErr" role="alert" style="color:#FF8A80"></p>' +
      '<div class="grow"></div><button class="btn" id="submitVerify"' + (ready ? '' : ' disabled') + '>Submit for review</button>' +
      '<p class="m s center">' + (DB.live ? 'Only you and the AXPER team can see your photos.' : 'Preview: photos stay on this phone and are not uploaded.') + '</p>';
  };

  /* E2b: book the AXPER interview. Weekdays and Saturdays for the next 8 days, four times a day (Hong Kong time). */
  var SLOT_TIMES = ['10:00', '11:30', '14:00', '16:30'];
  function slotDays() {
    var out = [], d = new Date();
    while (out.length < 6) {
      d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);
      if (d.getDay() !== 0) out.push(d);
    }
    return out;
  }
  function dayLabel(d) { return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()] + ' ' + d.getDate(); }
  function slotIso(d, t) {
    function p(n) { return (n < 10 ? '0' : '') + n; }
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + 'T' + t + ':00+08:00';
  }
  screens.interview = function () {
    /* interviews are switched off for now: E2b is kept for later */
    go(state.signedIn ? '/offers' : '/join'); return '';
    if (needAccount()) return '';
    if (state.verify === 'none') { go('/verify'); return ''; }
    var days = slotDays(), pick = state.slotPick || {};
    var day = days.filter(function (d) { return dayLabel(d) === pick.day; })[0];
    var label = day && pick.time ? dayLabel(day) + ' ' + ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][day.getMonth()] + ', ' + pick.time : '';
    return '<div class="row between">' + backBtn('/verify') + '<span class="m">Step 2 of 2</span></div>' + progress(2, 2) +
      '<div><h1>Book your interview</h1><p class="m" style="margin-top:6px">A 15-minute video call with the AXPER team. You get offers once you pass.</p></div>' +
      '<div><p class="label" id="dayL">Day</p><div class="chips" role="group" aria-labelledby="dayL">' + days.map(function (d) {
        return '<button type="button" class="chip" data-slot="day" data-val="' + dayLabel(d) + '" aria-pressed="' + (pick.day === dayLabel(d)) + '">' + dayLabel(d) + '</button>'; }).join('') + '</div></div>' +
      '<div><p class="label" id="timeL">Time</p><div class="chips" role="group" aria-labelledby="timeL">' + SLOT_TIMES.map(function (t) {
        return '<button type="button" class="chip" data-slot="time" data-val="' + t + '" aria-pressed="' + (pick.time === t) + '">' + t + '</button>'; }).join('') + '</div></div>' +
      (state.interviewAt ? '<div class="card row" style="gap:12px"><span class="badge">Booked</span><span class="m s">' + esc(state.interviewAt) + '</span></div>' : '') +
      '<p class="m s" id="slotErr" role="alert" style="color:#FF8A80"></p>' +
      '<div class="grow"></div><button class="btn" data-act="bookSlot"' + (label ? '' : ' disabled') + '>' + (label ? 'Book ' + label : 'Pick a day and time') + '</button>' +
      '<p class="m s center">We send the video link by SMS.</p>';
  };

  screens.offers = function () {
    if (needAccount()) return '';
    var first = (state.name || 'there').split(' ')[0];
    var badge = state.verify === 'verified' ? '<span class="badge">✓ Verified</span>' :
      state.verify === 'paused' ? '<a class="badge wait" href="#/verify" style="text-decoration:none">Paused</a>' :
      state.verify === 'review' ? '<a class="badge wait" href="#/verify" style="text-decoration:none">ID in review</a>' :
      '<a class="badge wait" href="#/verify" style="text-decoration:none">Verify ID</a>';
    var list = OFFERS.map(function (o) {
      var st = state.offers[o.id];
      return '<a class="offer" href="#/offer/' + o.id + '"><div><div class="t">' + o.role + ' · ' + o.event + '</div>' +
        '<div class="m s">' + o.date + ' · ' + o.time.split(' ')[0] + ' · ' + o.place.split(',').pop().trim() + '</div>' +
        (st === 'accepted' ? '<div class="done-note">✓ Booked</div>' : st === 'declined' ? '<div class="m s">Declined</div>' : '') +
        '</div><div class="pay">' + pay(o) + '</div></a>';
    }).join('');
    var open = OFFERS.filter(function (o) { return !state.offers[o.id]; }).length, nFree = freeDaysAhead(30);
    return '<div class="row between"><div><p class="m s">Hi ' + esc(first) + '</p><h1 style="font-size:28px;margin-top:2px">Offers for you</h1></div>' + badge + '</div>' +
      '<a class="sched-strip" href="#/schedule">' + I.cal + '<span class="grow">' + (nFree ? 'Matched to your schedule: <b>' + nFree + ' free ' + (nFree === 1 ? 'day' : 'days') + '</b> in the next 30 days' : 'Set the days you’re free to get offers') + '</span><span class="edit">' + (nFree ? 'Edit' : 'Set') + '</span></a>' +
      '<section aria-label="Offers" style="display:flex;flex-direction:column;gap:10px"><div class="row between"><h2>All offers</h2><span class="m s">' + (open ? open + ' new' : 'All answered') + '</span></div>' + list + '</section>' +
      tabs('offers');
  };

  /* E3a My schedule: a month calendar. The weekly pattern (state.days) is what the database keeps;
     with "Repeat every week" off, a tap changes only that date (kept on this phone for now). */
  var WK = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
  var MON = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  function isoOf(d) { return d.getFullYear() + '-' + (d.getMonth() < 9 ? '0' : '') + (d.getMonth() + 1) + '-' + (d.getDate() < 10 ? '0' : '') + d.getDate(); }
  function today0() { var t = new Date(); return new Date(t.getFullYear(), t.getMonth(), t.getDate()); }
  function isFree(d) { var k = isoOf(d); return k in state.dateFree ? !!state.dateFree[k] : !!state.days[WK[d.getDay()]]; }
  function freeDaysAhead(n) { var t = today0(), c = 0; for (var i = 0; i < n; i++) if (isFree(new Date(t.getFullYear(), t.getMonth(), t.getDate() + i))) c++; return c; }
  /* "Sat 14 Nov" -> the date it falls on: this year, or next year if that is long past */
  function offerDay(o) {
    var m = String(o.date).match(/(\d{1,2})\s+([A-Za-z]{3})/); if (!m) return null;
    var mi = MON.map(function (x) { return x.slice(0, 3); }).indexOf(m[2]); if (mi < 0) return null;
    var t = today0(), d = new Date(t.getFullYear(), mi, +m[1]);
    if (d < new Date(t.getFullYear(), t.getMonth() - 2, 1)) d = new Date(t.getFullYear() + 1, mi, +m[1]);
    return d;
  }
  function bookedOn(k) { return OFFERS.filter(function (o) { var d = state.offers[o.id] === 'accepted' && offerDay(o); return d && isoOf(d) === k; })[0]; }
  screens.schedule = function () {
    if (needAccount()) return '';
    var t = today0(), first = new Date(t.getFullYear(), t.getMonth() + (state.calMonth || 0), 1);
    var lead = (first.getDay() + 6) % 7, days = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
    var sel = state.calSel || isoOf(t), cells = '';
    for (var i = 0; i < lead; i++) cells += '<span></span>';
    for (var n = 1; n <= days; n++) {
      var d = new Date(first.getFullYear(), first.getMonth(), n), k = isoOf(d), past = d < t, bk = bookedOn(k), fr = !past && isFree(d);
      cells += '<button type="button" class="day' + (bk ? ' book' : fr ? ' free' : '') + (k === sel ? ' sel' : '') + '" data-day="' + k + '"' + (past ? ' disabled' : '') +
        ' aria-label="' + n + ' ' + MON[d.getMonth()] + (bk ? ', booked' : fr ? ', free' : ', not free') + '" aria-pressed="' + (!!fr || !!bk) + '">' + n + '</button>';
    }
    var sd = new Date(+sel.slice(0, 4), +sel.slice(5, 7) - 1, +sel.slice(8, 10)), sb = bookedOn(sel);
    var sLabel = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][sd.getDay()] + ' ' + sd.getDate() + ' ' + MON[sd.getMonth()].slice(0, 3);
    var sText = sb ? 'Booked · ' + sb.role + ', ' + sb.event + ' · ' + sb.time.split(' ')[0] : isFree(sd) ? 'Free. Tap the day again to mark it not free.' : 'Not free. Tap the day to mark it free.';
    return '<div class="row between"><div><p class="m s">Set your schedule</p><h1 style="font-size:28px;margin-top:2px">My schedule</h1></div><span class="m s">' + (DB.live ? 'Saved' : 'Saved on this phone') + '</span></div>' +
      '<section class="card" aria-label="Calendar"><div class="row between" style="margin-bottom:12px">' +
      '<button type="button" class="icon-btn" data-act="calPrev" aria-label="Previous month"' + ((state.calMonth || 0) <= 0 ? ' disabled' : '') + '>' + I.back + '</button>' +
      '<h2>' + MON[first.getMonth()] + ' ' + first.getFullYear() + '</h2>' +
      '<button type="button" class="icon-btn" data-act="calNext" aria-label="Next month"' + ((state.calMonth || 0) >= 5 ? ' disabled' : '') + ' style="transform:scaleX(-1)">' + I.back + '</button></div>' +
      '<div class="cal"><span class="wd">M</span><span class="wd">T</span><span class="wd">W</span><span class="wd">T</span><span class="wd">F</span><span class="wd">S</span><span class="wd">S</span>' + cells + '</div>' +
      '<div class="key"><span><i class="k-free"></i>Free</span><span><i class="k-book"></i>Booked shift</span><span><i class="k-no"></i>Not free</span></div></section>' +
      '<section class="card" style="display:flex;flex-direction:column;gap:12px" aria-label="Selected day">' +
      '<div><h2>' + sLabel + '</h2><p class="m s" style="margin-top:2px">' + esc(sText) + '</p></div>' +
      (sb ? '<a class="btn ghost small" href="#/offer/' + sb.id + '">See shift</a>' :
        '<p class="m s" style="margin:0">Times you can work</p><div class="times">' + TIMES.map(function (x) { return '<button type="button" class="chip" data-toggle="times" data-val="' + x + '" aria-pressed="' + (!!state.times[x]) + '">' + x + '</button>'; }).join('') + '</div>') +
      '</section>' +
      '<button type="button" class="switch-row" data-act="repeat" role="switch" aria-checked="' + (state.repeat !== false) + '"><span><b>Repeat every week</b><span class="m s">' + (state.repeat !== false ? 'A tap changes that weekday every week' : 'A tap changes only that date') + '</span></span><span class="switch"></span></button>' +
      tabs('schedule');
  };

  screens.offer = function (id) {
    if (needAccount()) return '';
    var o = offer(id); if (!o) { go('/offers'); return ''; }
    var st = state.offers[o.id];
    var actions = st === 'accepted' ?
      '<p class="center" style="margin:0;color:#C8F169;font-size:17px;font-weight:600">✓ You’re booked</p><a class="btn" href="#/shifts">See my shifts</a>' +
      '<button type="button" class="btn ghost small" data-act="undo" data-id="' + o.id + '">Can’t make it?</button>' :
      st === 'declined' ?
      '<p class="m center" style="font-size:16px">Declined. We’ll send you others.</p><a class="btn ghost" href="#/offers">Back to offers</a>' +
      '<button type="button" class="btn ghost small" data-act="undo" data-id="' + o.id + '">Undo</button>' :
      '<div class="row" style="gap:10px"><button type="button" class="btn ghost" style="flex:1" data-act="decline" data-id="' + o.id + '">Decline</button>' +
      '<button type="button" class="btn" style="flex:2" data-act="accept" data-id="' + o.id + '">Accept</button></div>';
    return '<div class="row between">' + backBtn('/offers', 'Back to offers') + '<span class="m s">' + (st ? 'Your shift' : 'New offer') + '</span></div>' +
      '<div><span class="tag">' + o.role + '</span><h1 style="margin-top:12px">' + o.event + '</h1></div>' +
      '<div class="card"><p class="m s">You earn</p><p style="margin:2px 0 0;font-size:40px;font-weight:700;letter-spacing:-.02em">' + pay(o) + '</p>' +
      '<p class="m s">' + o.hours + ' h × HK$' + o.rate + ' · paid by ' + o.paid + '</p></div>' +
      '<div><div class="detail"><span class="ico">' + I.clock + '</span><div><b>' + o.date + ' · ' + o.time + '</b><span class="m s">Arrive ' + o.arrive + '</span></div></div>' +
      '<div class="detail"><span class="ico">' + I.pin + '</span><div><b>' + o.place + '</b><span class="m s">' + o.spot + '</span></div></div>' +
      '<div class="detail"><span class="ico">' + I.shirt + '</span><div><b>' + o.wear + '</b><span class="m s">' + o.wear2 + '</span></div></div></div>' +
      '<div class="grow"></div>' + actions;
  };

  screens.shifts = function () {
    if (needAccount()) return '';
    var booked = OFFERS.filter(function (o) { return state.offers[o.id] === 'accepted'; }).sort(function (a, b) { return a.sort - b.sort; });
    var next = booked[0], rest = booked.slice(1);
    var nextHtml = next ?
      '<section class="next" aria-label="Next shift"><div class="row between"><span class="eyebrow">Next shift</span><span class="m s">' + next.role + '</span></div>' +
      '<div><div style="font-size:20px;font-weight:700">' + next.event + '</div><div class="m s">' + next.date + ' · ' + next.time.split(' ')[0] + ' · ' + next.spot + '</div></div>' +
      (state.showQr ? '<svg class="qr" viewBox="0 0 21 21" role="img" aria-label="Sample check-in QR code"><path fill="#000" d="M0 0h7v7H0zM1 1v5h5V1zM2 2h3v3H2zM14 0h7v7h-7zM15 1v5h5V1zM16 2h3v3h-3zM0 14h7v7H0zM1 15v5h5v-5zM2 16h3v3H2zM9 0h2v2H9zM8 3h2v2H8zM11 4h2v2h-2zM9 8h3v1H9zM13 8h2v2h-2zM16 9h3v2h-3zM8 11h2v3H8zM11 12h3v2h-3zM15 13h2v3h-2zM18 14h3v2h-3zM9 16h3v2H9zM13 17h2v4h-2zM16 18h5v1h-5zM19 20h2v1h-2zM0 9h2v2H0zM3 10h3v2H3zM10 19h2v2h-2z"/></svg>' +
        '<p class="m s center">Show this at the staff desk</p>' : '') +
      '<button type="button" class="btn small" data-act="qr">' + (state.showQr ? 'Hide QR' : 'Check in with QR') + '</button>' +
      '<a class="m s center" href="#/offer/' + next.id + '">See full details</a></section>' :
      '<section class="card center" style="padding:28px 16px"><h2>No shifts yet</h2><p class="m" style="margin-top:6px">Accept an offer and it shows up here.</p>' +
      '<a class="btn small" href="#/offers" style="margin-top:16px">See offers</a></section>';
    var restHtml = rest.length ? '<section aria-label="Coming up"><h2 style="margin-bottom:4px">Coming up</h2>' + rest.map(function (o) {
      return '<a class="up" href="#/offer/' + o.id + '" style="text-decoration:none"><div><div style="font-size:16px;font-weight:600">' + o.role + ' · ' + o.event + '</div><div class="m s">' + o.date + ' · ' + o.time.split(' ')[0] + '</div></div><span class="pay">' + pay(o) + '</span></a>';
    }).join('') + '</section>' : '';
    var upcoming = booked.reduce(function (s, o) { return s + o.hours * o.rate; }, 0);
    return '<div><p class="m s">Booked</p><h1 style="font-size:28px;margin-top:2px">My shifts</h1></div>' + nextHtml + restHtml +
      '<section class="card row between" aria-label="Earnings"><div><p class="m s">Earned so far</p><p style="margin:2px 0 0;font-size:26px;font-weight:700">HK$0</p><p class="m s">Paid after each shift</p></div>' +
      '<div style="text-align:right"><p class="m s">Booked work</p><p style="margin:2px 0 0;font-size:18px;font-weight:700;color:#C8F169">HK$' + upcoming.toLocaleString('en') + '</p><p class="m s">' + booked.length + ' shift' + (booked.length === 1 ? '' : 's') + '</p></div></section>' +
      '<button type="button" class="btn ghost small" data-act="reset" style="margin-top:8px">Reset preview</button>' +
      tabs('shifts');
  };

  /* ---------- router ---------- */
  function keepScroll() { var y = window.scrollY; render(); window.scrollTo(0, y); }
  function currentPath() { return (location.hash || '#/').slice(1) || '/'; }
  function render() {
    var path = currentPath();
    var parts = path.split('/').filter(Boolean);
    var name = parts[0] || 'home';
    var fn = screens[name] || screens.home;
    var html = fn(parts[1]);
    if (currentPath() !== path) return; /* a screen redirected */
    if (!html) return;
    app.className = 'screen' + (name === 'offers' || name === 'shifts' || name === 'schedule' ? ' has-tabs' : '');
    app.innerHTML = html;
    window.scrollTo(0, 0);
    var h = app.querySelector('h1'); if (h) { h.setAttribute('tabindex', '-1'); h.focus({ preventScroll: true }); }
    if (name === 'code') wireCode();
  }
  window.addEventListener('hashchange', render);

  function wireCode() {
    var boxes = Array.prototype.slice.call(app.querySelectorAll('.code'));
    var btn = document.getElementById('verifyCode');
    function check() { btn.disabled = !boxes.every(function (b) { return /^\d$/.test(b.value); }); }
    boxes.forEach(function (b, i) {
      b.addEventListener('input', function () {
        var v = b.value.replace(/\D/g, '');
        if (v.length > 1) { v.split('').slice(0, 6 - i).forEach(function (d, k) { boxes[i + k].value = d; }); }
        else b.value = v;
        var nextEmpty = boxes.find(function (x) { return !x.value; });
        if (b.value && nextEmpty) nextEmpty.focus();
        check();
      });
      b.addEventListener('keydown', function (e) { if (e.key === 'Backspace' && !b.value && i > 0) boxes[i - 1].focus(); });
    });
    boxes[0].focus();
  }

  /* ---------- events ---------- */
  function cleanPhone(v) { return v.replace(/\D/g, '').slice(0, 8); }
  function fmtPhone(d) { return d.length > 4 ? d.slice(0, 4) + ' ' + d.slice(4) : d; }

  app.addEventListener('submit', function (e) {
    e.preventDefault();
    var f = e.target, err = document.getElementById('joinErr');
    if (f.id === 'eventForm') {
      var ev = state.org.event, fields = [['evName', 'name', 'Add the event name.'], ['evDate', 'date', 'Choose the date.'], ['evPlace', 'place', 'Add the place.']];
      for (var k = 0; k < fields.length; k++) {
        var v = f[fields[k][0]].value.trim();
        if (!v) { err.textContent = fields[k][2]; f[fields[k][0]].focus(); return; }
        ev[fields[k][1]] = v;
      }
      if (!f.evStart.value || !f.evEnd.value) { err.textContent = 'Choose the start and end time.'; (f.evStart.value ? f.evEnd : f.evStart).focus(); return; }
      if (f.evStart.value === f.evEnd.value) { err.textContent = 'The end time must be different from the start time.'; f.evEnd.focus(); return; }
      ev.time = f.evStart.value + ' - ' + f.evEnd.value;
      if (isOther(ev)) {
        var rv = f.evRoleOther.value.trim();
        if (!rv) { err.textContent = 'Write the role you need.'; f.evRoleOther.focus(); return; }
        ev.role = rv; ev.other = true;
      }
      state.org.booked = false; state.org.swapped = false; save();
      if (!DB.live) { go('/review'); return; }
      busy(f, true);
      DB.saveEvent(ev, state.org.eventId, { backup: !!state.org.backup }).then(function (id) {
        state.org.eventId = id; save(); go('/review');
      }, function (x) { busy(f, false); err.textContent = x.message; });
      return;
    }
    var digits = f.phone ? cleanPhone(f.phone.value) : '';
    if (f.id === 'orgForm') {
      var byEmail = state.org.via === 'email', em = byEmail ? f.email.value.trim() : '';
      if (byEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) { err.textContent = 'Enter your email address, like you@company.com.'; f.email.focus(); return; }
      if (!byEmail && digits.length !== 8) { err.textContent = 'Enter an 8-digit Hong Kong number.'; f.phone.focus(); return; }
      var on = f.name.value.trim();
      if (!on) { err.textContent = 'Add your name so experts know who is hosting.'; f.name.focus(); return; }
      state.org.name = on; state.org.company = f.company.value.trim();
      if (byEmail) state.org.email = em; else state.org.phone = fmtPhone(digits);
      if (state.org.company && state.org.event.name === freshOrg().event.name) state.org.event.name = state.org.company;
      state.mode = 'organiser'; state.flow = 'organiser'; save(); sendCode(byEmail ? { email: em } : digits, f, err); return;
    }
    state.mode = 'expert'; state.flow = f.id === 'joinForm' ? 'join' : 'signin';
    if (digits.length !== 8) { err.textContent = 'Enter an 8-digit Hong Kong number.'; f.phone.focus(); return; }
    if (f.id === 'joinForm') {
      var nm = f.name.value.trim();
      if (!nm) { err.textContent = 'Add your name so organisers know who’s coming.'; f.name.focus(); return; }
      if (!Object.keys(state.roles).some(function (k) { return state.roles[k]; })) { err.textContent = 'Pick at least one role.'; return; }
      state.name = nm;
    }
    state.phone = fmtPhone(digits); save();
    sendCode(digits, f, err);
  });

  /* ---------- live mode: real codes and saving (db.js) ---------- */
  function busy(form, on) {
    var b = form && form.querySelector('button[type="submit"], #verifyCode');
    if (!b) return;
    if (on) { b.dataset.label = b.textContent; b.textContent = 'One moment…'; b.disabled = true; }
    else { b.textContent = b.dataset.label || b.textContent; b.disabled = false; }
  }
  function sendCode(digits, form, err) {
    if (!DB.live) { go('/code'); return; }
    busy(form, true);
    (digits && digits.email ? DB.sendEmailCode(digits.email) : DB.sendCode(digits)).then(function () { go('/code'); }, function (x) { busy(form, false); err.textContent = x.message; });
  }
  /* Puts what the database knows about this person into the app's state. Returns where to go next. */
  function applyMe(me) {
    /* someone else signed in on this phone: start clean so nothing of the last person shows */
    if (state.uid && state.uid !== me.id) { var lang = state.lang; state = fresh(); state.lang = lang; }
    state.uid = me.id;
    if (me.role === 'organiser') {
      var o = state.org, org = me.org || {};
      o.signedIn = true; o.name = me.name; o.phone = me.phone; o.company = org.name || '';
      o.plan = org.plan_choice || ''; o.planPick = o.plan || o.planPick; o.backup = o.plan === 'pro';
      if (me.event) {
        var e = me.event;
        o.event = { name: e.name, date: e.date, time: e.time, place: e.place, role: e.role, other: ROLES.indexOf(e.role) < 0, count: e.count };
        o.eventId = e.id; o.brief = e.brief; o.backup = e.backup;
      } else if (!o.eventId) {
        o.event.date = ''; /* the sample date is for the preview only */
      }
      state.mode = 'organiser';
      return o.booked ? '/booked' : o.plan ? '/event' : '/plan';
    }
    if (me.role === 'expert') {
      state.signedIn = true; state.name = me.name; state.phone = me.phone; state.mode = 'expert';
      if (me.expert) {
        state.roles = {}; me.expert.roles.forEach(function (r) { state.roles[r] = true; });
        state.langs = {}; me.expert.languages.forEach(function (l) { state.langs[l] = true; });
      }
      if (me.days && Object.keys(me.days).length) { state.days = me.days; state.times = me.times; }
      var ex = me.expert || {}, s = ex.status;
      state.verify = s === 'approved' ? 'verified' : s === 'paused' ? 'paused' : s === 'id_review' || s === 'interview' ? 'review' : 'none';
      if (s === 'applied') { state.idPhoto = false; state.selfie = false; } /* nothing sent yet, or AXPER asked for new photos */
      state.interviewAt = ex.interview_at ? interviewLabel(ex.interview_at) : '';
      return state.verify === 'none' ? '/verify' : '/offers';
    }
    return '/';
  }
  function picked(map) { return Object.keys(map).filter(function (k) { return map[k]; }); }
  /* "2026-12-03T06:00:00+00:00" -> "Thu 3 Dec, 14:00" in Hong Kong time */
  function interviewLabel(iso) {
    var p = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Hong_Kong', weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date(iso));
    var g = {}; p.forEach(function (x) { g[x.type] = x.value; });
    return g.weekday + ' ' + g.day + ' ' + g.month + ', ' + g.hour + ':' + g.minute;
  }
  function liveVerify(btn) {
    var err = document.getElementById('codeErr');
    var code = Array.prototype.map.call(app.querySelectorAll('.code'), function (b) { return b.value; }).join('');
    var digits = cleanPhone(state.mode === 'organiser' ? state.org.phone : state.phone);
    btn.disabled = true; btn.textContent = 'Checking…';
    function fail(x) { btn.disabled = false; btn.textContent = 'Continue'; err.textContent = x.message; }
    var byEmail = state.mode === 'organiser' && state.org.via === 'email';
    (byEmail ? DB.verifyEmailCode(state.org.email, code) : DB.verifyCode(digits, code)).then(function () {
      if (state.flow === 'organiser') return DB.saveOrganiser(state.org.name, state.org.company);
      if (state.flow === 'join') return DB.saveExpert(state.name, picked(state.roles), picked(state.langs))
        .then(function () { return DB.saveAvailability(state.days, state.times); });
    }).then(function () { return DB.loadMe(); }).then(function (me) {
      if (!me) {
        DB.signOut();
        throw new Error('There’s no account for this ' + (byEmail ? 'email' : 'number') + ' yet. Go back and choose “I need experts” or “I want to work”.');
      }
      var next = applyMe(me); save(); go(next);
    }).catch(function (x) {
      /* a number registered for the other side: sign out so nothing half-made is left */
      if (/already registered/.test(x.message)) DB.signOut();
      fail(x);
    });
  }
  var timers = {};
  function later(key, fn) { clearTimeout(timers[key]); timers[key] = setTimeout(function () { fn().catch(function () { toast('Couldn’t save. Check your connection.'); }); }, 700); }

  app.addEventListener('click', function (e) {
    var t = e.target.closest('button'); if (!t) return;
    if (t.dataset.toggle) {
      var g = t.dataset.toggle, v = t.dataset.val;
      state[g][v] = !state[g][v]; save();
      t.setAttribute('aria-pressed', String(!!state[g][v]));
      if (DB.live && state.signedIn && (g === 'days' || g === 'times')) later('avail', function () { return DB.saveAvailability(state.days, state.times); });
      return;
    }
    if (t.dataset.day) {
      var k = t.dataset.day, dd = new Date(+k.slice(0, 4), +k.slice(5, 7) - 1, +k.slice(8, 10));
      if (!bookedOn(k)) {
        var now = isFree(dd);
        if (state.repeat !== false) {
          var w = WK[dd.getDay()]; state.days[w] = !now;
          Object.keys(state.dateFree).forEach(function (x) { var y = new Date(+x.slice(0, 4), +x.slice(5, 7) - 1, +x.slice(8, 10)); if (WK[y.getDay()] === w) delete state.dateFree[x]; });
          if (DB.live && state.signedIn) later('avail', function () { return DB.saveAvailability(state.days, state.times); });
        } else state.dateFree[k] = !now;
      }
      state.calSel = k; save(); keepScroll(); return;
    }
    if (t.dataset.lang) { toast('繁體中文 and 简体中文 are coming in the next build'); return; }
    if (t.dataset.pick) {
      var ev0 = state.org.event, box = document.getElementById('evRoleOther');
      if (t.hasAttribute('data-other')) { ev0.other = true; if (box) { box.hidden = false; box.focus(); } }
      else { ev0.other = false; ev0.role = t.dataset.val; if (box) box.hidden = true; }
      save();
      Array.prototype.forEach.call(app.querySelectorAll('[data-pick="' + t.dataset.pick + '"]'), function (b) { b.setAttribute('aria-pressed', String(b === t)); });
      return;
    }
    if (t.id === 'verifyCode' && DB.live) { liveVerify(t); return; }
    if (t.id === 'verifyCode' && state.mode === 'organiser') {
      state.org.signedIn = true; save(); go(state.org.booked ? '/booked' : state.org.plan ? '/event' : '/plan'); return;
    }
    if (t.id === 'verifyCode') {
      state.signedIn = true; save();
      go(state.verify === 'none' && !state.idPhoto ? '/verify' : '/offers'); return;
    }
    if (t.id === 'submitVerify') {
      if (!DB.live) { state.verify = 'review'; save(); go('/offers'); previewApprove(); return; }
      t.disabled = true; t.textContent = 'Sending…';
      DB.submitId().then(function () { state.verify = 'review'; save(); go('/offers'); toast('Photos sent to AXPER'); },
        function (x) { t.disabled = false; t.textContent = 'Submit for review'; document.getElementById('verifyErr').textContent = x.message; });
      return;
    }
    if (t.dataset.slot) {
      state.slotPick = state.slotPick || {}; state.slotPick[t.dataset.slot] = t.dataset.val; save(); render(); return;
    }
    var act = t.dataset.act, id = t.dataset.id;
    if (act === 'calPrev' || act === 'calNext') { state.calMonth = Math.max(0, Math.min(5, (state.calMonth || 0) + (act === 'calNext' ? 1 : -1))); save(); render(); return; }
    if (act === 'via') { ['name', 'company', 'phone', 'email'].forEach(function (k) { var el = document.getElementById(k); if (el) state.org[k] = k === 'phone' ? fmtPhone(cleanPhone(el.value)) : el.value.trim(); }); state.org.via = t.dataset.val === 'email' ? 'email' : 'phone'; save(); render(); var fi = document.getElementById(state.org.via); if (fi) fi.focus(); return; }
    if (act === 'repeat') { state.repeat = state.repeat === false; save(); keepScroll(); return; }
    if (act === 'bookSlot') {
      var pk = state.slotPick || {}, d = slotDays().filter(function (x) { return dayLabel(x) === pk.day; })[0];
      if (!d || !pk.time) return;
      var iso = slotIso(d, pk.time);
      function booked() {
        state.interviewAt = interviewLabel(iso); save(); go('/offers'); toast('Interview booked for ' + state.interviewAt);
        if (!DB.live) setTimeout(function () { state.verify = 'verified'; save(); if (location.hash === '#/offers') render(); toast('Preview: you passed. Your ID is verified'); }, 4000);
      }
      if (!DB.live) { booked(); return; }
      t.disabled = true; t.textContent = 'Booking…';
      DB.bookInterview(iso).then(booked, function (x) { t.disabled = false; t.textContent = 'Try again'; document.getElementById('slotErr').textContent = x.message; });
      return;
    }
    if (act === 'resend') {
      if (!DB.live) { toast('New code sent'); return; }
      (state.mode === 'organiser' && state.org.via === 'email' ? DB.sendEmailCode(state.org.email) : DB.sendCode(cleanPhone(state.mode === 'organiser' ? state.org.phone : state.phone)))
        .then(function () { toast('New code sent'); }, function (x) { toast(x.message); });
      return;
    }
    if (act === 'accept') { state.offers[id] = 'accepted'; save(); render(); toast('You’re booked'); return; }
    if (act === 'decline') { state.offers[id] = 'declined'; save(); render(); return; }
    if (act === 'undo') { delete state.offers[id]; save(); render(); return; }
    if (act === 'qr') { state.showQr = !state.showQr; save(); render(); return; }
    if (act === 'reset') { DB.live && DB.signOut(); state = fresh(); save(); go('/'); return; }
    /* organiser */
    var o = state.org;
    if (act === 'less' || act === 'more') {
      o.event.count = Math.max(1, Math.min(MAX_EXPERTS, o.event.count + (act === 'more' ? 1 : -1))); save();
      document.getElementById('count').textContent = o.event.count;
      if (act === 'more' && o.event.count === MAX_EXPERTS) toast('Need more than ' + MAX_EXPERTS + '? We’ll call you after booking');
      return;
    }
    if (t.dataset.plan) { o.planPick = t.dataset.plan; save(); render(); return; }
    if (act === 'choosePlan') {
      o.plan = o.planPick === 'pro' ? 'pro' : 'lite'; o.backup = o.plan === 'pro'; save();
      if (DB.live) DB.setPlanChoice(o.plan).catch(function () { toast('Couldn’t save your plan. Check your connection.'); });
      go(o.booked ? '/booked' : '/event'); toast(o.plan === 'pro' ? 'You’re on Pro' : 'You’re on Lite'); return;
    }
    if (act === 'showAll') { o.showAll = true; save(); render(); return; }
    if (act === 'pay') { o.booked = true; o.swapped = false; save(); go('/booked'); toast('Booked. Your experts are confirmed'); return; }
    if (act === 'share') {
      if (navigator.share) navigator.share({ title: o.event.name, text: shareText() }).catch(function () {});
      else if (navigator.clipboard) navigator.clipboard.writeText(shareText()).then(function () { toast('Event details copied'); }, function () {});
      return;
    }
    if (act === 'ics') { downloadIcs(); return; }
    if (act === 'swap') { o.swapped = true; save(); render(); toast(BACKUP.name + ' is on the way'); return; }
    if (act === 'msgAll') { toast('Message sent to all experts'); return; }
  });

  function downloadIcs() {
    var e = state.org.event;
    if (!window.AXPER.ics(e.name, e.date, e.time, e.place, e.count + ' AXPER experts (' + e.role + ')')) toast('Write the date like Sat 14 Nov to add it to a calendar');
  }

  app.addEventListener('input', function (e) {
    if (e.target.id === 'evRoleOther') { state.org.event.role = e.target.value; state.org.event.other = true; save(); return; }
    if (e.target.hasAttribute && e.target.hasAttribute('data-brief')) {
      state.org.brief = e.target.value; save();
      if (DB.live) later('brief', function () { return DB.saveEventField(state.org.eventId, { brief: state.org.brief }); });
    }
  });

  app.addEventListener('change', function (e) {
    if (e.target.hasAttribute && e.target.hasAttribute('data-time')) {
      var st = document.getElementById('evStart'), en = document.getElementById('evEnd');
      state.org.event.time = st.value + ' - ' + en.value; save();
      document.getElementById('evLength').innerHTML = lengthText(state.org.event.time);
      return;
    }
    if (e.target.id === 'evDate') { state.org.event.date = e.target.value; save(); return; }
    if (e.target.dataset && e.target.dataset.check === 'backup') {
      state.org.backup = e.target.checked; save();
      if (DB.live) later('backup', function () { return DB.saveEventField(state.org.eventId, { backup: state.org.backup }); });
      return;
    }
    var key = e.target.dataset && e.target.dataset.file;
    if (!key || !e.target.files || !e.target.files.length) return;
    if (!DB.live) { state[key] = true; save(); render(); return; }
    uploading[key] = true; render();
    DB.uploadId(key === 'idPhoto' ? 'id' : 'selfie', e.target.files[0]).then(function () {
      uploading[key] = false; state[key] = true; save(); render();
    }, function (x) {
      uploading[key] = false; render();
      var err = document.getElementById('verifyErr'); if (err) err.textContent = x.message; else toast(x.message);
    });
  });

  /* preview only: finish a review that was interrupted by closing the page */
  function previewApprove() { setTimeout(function () { if (state.verify !== 'review') return; state.verify = 'verified'; save(); if (location.hash === '#/offers') render(); toast('Preview: your ID is verified'); }, 4000); }
  if (!DB.live && state.verify === 'review') previewApprove();

  if (!DB.live) { render(); return; }
  /* live: the signed-in session decides who you are, not what this browser remembers */
  var bar = document.querySelector('.preview-bar');
  if (bar) bar.textContent = 'Test version · offers and payments are still simulated';
  DB.session().then(function (id) {
    if (!id) { state.signedIn = false; state.org.signedIn = false; state.uid = null; save(); return null; }
    return DB.loadMe().then(function (me) { if (me) { applyMe(me); save(); } });
  }).catch(function () { toast('Couldn’t reach AXPER. Check your connection.'); }).then(render);
})();
