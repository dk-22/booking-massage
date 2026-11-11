-- Run once in the Supabase SQL editor. All browser writes go through RPCs.
create table public.admin_emails(email text primary key check(email=lower(trim(email))), enabled boolean not null default true);
create function public.is_admin() returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from auth.users u join public.admin_emails a on a.email=lower(u.email) where u.id=auth.uid() and u.email_confirmed_at is not null and a.enabled);
$$;
create table public.campaigns(id uuid primary key default gen_random_uuid(), name text not null check(length(trim(name)) between 1 and 120),description text not null default '',status text not null default 'draft' check(status in ('draft','published','closed')),created_at timestamptz not null default now());
create table public.sessions(id uuid primary key default gen_random_uuid(),campaign_id uuid not null references public.campaigns,status text not null default 'active');
create table public.slots(id uuid primary key default gen_random_uuid(),campaign_id uuid not null references public.campaigns,session_id uuid not null references public.sessions,start_time timestamptz not null,end_time timestamptz not null,capacity int not null check(capacity between 1 and 100),booked_count int not null default 0 check(booked_count>=0 and booked_count<=capacity),names text[] not null default '{}',status text not null default 'active',check(end_time>start_time));
create table public.sbus(name text primary key check(length(trim(name)) between 1 and 120));
create table public.bookings(id uuid primary key default gen_random_uuid(),request_id uuid unique not null,campaign_id uuid not null references public.campaigns,slot_id uuid not null references public.slots,employee_code text not null,employee_name text not null,sbu text not null,status text not null default 'confirmed',created_at timestamptz not null default now());
create unique index one_active_booking on public.bookings(campaign_id,employee_code) where status='confirmed';
create table public.audit_logs(id uuid primary key default gen_random_uuid(),admin_id uuid not null,action text not null,details jsonb not null,created_at timestamptz not null default now());
alter table public.admin_emails enable row level security;
alter table public.campaigns enable row level security;
alter table public.sessions enable row level security;
alter table public.slots enable row level security;
alter table public.sbus enable row level security;
alter table public.bookings enable row level security;
alter table public.audit_logs enable row level security;
revoke all on public.admin_emails,public.campaigns,public.sessions,public.slots,public.sbus,public.bookings,public.audit_logs from anon,authenticated;
grant select on public.campaigns,public.sessions,public.slots,public.sbus,public.bookings,public.audit_logs to authenticated;
grant select on public.campaigns,public.slots,public.sbus to anon;
create policy campaigns_read on public.campaigns for select using(public.is_admin() or (status='published' and exists(select 1 from public.slots s where s.campaign_id=campaigns.id and s.start_time>now())));
-- Avoid a recursive campaigns/slots RLS dependency via a small definer predicate.
create function public.published_campaign(p_id uuid) returns boolean language sql stable security definer set search_path='' as $$ select exists(select 1 from public.campaigns where id=p_id and status='published'); $$;
create policy slots_read on public.slots for select using(public.is_admin() or (public.published_campaign(campaign_id) and start_time>now()));
create policy sessions_read on public.sessions for select to authenticated using(public.is_admin());
create policy sbus_read on public.sbus for select using(true);
create policy bookings_read on public.bookings for select to authenticated using(public.is_admin());
create policy audit_read on public.audit_logs for select to authenticated using(public.is_admin());

