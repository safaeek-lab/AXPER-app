/* AXPER database layer: sign-in by SMS code and saving to Supabase.
   Used by app.js. When config.js is empty, DB.live is false and the app keeps everything in the browser. */
(function () {
  'use strict';

  var C = window.AXPER_CONFIG || {};
  var live = !!(C.supabaseUrl && C.supabaseAnonKey && window.supabase);
  var sb = live ? window.supabase.createClient(C.supabaseUrl, C.supabaseAnonKey, { auth: { persistSession: true, storageKey: 'axper.auth' } }) : null;

  var MON = 'JanFebMarAprMayJunJulAugSepOctNovDec', DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  var SLOTS = { Morning: 'morning', Afternoon: 'afternoon', Evening: 'evening' };

  function e164(digits) { return '+852' + String(digits).replace(/\D/g, '').slice(-8); }
  function pretty(phone) { var d = String(phone || '').replace(/\D/g, '').slice(-8); return d.length > 4 ? d.slice(0, 4) + ' ' + d.slice(4) : d; }
  function pad(n) { return (n < 10 ? '0' : '') + n; }

  /* "Sat 14 Nov" -> "2026-11-14" (the next 14 Nov to come). null if it can't be read. */
  function isoDate(text) {
    var m = String(text).match(/(\d{1,2})\s+([A-Za-z]{3})/);
    var mi = m ? MON.indexOf(m[2].charAt(0).toUpperCase() + m[2].slice(1, 3).toLowerCase()) / 3 : -1;
    if (!m || mi < 0 || +m[1] < 1 || +m[1] > 31) return null;
    var now = new Date(), y = now.getFullYear();
    if (new Date(y, mi, +m[1], 23, 59) < now) y++;
    var d = new Date(y, mi, +m[1]);
    if (d.getMonth() !== mi) return null; /* e.g. 31 Nov */
    return y + '-' + pad(mi + 1) + '-' + pad(+m[1]);
  }
  /* "2026-11-14" -> "Sat 14 Nov" */
  function shortDate(iso) {
    var p = String(iso).split('-'), d = new Date(+p[0], +p[1] - 1, +p[2]);
    return DOW[d.getDay()] + ' ' + d.getDate() + ' ' + MON.substr(d.getMonth() * 3, 3);
  }
  function times(text) {
    var m = String(text).match(/(\d{1,2}):(\d{2})\D+(\d{1,2}):(\d{2})/);
    if (!m || +m[1] > 23 || +m[3] > 23 || +m[2] > 59 || +m[4] > 59) return null;
    return { start: pad(+m[1]) + ':' + m[2], end: pad(+m[3]) + ':' + m[4] };
  }

  /* Plain-English messages for what can go wrong. */
  function nice(err) {
    var msg = (err && (err.message || err.error_description)) || String(err || '');
    if (/token has expired|invalid/i.test(msg) && /otp|token|code/i.test(msg)) return 'That code didn’t work. Check it, or send a new one.';
    if (/rate limit|too many|security purposes/i.test(msg)) return 'Too many tries. Wait a minute, then try again.';
    if (/failed to fetch|network/i.test(msg)) return 'No connection. Check your internet and try again.';
    if (/phone/i.test(msg) && /provider|disabled|unsupported/i.test(msg)) return 'Phone sign-in isn’t switched on yet in Supabase.';
    return msg || 'Something went wrong. Try again.';
  }
  function ok(res) { if (res.error) throw res.error; return res.data; }

  async function uid() {
    var s = ok(await sb.auth.getSession());
    return s.session ? s.session.user.id : null;
  }
  async function myProfile() {
    var id = await uid(); if (!id) return null;
    return ok(await sb.from('profiles').select('*').eq('id', id).maybeSingle());
  }
  /* Makes the profile on first sign-in. A number can be an organiser or an expert, not both. */
  async function ensureProfile(role, name) {
    var p = await myProfile();
    if (p && p.role !== role && p.role !== 'admin') {
      throw new Error('This number is already registered as ' + (p.role === 'organiser' ? 'an organiser' : 'an expert') + '. Use a different number.');
    }
    if (!p) {
      var id = await uid();
      ok(await sb.from('profiles').insert({ id: id, role: role, name: name || '' }));
      p = await myProfile();
    } else if (name && name !== p.name) {
      ok(await sb.from('profiles').update({ name: name }).eq('id', p.id));
      p.name = name;
    }
    return p;
  }

  var DB = {
    live: live,
    isoDate: isoDate,

    session: async function () { return live ? (await uid()) : null; },

    sendCode: async function (digits) {
      try { ok(await sb.auth.signInWithOtp({ phone: e164(digits) })); }
      catch (e) { throw new Error(nice(e)); }
    },
    verifyCode: async function (digits, code) {
      try { ok(await sb.auth.verifyOtp({ phone: e164(digits), token: code, type: 'sms' })); }
      catch (e) { throw new Error(nice(e)); }
    },
    signOut: async function () { if (live) await sb.auth.signOut(); },

    /* Everything the app needs after sign-in, or null if this number has no account yet. */
    loadMe: async function () {
      var p = await myProfile(); if (!p) return null;
      var me = { id: p.id, role: p.role, name: p.name, phone: pretty(p.phone) };
      if (p.role === 'organiser') {
        var org = ok(await sb.from('organisations').select('*').eq('owner_id', p.id).maybeSingle());
        me.org = org;
        if (org) {
          var evs = ok(await sb.from('events').select('*').eq('org_id', org.id).order('created_at', { ascending: false }).limit(1));
          if (evs[0]) {
            var e = evs[0];
            me.event = { id: e.id, name: e.name, date: shortDate(e.date), time: e.start_time.slice(0, 5) + ' - ' + e.end_time.slice(0, 5),
                         place: e.place, role: e.role, count: e.experts_needed, brief: e.brief || '', backup: e.backup, status: e.status };
          }
        }
      }
      if (p.role === 'expert') {
        me.expert = ok(await sb.from('experts').select('*').eq('profile_id', p.id).maybeSingle());
        var av = ok(await sb.from('availability').select('day, slot').eq('expert_id', p.id));
        me.days = {}; me.times = {};
        av.forEach(function (r) { me.days[r.day] = true; me.times[r.slot.charAt(0).toUpperCase() + r.slot.slice(1)] = true; });
      }
      return me;
    },

    saveOrganiser: async function (name, company) {
      try {
        var p = await ensureProfile('organiser', name);
        var org = ok(await sb.from('organisations').select('*').eq('owner_id', p.id).maybeSingle());
        if (!org) org = ok(await sb.from('organisations').insert({ owner_id: p.id, name: company || name }).select().single());
        else if (company && company !== org.name) ok(await sb.from('organisations').update({ name: company }).eq('id', org.id));
        return org;
      } catch (e) { throw new Error(nice(e)); }
    },
    setPlanChoice: async function (choice) {
      var id = await uid();
      ok(await sb.from('organisations').update({ plan_choice: choice }).eq('owner_id', id));
    },
    /* Saves the event form. Returns the event id. */
    saveEvent: async function (ev, id, extra) {
      var d = isoDate(ev.date), t = times(ev.time);
      if (!d) throw new Error('Write the date like Sat 14 Nov.');
      var typed = String(ev.date).match(/^\s*([A-Za-z]{3})/), real = shortDate(d);
      if (typed && DOW.indexOf(typed[1].charAt(0).toUpperCase() + typed[1].slice(1).toLowerCase()) >= 0 && real.slice(0, 3).toLowerCase() !== typed[1].toLowerCase()) {
        throw new Error('The next ' + real.slice(4) + ' is a ' + ({ Sun: 'Sunday', Mon: 'Monday', Tue: 'Tuesday', Wed: 'Wednesday', Thu: 'Thursday', Fri: 'Friday', Sat: 'Saturday' })[real.slice(0, 3)] + ' (' + d.slice(0, 4) + '). Check the date.');
      }
      if (!t) throw new Error('Write the time like 09:00 - 17:00.');
      var row = Object.assign({ name: ev.name, date: d, start_time: t.start, end_time: t.end, place: ev.place, role: ev.role, experts_needed: ev.count }, extra || {});
      try {
        if (id) {
          var upd = ok(await sb.from('events').update(row).eq('id', id).select('id'));
          if (upd.length) return id; /* nothing updated: it was paid or removed, so start a new one */
        }
        var org = ok(await sb.from('organisations').select('id').eq('owner_id', await uid()).single());
        row.org_id = org.id;
        return ok(await sb.from('events').insert(row).select('id').single()).id;
      } catch (e) { throw new Error(nice(e)); }
    },
    saveEventField: async function (id, fields) {
      if (!id) return;
      ok(await sb.from('events').update(fields).eq('id', id));
    },

    saveExpert: async function (name, roles, langs) {
      try {
        var p = await ensureProfile('expert', name);
        var ex = ok(await sb.from('experts').select('profile_id').eq('profile_id', p.id).maybeSingle());
        if (ex) ok(await sb.from('experts').update({ roles: roles, languages: langs }).eq('profile_id', p.id));
        else ok(await sb.from('experts').insert({ profile_id: p.id, roles: roles, languages: langs }));
      } catch (e) { throw new Error(nice(e)); }
    },
    /* Replaces the expert's availability with the days and parts of day ticked in the app. */
    saveAvailability: async function (days, timesOn) {
      var id = await uid(); if (!id) return;
      var rows = [];
      Object.keys(days).forEach(function (d) {
        if (!days[d]) return;
        Object.keys(timesOn).forEach(function (t) { if (timesOn[t] && SLOTS[t]) rows.push({ expert_id: id, day: d, slot: SLOTS[t] }); });
      });
      ok(await sb.from('availability').delete().eq('expert_id', id));
      if (rows.length) ok(await sb.from('availability').insert(rows));
    }
  };

  window.AXPER_DB = DB;
})();
