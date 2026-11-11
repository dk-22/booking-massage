-- Removes campaigns only when they have no booking history. Keeps an audit record.
create or replace function public.delete_campaign(p_campaign_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare campaign_name text;
begin
 if not public.is_admin() then raise exception 'Administrator access required.' using errcode='42501'; end if;
 -- Booking transactions take a share lock on this row; deletion waits and rechecks history.
 select name into campaign_name from public.campaigns where id=p_campaign_id for update;
 if not found then raise exception 'Campaign not found.'; end if;
 if exists(select 1 from public.bookings where campaign_id=p_campaign_id) then
  raise exception 'This campaign has booking history. Close bookings instead to preserve employee records.';
 end if;
 delete from public.slots where campaign_id=p_campaign_id;
 delete from public.sessions where campaign_id=p_campaign_id;
 delete from public.campaigns where id=p_campaign_id;
 insert into public.audit_logs(admin_id,action,details) values(auth.uid(),'campaign.delete',jsonb_build_object('campaignId',p_campaign_id,'name',campaign_name));
end; $$;
revoke all on function public.delete_campaign(uuid) from public;
grant execute on function public.delete_campaign(uuid) to authenticated;
