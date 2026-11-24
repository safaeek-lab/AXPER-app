-- AXPER access rules. Run after schema.sql.
-- The app talks to the database with the public "anon" key, so these rules are what keep
-- each person to their own data. Signed-out visitors get nothing.
-- Organisers: their own profile, organisation and events.
-- Experts: their own profile, expert record, availability, shifts and payouts.
-- Admins (role set by hand, see README): everything.

alter table public.profiles      enable row level security;
alter table public.organisations enable row level security;
alter table public.experts       enable row level security;
alter table public.availability  enable row level security;
alter table public.events        enable row level security;
alter table public.assignments   enable row level security;
alter table public.payments      enable row level security;
alter table public.payouts       enable row level security;

-- Start from nothing, then allow only the columns the app may write.
revoke all on public.profiles, public.organisations, public.experts, public.availability,
  public.events, public.assignments, public.payments, public.payouts from anon, authenticated;
grant select on public.profiles, public.organisations, public.experts, public.availability,
  public.events, public.assignments, public.payments, public.payouts to authenticated;

grant insert (id, role, name) on public.profiles to authenticated;
grant update (name) on public.profiles to authenticated;

grant insert (owner_id, name, plan_choice, billing_period) on public.organisations to authenticated;
grant update (name, plan_choice, billing_period) on public.organisations to authenticated;

grant insert (profile_id, roles, languages) on public.experts to authenticated;
grant update (roles, languages, payout_name, fps_id) on public.experts to authenticated;

grant insert, delete on public.availability to authenticated;

grant insert (org_id, name, date, start_time, end_time, place, spot, role, experts_needed, backup, dress_code, brief) on public.events to authenticated;
grant update (name, date, start_time, end_time, place, spot, role, experts_needed, backup, dress_code, brief) on public.events to authenticated;
grant delete on public.events to authenticated;

-- profiles
create policy "read own profile" on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_admin());
create policy "create own profile" on public.profiles for insert to authenticated
  with check (id = auth.uid() and role in ('organiser', 'expert'));
create policy "edit own profile" on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- organisations
create policy "read own organisation" on public.organisations for select to authenticated
  using (owner_id = auth.uid() or public.is_admin());
create policy "create own organisation" on public.organisations for insert to authenticated
  with check (owner_id = auth.uid()
              and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'organiser'));
create policy "edit own organisation" on public.organisations for update to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- experts
create policy "read own expert record" on public.experts for select to authenticated
  using (profile_id = auth.uid() or public.is_admin());
create policy "create own expert record" on public.experts for insert to authenticated
  with check (profile_id = auth.uid()
              and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'expert'));
create policy "edit own expert record" on public.experts for update to authenticated
  using (profile_id = auth.uid()) with check (profile_id = auth.uid());

-- availability
create policy "read own availability" on public.availability for select to authenticated
  using (expert_id = auth.uid() or public.is_admin());
create policy "add own availability" on public.availability for insert to authenticated
  with check (expert_id = auth.uid());
create policy "remove own availability" on public.availability for delete to authenticated
  using (expert_id = auth.uid());

-- events: organisers manage their own; experts see events they have a shift at.
create policy "read events" on public.events for select to authenticated
  using (org_id = public.my_org()
         or public.is_admin()
         or public.has_shift(id));
create policy "create own events" on public.events for insert to authenticated
  with check (org_id = public.my_org());
create policy "edit own unpaid events" on public.events for update to authenticated
  using (org_id = public.my_org() and status in ('draft', 'priced'))
  with check (org_id = public.my_org());
create policy "delete own draft events" on public.events for delete to authenticated
  using (org_id = public.my_org() and status = 'draft');

-- assignments, payments, payouts: read only from the app. Matching, payments and payouts
-- are written by the server functions in later steps, which bypass these rules.
create policy "read shifts" on public.assignments for select to authenticated
  using (expert_id = auth.uid()
         or public.is_admin()
         or public.event_org(event_id) = public.my_org());
create policy "read own payments" on public.payments for select to authenticated
  using (org_id = public.my_org() or public.is_admin());
create policy "read own payouts" on public.payouts for select to authenticated
  using (expert_id = auth.uid() or public.is_admin());
