/* Axper shared data and helpers, used by the phone app (app.js) and the website (web/web.js).
   Shifts, pay and dates are sample data for the preview. */
(function () {
  'use strict';

  var OFFERS = [
    { id: 'launch', role: 'Usher', event: 'Product launch', date: 'Sat 14 Nov', time: '09:00 – 17:00', arrive: '08:45',
      place: 'HKCEC, Wan Chai', spot: 'Hall 3, Entrance B', wear: 'All black', wear2: 'Closed shoes', hours: 8, rate: 80, paid: 'Thu 19 Nov', sort: 14,
      langs: 'English, Cantonese', note: 'Staff entrance at Hall 3, Entrance B. Show your AXPER QR at the desk.',
      tasks: ['Greet guests at Entrance B', 'Guide guests to their seats', 'Hand out microphones for the Q&A'],
      contact: 'Chris Lee, organiser', cancelBy: 'Thu 12 Nov, 09:00', team: ['KW', 'JT', 'DO', 'MC', 'RH'] },
    { id: 'conf', role: 'Registration', event: 'Tech conference', date: 'Tue 17 Nov', time: '08:00 – 14:00', arrive: '07:45',
      place: 'AsiaWorld-Expo, Chek Lap Kok', spot: 'Hall 5, Registration desk', wear: 'White shirt, black trousers', wear2: 'Name badge provided', hours: 6, rate: 80, paid: 'Sun 22 Nov', sort: 17,
      langs: 'English, Mandarin', note: 'Hall 5 service entrance. Show your AXPER QR at the registration desk.',
      tasks: ['Check in attendees at the desk', 'Print and hand out badges', 'Answer questions about the agenda'],
      contact: 'Kelvin Ho, event manager', cancelBy: 'Sun 15 Nov, 08:00', team: ['SY', 'BN'] },
    { id: 'popup', role: 'Booth', event: 'Beauty pop-up', date: 'Sat 21 Nov', time: '12:00 – 20:00', arrive: '11:45',
      place: 'Harbour City, Tsim Sha Tsui', spot: 'Gateway Arcade atrium', wear: 'White shirt, black trousers', wear2: 'Apron provided', hours: 8, rate: 80, paid: 'Thu 26 Nov', sort: 21,
      langs: 'Cantonese', repeat: true, note: 'Staff entrance next to Gate 5. Show your AXPER QR at the desk.',
      tasks: ['Welcome visitors to the booth', 'Run skin-care sample demos', 'Collect sign-ups on the tablet'],
      contact: 'Mandy Wong, brand manager', cancelBy: 'Thu 19 Nov, 12:00', team: ['KW', 'JT', 'DO'] },
    { id: 'concert', role: 'Usher', event: 'Concert', date: 'Sun 29 Nov', time: '17:00 – 23:00', arrive: '16:30',
      place: 'Kai Tak Stadium, Kai Tak', spot: 'Gate C', wear: 'All black', wear2: 'Torch provided', hours: 6, rate: 80, paid: 'Fri 4 Dec', sort: 29,
      langs: 'Cantonese, English', note: 'Staff entrance at Gate C. Show your AXPER QR at the desk.',
      tasks: ['Scan tickets at Gate C', 'Guide guests to their seats', 'Keep aisles clear during the show'],
      contact: 'Jason Lau, venue lead', cancelBy: 'Fri 27 Nov, 17:00', team: ['GL', 'TC', 'BN', 'SY', 'RH'] }
  ];

  var MON = 'JanFebMarAprMayJunJulAugSepOctNovDec';

  /* Download a calendar file. Dates look like "Sat 14 Nov", times like "09:00 - 17:00".
     A date without a year is taken as the next one to come. Returns false if the date or time can't be read. */
  function ics(title, date, time, place, about) {
    var d = String(date).match(/(\d{1,2})\s+(\w{3})/), t = String(time).match(/(\d{1,2}):(\d{2})\D+(\d{1,2}):(\d{2})/);
    var mi = d ? MON.indexOf(d[2].slice(0, 1).toUpperCase() + d[2].slice(1, 3).toLowerCase()) / 3 : -1;
    if (!d || !t || mi < 0) return false;
    var now = new Date(), y = now.getFullYear();
    if (new Date(y, mi, +d[1], 23, 59) < now) y++;
    function p(n) { return (n < 10 ? '0' : '') + n; }
    function stamp(h, m) { return '' + y + p(mi + 1) + p(+d[1]) + 'T' + p(+h) + p(+m) + '00'; }
    function clean(s) { return String(s).replace(/[,;\\\r\n]/g, ' '); }
    var body = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//AXPER//Preview//EN', 'BEGIN:VEVENT',
      'UID:' + Date.now() + '@axper', 'DTSTART;TZID=Asia/Hong_Kong:' + stamp(t[1], t[2]), 'DTEND;TZID=Asia/Hong_Kong:' + stamp(t[3], t[4]),
      'SUMMARY:' + clean(title), 'LOCATION:' + clean(place), 'DESCRIPTION:' + clean(about), 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([body], { type: 'text/calendar' }));
    a.download = 'axper-event.ics'; document.body.appendChild(a); a.click(); a.remove();
    return true;
  }

  /* Organiser plans. Set PRO_PRICE to the monthly price in HKD (e.g. 1200) to show it on the site and in the app.
     While it is null, Pro shows "Monthly or yearly" instead of a number. */
  var PLANS = {
    PRO_PRICE: null,
    lite: ['1 event listing', 'Up to 20 experts per event', 'Experts interviewed and onboarded by AXPER'],
    pro: ['Unlimited event listings', 'Unlimited experts per event', 'Insurance covered', 'Backup experts on standby', 'Experts pre-trained for your event']
  };
  function proPrice() { return PLANS.PRO_PRICE ? 'HK$' + Number(PLANS.PRO_PRICE).toLocaleString('en') + ' / month' : 'Monthly or yearly'; }

  window.AXPER = { KEY: 'axper.v1', OFFERS: OFFERS, ics: ics, PLANS: PLANS, proPrice: proPrice };
})();
