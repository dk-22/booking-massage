-- Direct publishing uses the same future-session validation as the campaign editor.
create or replace function public.set_campaign_status(p_campaign_id uuid,p_status text) returns void
language plpgsql security definer set search_path='' as $$
declare previous_status text;
begin
 if not public.is_admin() then raise exception 'Administrator access required.' using errcode='42501'; end if;
 if p_status is null or p_status not in ('draft','published','closed') then raise exception 'Invalid status.'; end if;
 select status into previous_status from public.campaigns where id=p_campaign_id for update;
 if not found then raise exception 'Campaign not found.'; end if;
 if p_status='published' and not exists(select 1 from public.slots s join public.sessions se on se.id=s.session_id where s.campaign_id=p_campaign_id and s.start_time>now() and s.status='active' and se.status='active') then raise exception 'Add a future massage date before publishing.'; end if;
 update public.campaigns set status=p_status where id=p_campaign_id;
 insert into public.audit_logs(admin_id,action,details) values(auth.uid(),'campaign.status',jsonb_build_object('campaignId',p_campaign_id,'previousStatus',previous_status,'status',p_status));
end; $$;
revoke all on function public.set_campaign_status(uuid,text) from public;
grant execute on function public.set_campaign_status(uuid,text) to authenticated;
