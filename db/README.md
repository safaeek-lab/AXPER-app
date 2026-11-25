# AXPER database setup (step 1)

Step 1 adds real accounts. Organisers sign in with an SMS code, and their organisation, plan choice and events are saved. Experts sign in the same way, and their profile, roles, languages and availability are saved.

ID checks, matching, offers and payments are still simulated. They come in steps 2 to 5.

## 1. Create the Supabase project

1. Sign up at supabase.com and create a new project.
   - Region: **Southeast Asia (Singapore)**, the closest to Hong Kong.
   - Keep the database password somewhere safe. The app never needs it.
2. Open **SQL Editor** and click **New query**.
   - Paste all of `schema.sql` and click **Run**.
   - Open a new query, paste all of `policies.sql` and click **Run**.
   - Each should finish with "Success. No rows returned".

## 2. Turn on phone sign-in

1. Open **Authentication**, then **Sign In / Providers**, then **Phone**, and switch it on.
2. Add test numbers under **Test Phone Numbers and OTPs**, for example:
   `85291234567=123456, 85298765432=123456`
   Each test number signs in with its fixed code, and no SMS is sent. This is all you need to try the app now.
3. Real SMS to any +852 number needs an SMS provider. Choose **Twilio** and paste its keys. If Supabase asks for these before it lets you switch phone sign-in on, set up Twilio first.

## 3. Connect the app

1. In Supabase, open **Project Settings**, then **API**. Copy:
   - the **Project URL**
   - the **anon public** key
2. Paste both into `config.js` in the repo.
   - These two are safe to publish, because the database rules above decide what each person can see.
   - **Never** put the `service_role` key in the repo.
3. Upload `config.js` to GitHub. Vercel redeploys on its own.
   - The bar at the top of the app then says "Test version".

## 4. Step 2: ID photos and the admin console

1. In **SQL Editor**, run all of `step2.sql` once. It adds:
   - the private `id-docs` storage bucket for ID photos and selfies
   - the interview booking
   - the admin actions
2. The admin console is at `/admin/` on your site, for example `axper-app.vercel.app/admin/`. Only profiles with the role `admin` get in (see below).

## 5. Make yourself an admin

First sign in to the app once with your own number, as an organiser. Then run this in the SQL Editor, using your number with 852 in front and no plus sign or spaces:

```sql
update public.profiles set role = 'admin'
where phone = '85291234567';
```

## What the database protects

Each of these is refused by the database itself, whatever the app sends:

- No one can see another person's profile, organisation, events or availability.
- Signed-out visitors can read nothing at all.
- No one can make themselves an admin.
- An expert can't approve themselves.
- An organiser can't switch their own plan to Pro. They can only record that they chose it, and the payment step sets the real plan.
- Event prices are worked out by the database, from hours × experts × HK$80 + 10%. The app can't send its own total.
- A phone number belongs to either an organiser or an expert, not both.
- ID photos and selfies are in private storage.
  - Only that expert and AXPER admins can open them, and only through links that expire after 10 minutes.
  - Experts can't change their photos once their ID has been checked.
- Approving experts, setting tiers and marking payouts paid only work for admins. Each one is a database function that checks who is calling.