create function public.create_booking(p_campaign_id uuid,p_slot_id uuid,p_employee_code text,p_employee_name text,p_sbu text,p_request_id uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare s public.slots; b public.bookings; result uuid; code text:=upper(trim(p_employee_code));
begin
 if code is null or length(code) not between 1 and 120 or p_employee_name is null or length(trim(p_employee_name)) not between 1 and 120 or p_sbu is null then raise exception 'Please complete all fields.'; end if;
 -- Serialize identical requests, then employee eligibility, then slot capacity.
 perform pg_advisory_xact_lock(hashtextextended(p_request_id::text,0));
 select * into b from public.bookings where request_id=p_request_id;
 if found then
  if b.campaign_id<>p_campaign_id or b.slot_id<>p_slot_id or b.employee_code<>code or b.employee_name<>trim(p_employee_name) or b.sbu<>p_sbu then raise exception 'Request reference already used.'; end if;
  return b.id;
 end if;
 perform pg_advisory_xact_lock(hashtextextended(p_campaign_id::text||':'||code,1));
 perform 1 from public.campaigns where id=p_campaign_id and status='published' for share;
 if not found then raise exception 'This campaign is no longer accepting bookings.'; end if;
 if exists(select 1 from public.bookings where campaign_id=p_campaign_id and employee_code=code and status='confirmed') then raise exception 'You already have a booking for this campaign.'; end if;
 select * into s from public.slots where id=p_slot_id for update;
 if not found or s.campaign_id<>p_campaign_id or s.status<>'active' or s.start_time<=clock_timestamp() then raise exception 'This time slot is no longer available.'; end if;
 if not exists(select 1 from public.sessions where id=s.session_id and status='active') then raise exception 'Session unavailable.'; end if;
 if s.booked_count>=s.capacity then raise exception 'This time slot has just been fully booked.'; end if;
 if not exists(select 1 from public.sbus where name=p_sbu) then raise exception 'Please select a valid SBU.'; end if;
 insert into public.bookings(request_id,campaign_id,slot_id,employee_code,employee_name,sbu) values(p_request_id,p_campaign_id,p_slot_id,code,trim(p_employee_name),p_sbu) returning id into result;
 update public.slots set booked_count=booked_count+1,names=array_append(names,trim(p_employee_name)) where id=p_slot_id;
 return result;
end; $$;

create function public.manage_campaign(d jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare cid uuid; sid uuid; t timestamptz; finish timestamptz; duration int; pause int; cap int; units text[];
begin
 if not public.is_admin() then raise exception 'This email address is not authorized for the admin portal.' using errcode='42501'; end if;
 if d->>'action'='create' then
  insert into public.campaigns(name,description) values(trim(d->>'name'),coalesce(d->>'description','')) returning id into cid;
 elsif d->>'action'='sbus' then
  units:=string_to_array(d->>'sbus',',');
  if coalesce(array_length(units,1),0)=0 then raise exception 'Enter at least one SBU.'; end if;
  delete from public.sbus;
  insert into public.sbus select distinct trim(v) from unnest(units) v where trim(v)<>'';
 elsif d->>'action'='status' then
  cid:=(d->>'campaignId')::uuid;
  update public.campaigns set status=d->>'status' where id=cid;
  if not found then raise exception 'Campaign not found.'; end if;
 elsif d->>'action'='session' then
  cid:=(d->>'campaignId')::uuid;
  perform 1 from public.campaigns where id=cid and status<>'closed' for update;
  if not found then raise exception 'Campaign unavailable.'; end if;
  duration:=(d->>'duration')::int; pause:=(d->>'breakDuration')::int; cap:=(d->>'capacity')::int;
  if duration is null or pause is null or cap is null or duration not between 5 and 180 or pause not between 0 and 120 or cap not between 1 and 100 then raise exception 'Invalid session settings.'; end if;
  t:=((d->>'date')::date+(d->>'start')::time) at time zone 'Indian/Mauritius'; finish:=((d->>'date')::date+(d->>'end')::time) at time zone 'Indian/Mauritius';
  if t is null or finish is null or t<=now() or finish-t<make_interval(mins=>duration) or (extract(epoch from(finish-t))/60+pause)/(duration+pause)>=241 then raise exception 'Choose a future session with 1–240 slots.'; end if;
  insert into public.sessions(campaign_id) values(cid) returning id into sid;
  while t+make_interval(mins=>duration)<=finish loop
   insert into public.slots(campaign_id,session_id,start_time,end_time,capacity) values(cid,sid,t,t+make_interval(mins=>duration),cap);
   t:=t+make_interval(mins=>duration+pause);
  end loop;
 else raise exception 'Unknown action.';
 end if;
 insert into public.audit_logs(admin_id,action,details) values(auth.uid(),d->>'action',d);
 return coalesce(sid,cid);
end; $$;
revoke all on function public.is_admin(),public.published_campaign(uuid),public.create_booking(uuid,uuid,text,text,text,uuid),public.manage_campaign(jsonb) from public;
grant execute on function public.is_admin(),public.published_campaign(uuid) to anon,authenticated;
grant execute on function public.create_booking(uuid,uuid,text,text,text,uuid) to anon,authenticated;
grant execute on function public.manage_campaign(jsonb) to authenticated;
alter publication supabase_realtime add table public.campaigns,public.slots,public.sessions,public.sbus;
