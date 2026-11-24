-- AXPER database, MVP 1. Run this first in Supabase: SQL Editor -> New query -> paste -> Run.
-- Then run policies.sql. Safe to run on a new, empty project only.
-- Money is in whole HK cents. Dates and times are Hong Kong local time.


-- Everyone who signs in: organisers, experts and AXPER admins.
create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  role        text not null check (role in ('organiser', 'expert', 'admin')),
  phone       text,
  name        text not null default '' check (char_length(name) <= 80),
  created_at  timestamptz not null default now()
);

-- One organisation per organiser. plan is what they pay for; plan_choice is what they picked
-- after sign-up. Only the payment webhook (step 3) moves plan to 'pro'.
create table public.organisations (
  id                  uuid primary key default gen_random_uuid(),
  owner_id            uuid not null unique references public.profiles (id) on delete cascade,
  name                text not null default '' check (char_length(name) <= 120),
  plan                text not null default 'lite' check (plan in ('lite', 'pro')),
  plan_choice         text check (plan_choice in ('lite', 'pro')),
  billing_period      text check (billing_period in ('monthly', 'yearly')),
  stripe_customer_id  text,
  plan_renews_at      timestamptz,
  created_at          timestamptz not null default now()
);

create table public.experts (
  profile_id     uuid primary key references public.profiles (id) on delete cascade,
  roles          text[] not null default '{}',
  languages      text[] not null default '{}',
  tier           text,
  status         text not null default 'applied' check (status in ('applied', 'id_review', 'interview', 'approved', 'paused')),
  id_photo_path  text,
  selfie_path    text,
  interview_at   timestamptz,
  payout_name    text,
  fps_id         text,
  shifts_done    int not null default 0,
  created_at     timestamptz not null default now()
);

-- One row per day and part of day the expert is free.
create table public.availability (
  expert_id  uuid not null references public.experts (profile_id) on delete cascade,
  day        text not null check (day in ('mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun')),
  slot       text not null check (slot in ('morning', 'afternoon', 'evening')),
  primary key (expert_id, day, slot)
);

create table public.events (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.organisations (id) on delete cascade,
  name            text not null check (char_length(name) between 1 and 120),
  date            date not null,
  start_time      time not null,
  end_time        time not null,
  place           text not null check (char_length(place) <= 200),
  spot            text,
  role            text not null,
  experts_needed  int not null check (experts_needed between 1 and 500),
  backup          boolean not null default false,
  dress_code      text,
  brief           text check (char_length(brief) <= 4000),
  rate_cents      int not null default 8000,          -- HK$80 an hour
  fee_rate        numeric(4, 3) not null default 0.10, -- AXPER service fee
  hours           numeric(4, 1) not null default 0,    -- worked out below
  total_cents     int not null default 0,              -- worked out below
  status          text not null default 'draft' check (status in ('draft', 'matching', 'priced', 'paid', 'live', 'done', 'cancelled')),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index events_org_idx on public.events (org_id, date);

create table public.assignments (
  id             uuid primary key default gen_random_uuid(),
  event_id       uuid not null references public.events (id) on delete cascade,
  expert_id      uuid not null references public.experts (profile_id) on delete cascade,
  kind           text not null default 'main' check (kind in ('main', 'backup')),
  status         text not null default 'offered' check (status in ('offered', 'accepted', 'declined', 'checked_in', 'no_show', 'done')),
  offered_at     timestamptz not null default now(),
  answered_at    timestamptz,
  checked_in_at  timestamptz,
  hours          numeric(4, 1),
  pay_cents      int,
  unique (event_id, expert_id)
);
create index assignments_expert_idx on public.assignments (expert_id, status);

create table public.payments (
  id            uuid primary key default gen_random_uuid(),
  event_id      uuid references public.events (id) on delete set null,
  org_id        uuid not null references public.organisations (id) on delete cascade,
  stripe_ref    text unique,
  amount_cents  int not null,
  fee_cents     int not null default 0,
  status        text not null default 'pending' check (status in ('pending', 'paid', 'refunded')),
  created_at    timestamptz not null default now()
);

create table public.payouts (
  id            uuid primary key default gen_random_uuid(),
  expert_id     uuid not null references public.experts (profile_id) on delete cascade,
  week_start    date not null,
  amount_cents  int not null,
  status        text not null default 'due' check (status in ('due', 'paid')),
  paid_at       timestamptz,
  bank_ref      text,
  unique (expert_id, week_start)
);

-- ---------- rules the database enforces itself ----------

-- The phone number always comes from the sign-in, never from what the app sends.
create function public.profile_phone() returns trigger
language plpgsql security definer set search_path = public, auth as $$
begin
  new.phone := (select u.phone from auth.users u where u.id = new.id);
  return new;
end $$;
create trigger profiles_phone before insert or update of phone on public.profiles
  for each row execute function public.profile_phone();

-- Hours and price are always worked out here, so the app cannot send its own total.
create function public.event_price() returns trigger
language plpgsql as $$
declare mins int;
begin
  mins := extract(epoch from (new.end_time - new.start_time))::int / 60;
  if mins <= 0 then mins := mins + 24 * 60; end if;  -- shifts that run past midnight
  new.hours := round(mins / 30.0) / 2.0;
  new.total_cents := round(new.experts_needed * new.hours * new.rate_cents * (1 + new.fee_rate));
  new.updated_at := now();
  return new;
end $$;
create trigger events_price before insert or update on public.events
  for each row execute function public.event_price();

-- Used by the access rules in policies.sql.
create function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;
create function public.my_org() returns uuid
language sql stable security definer set search_path = public as $$
  select id from public.organisations where owner_id = auth.uid();
$$;
-- Lets the events and shifts rules check each other without looping.
create function public.has_shift(ev uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.assignments where event_id = ev and expert_id = auth.uid());
$$;
create function public.event_org(ev uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select org_id from public.events where id = ev;
$$;
