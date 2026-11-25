-- AXPER step 2: ID photos, interview booking and the admin console.
-- Run once in Supabase (SQL Editor -> New query -> paste -> Run), after schema.sql and policies.sql.

-- ---------- private storage for ID photos and selfies ----------
-- Each expert gets a folder named after their account: <id>/id and <id>/selfie.
-- Only that expert and AXPER admins can open the files. Nobody else, not even other experts.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('id-docs', 'id-docs', false, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'])
on conflict (id) do nothing;

-- Experts may (re)upload only while their ID hasn't been checked yet.
create function public.can_upload_id() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.experts where profile_id = auth.uid() and status in ('applied', 'id_review'));
$$;

create policy "experts upload own ID" on storage.objects for insert to authenticated
  with check (bucket_id = 'id-docs' and name in (auth.uid()::text || '/id', auth.uid()::text || '/selfie') and public.can_upload_id());
create policy "experts replace own ID" on storage.objects for update to authenticated
  using (bucket_id = 'id-docs' and name in (auth.uid()::text || '/id', auth.uid()::text || '/selfie') and public.can_upload_id())
  with check (bucket_id = 'id-docs' and name in (auth.uid()::text || '/id', auth.uid()::text || '/selfie'));
create policy "experts and admins see ID" on storage.objects for select to authenticated
  using (bucket_id = 'id-docs' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));
create policy "admins remove ID" on storage.objects for delete to authenticated
  using (bucket_id = 'id-docs' and public.is_admin());

-- ---------- actions experts take ----------

-- After uploading both photos: send them for checking.
create function public.submit_id() returns text
language plpgsql security definer set search_path = public, storage as $$
declare me uuid := auth.uid(); st text;
begin
  if not exists (select 1 from storage.objects where bucket_id = 'id-docs' and name = me::text || '/id')
     or not exists (select 1 from storage.objects where bucket_id = 'id-docs' and name = me::text || '/selfie') then
    raise exception 'Add both your ID photo and your selfie first.';
  end if;
  update public.experts
     set id_photo_path = me::text || '/id', selfie_path = me::text || '/selfie', status = 'id_review'
   where profile_id = me and status in ('applied', 'id_review')
  returning status into st;
  if st is null then raise exception 'Your ID has already been checked.'; end if;
  return st;
end $$;

-- Book (or move) the AXPER interview: between 1 hour and 30 days from now.
create function public.book_interview(slot timestamptz) returns timestamptz
language plpgsql security definer set search_path = public as $$
declare done timestamptz;
begin
  if slot < now() + interval '1 hour' or slot > now() + interval '30 days' then
    raise exception 'Pick a time in the next 30 days.';
  end if;
  update public.experts set interview_at = slot
   where profile_id = auth.uid() and status in ('id_review', 'interview')
  returning interview_at into done;
  if done is null then raise exception 'Send your ID photos before booking the interview.'; end if;
  return done;
end $$;

-- ---------- actions only admins take ----------

-- id_ok: ID checked, waiting for the interview. approve: passed, gets offers (needs a tier).
-- new_photo: ask for new photos. pause / resume: stop or restart offers.
create function public.admin_review_expert(expert uuid, action text, new_tier text default null) returns text
language plpgsql security definer set search_path = public as $$
declare st text;
begin
  if not public.is_admin() then raise exception 'Admins only.'; end if;
  if action = 'id_ok' then
    update public.experts set status = 'interview' where profile_id = expert and status in ('id_review', 'interview') returning status into st;
  elsif action = 'approve' then
    if coalesce(new_tier, '') = '' then raise exception 'Choose a tier before approving.'; end if;
    update public.experts set status = 'approved', tier = new_tier where profile_id = expert and status in ('id_review', 'interview', 'paused') returning status into st;
  elsif action = 'new_photo' then
    update public.experts set status = 'applied', id_photo_path = null, selfie_path = null where profile_id = expert and status in ('id_review', 'interview') returning status into st;
  elsif action = 'pause' then
    update public.experts set status = 'paused' where profile_id = expert returning status into st;
  elsif action = 'tier' then
    update public.experts set tier = new_tier where profile_id = expert returning status into st;
  else
    raise exception 'Unknown action %', action;
  end if;
  if st is null then raise exception 'That expert can’t be changed this way right now.'; end if;
  return st;
end $$;

create function public.admin_mark_payout_paid(payout uuid, ref text) returns text
language plpgsql security definer set search_path = public as $$
declare st text;
begin
  if not public.is_admin() then raise exception 'Admins only.'; end if;
  if coalesce(trim(ref), '') = '' then raise exception 'Add the FPS reference.'; end if;
  update public.payouts set status = 'paid', paid_at = now(), bank_ref = trim(ref)
   where id = payout and status = 'due' returning status into st;
  if st is null then raise exception 'That payout is already paid.'; end if;
  return st;
end $$;

-- Only signed-in people can call these; each one checks who is calling.
revoke execute on function public.submit_id(), public.book_interview(timestamptz),
  public.admin_review_expert(uuid, text, text), public.admin_mark_payout_paid(uuid, text), public.can_upload_id()
  from public, anon;
grant execute on function public.submit_id(), public.book_interview(timestamptz),
  public.admin_review_expert(uuid, text, text), public.admin_mark_payout_paid(uuid, text), public.can_upload_id()
  to authenticated;
