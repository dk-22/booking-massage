-- Apply after 001. Adds editing and atomic create-with-dates; preserves existing data.
create or replace function public.save_campaign(d jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare cid uuid; entry jsonb; current_status text; target_status text;
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
