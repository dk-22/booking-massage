create table if not exists public.campaign_save_requests(request_id uuid primary key,admin_id uuid not null,payload jsonb not null,campaign_id uuid not null);
alter table public.campaign_save_requests enable row level security;
revoke all on public.campaign_save_requests from anon,authenticated;
-- Apply after 004. Versioned endpoint prevents falling back to the older append-only save function.
create or replace function public.save_campaign_v2(d jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare cid uuid; entry jsonb; current_status text; target_status text; session_to_remove uuid;
begin
 if not public.is_admin() then raise exception 'Administrator access required.' using errcode='42501'; end if;
 if d->>'requestId' is null then raise exception 'Save reference required. Refresh the app.'; end if;
 perform pg_advisory_xact_lock(hashtextextended(d->>'requestId',7));
 select campaign_id into cid from public.campaign_save_requests where request_id=(d->>'requestId')::uuid and admin_id=auth.uid() and payload=d;
 if found then return cid; end if;
 if exists(select 1 from public.campaign_save_requests where request_id=(d->>'requestId')::uuid) then raise exception 'Save reference already used.'; end if;
 if exists(select 1 from jsonb_array_elements(d->'dates') x where x ? 'sessionId' group by x->>'sessionId' having count(*)>1) then raise exception 'A scheduled date can only be edited once.'; end if;
 target_status:=d->>'status';
 if target_status is null or target_status not in ('draft','published','closed') then raise exception 'Invalid campaign status.'; end if;
 if d->>'name' is null or length(trim(d->>'name')) not between 1 and 120 then raise exception 'Enter a campaign name.'; end if;
 if length(coalesce(d->>'description',''))>2000 then raise exception 'Description is too long.'; end if;
 if coalesce(d->>'id','')='' then
  insert into public.campaigns(name,description) values(trim(d->>'name'),coalesce(d->>'description','')) returning id into cid;
 else
  cid:=(d->>'id')::uuid;
  select status into current_status from public.campaigns where id=cid for update;
  if not found then raise exception 'Campaign not found.'; end if;
  -- Temporarily permit adding dates to a closed campaign inside this transaction.
  update public.campaigns set name=trim(d->>'name'),description=coalesce(d->>'description',''),status='draft' where id=cid;
 end if;
 -- Campaign row is locked above, serializing these changes with booking confirmations.
 for session_to_remove in
  select value::uuid from jsonb_array_elements_text(coalesce(d->'removedSessions','[]'::jsonb))
  union select (value->>'sessionId')::uuid from jsonb_array_elements(d->'dates') where value ? 'sessionId'
 loop
  if not exists(select 1 from public.sessions where id=session_to_remove and campaign_id=cid) then raise exception 'Scheduled date not found in this campaign.'; end if;
  if exists(select 1 from public.bookings b join public.slots s on s.id=b.slot_id where s.session_id=session_to_remove) then raise exception 'This date has booking history and cannot be changed or deleted. Manage its bookings first.'; end if;
  delete from public.slots where session_id=session_to_remove;
  delete from public.sessions where id=session_to_remove;
  insert into public.audit_logs(admin_id,action,details) values(auth.uid(),'session.remove_or_replace',jsonb_build_object('campaignId',cid,'sessionId',session_to_remove));
 end loop;
 if jsonb_typeof(d->'dates') is distinct from 'array' then raise exception 'Invalid dates.'; end if;
 if jsonb_array_length(d->'dates')>31 then raise exception 'Add at most 31 dates at a time.'; end if;
 for entry in select value from jsonb_array_elements(d->'dates') loop
  perform public.manage_campaign(entry||jsonb_build_object('action','session','campaignId',cid));
 end loop;
 if target_status='published' and not exists(select 1 from public.slots where campaign_id=cid and start_time>now() and status='active') then raise exception 'Add a future massage date before publishing.'; end if;
 update public.campaigns set status=target_status where id=cid;
 insert into public.audit_logs(admin_id,action,details) values(auth.uid(),'campaign.save',jsonb_build_object('campaignId',cid,'previousStatus',current_status,'status',target_status));
 insert into public.campaign_save_requests values((d->>'requestId')::uuid,auth.uid(),d,cid);
 return cid;
end; $$;
revoke all on function public.save_campaign_v2(jsonb) from public;
grant execute on function public.save_campaign_v2(jsonb) to authenticated;
