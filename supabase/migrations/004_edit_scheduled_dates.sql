-- Apply after 003. Adds safe editing/deletion of scheduled dates; preserves booked sessions.
create or replace function public.save_campaign(d jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare cid uuid; entry jsonb; current_status text; target_status text; session_to_remove uuid;
begin
 if not public.is_admin() then raise exception 'Administrator access required.' using errcode='42501'; end if;
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
 return cid;
end; $$;
revoke all on function public.save_campaign(jsonb) from public;
grant execute on function public.save_campaign(jsonb) to authenticated;
