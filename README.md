# AXPER

**Event experts, simply booked.**

AXPER is a staffing service for events in Hong Kong. Event organisers book vetted, trained staff, called **experts**, for their events: ushers, registration staff, booth staff and setup crew. Experts find paid shifts that fit the days they're free.

**Live:** [axper-app.vercel.app](https://axper-app.vercel.app)

> **Status: test version.** Sign-in, saving, ID checks and the admin console are real. Matching, shift offers and payments are still simulated while the MVP is built. See [Roadmap](#roadmap).

---

## How it works

**For organisers**
1. Sign up with a Hong Kong phone number and a 6-digit SMS code.
2. Choose a plan: **Lite** or **Pro**.
3. Enter the event: name, date, time, place, role and how many experts are needed.
4. See the matched team and the price, then confirm.
5. On the day, see who has checked in, who is on the way and who is late. Pro organisers can swap in a backup expert.

**For experts**
1. Join with a phone number, roles and languages.
2. Verify ID with a photo of a Hong Kong ID card and a selfie, then book a 15-minute interview with AXPER.
3. Set the days and times you're free.
4. Accept or decline shift offers. Each offer shows the pay, place, dress code and tasks.
5. Check in at the event with a QR code, and get paid by FPS bank transfer.

**For the AXPER team**

The admin console is at `/admin/`. In it the team:
- checks ID photos, records interviews, approves experts and sets their tier
- sees every booking
- records weekly FPS payouts

## Plans

| | Lite | Pro |
| --- | --- | --- |
| Price | Free | Monthly or yearly (price to be announced) |
| Event listings | 1 | Unlimited |
| Experts per event | Up to 20 | Unlimited |
| Vetted, interviewed experts | ✓ | ✓ |
| Backup experts on standby | | ✓ |
| Insurance cover | | ✓ |
| Experts pre-trained for your event | | ✓ |

Bookings are charged at **HK$80 an hour per expert**, plus a **10% AXPER service fee**.

---

## What's in this repository

The site is plain HTML, CSS and JavaScript, with no build step and nothing to install. [Vercel](https://vercel.com) publishes the `main` branch automatically.

```
/                     Phone web app for organisers and experts (installable)
├── index.html          App page
├── app.js              Screens, routing and app logic
├── styles.css          App styles
├── data.js             Shared data: plans, prices, sample shifts
├── db.js               Sign-in, saving, ID uploads and admin actions (Supabase)
├── config.js           Supabase project URL and public key
├── manifest.webmanifest, icon.svg
├── web/              Website (desktop)
│   ├── index.html        Home page for organisers
│   ├── experts.html      For Experts page
│   ├── signin.html       Expert sign-in
│   ├── dashboard.html    Expert home
│   ├── shift.html        Shift details
│   ├── web.css, web.js
│   └── img/              Event photos
├── admin/            Admin console for the AXPER team
│   ├── index.html
│   ├── admin.js
│   └── admin.css
└── db/               Database
    ├── schema.sql        Tables and rules
    ├── policies.sql      Who can see and change what
    ├── step2.sql         ID photo storage, interview booking, admin actions
    └── README.md         Step-by-step database setup
```

## Tech

| Part | Tool |
| --- | --- |
| Website and app | Static HTML, CSS and JavaScript on Vercel |
| Database, sign-in and files | [Supabase](https://supabase.com): Postgres, phone sign-in by SMS code, private storage, row-level security |
| SMS codes | Twilio Verify, through Supabase |
| Payments (coming) | Stripe (Hong Kong) |
| Expert pay | FPS bank transfers, recorded in the admin console |

Data is protected by rules in the database itself:
- Organisers and experts can only read and change their own records.
- ID photos are private to the expert and AXPER admins.
- Prices are worked out by the database, not by the app.
- Approvals, plans and payouts can only be changed by AXPER admins or the server.

The keys in `config.js` are public by design. The secret server key is never stored in this repository.

## Run it yourself

**Preview, with no database.** Leave `config.js` empty and serve the folder:

```bash
python3 -m http.server 8000
```

Then open http://localhost:8000. Everything is saved in your browser only, and any 6-digit code works.

**With a database.** Follow [db/README.md](db/README.md) to create a Supabase project, run the SQL files, turn on phone sign-in and fill in `config.js`.

---

## Roadmap

**MVP: launching in Hong Kong**
- [x] Organiser and expert sign-up by SMS code, with accounts, events and availability saved
- [x] ID photo and selfie upload to private storage, interview booking, and an admin console to approve experts, see bookings and record payouts
- [ ] Card payments for bookings and the Pro plan (Stripe)
- [ ] Automatic matching and shift offers by SMS
- [ ] QR check-in on the day and weekly payout lists

**MVP 2: after launch**
- Email, Google and Apple sign-in
- Axper AI for event planning and payroll, and coupons
- Organisers picking experts themselves, and quotes for large events
- Insurance claims in the app
- Automatic face matching for ID checks
- In-app chat and live GPS on event day
- An expert wallet with instant payouts
- Analytics for AXPER
- Push notifications and WhatsApp alerts

**Later**
- Traditional and Simplified Chinese
- A native phone app

## Contact

Interested in booking experts, working as one, or partnering with AXPER? Open an issue in this repository.
