create index if not exists slots_campaign_time_idx on public.slots(campaign_id,start_time,id);
create index if not exists slots_session_idx on public.slots(session_id);
create index if not exists sessions_campaign_idx on public.sessions(campaign_id);
create index if not exists campaigns_status_created_idx on public.campaigns(status,created_at desc,id);
create index if not exists bookings_campaign_created_idx on public.bookings(campaign_id,created_at,id);
create index if not exists bookings_slot_idx on public.bookings(slot_id);
create index if not exists audit_campaign_time_idx on public.audit_logs((details->>'campaignId'),created_at desc);

create or replace function public.booking_page(p_campaign uuid,p_search text default '',p_date date default null,p_page int default 0) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb; total bigint;
begin
 if not public.is_admin() then raise exception 'Administrator access required.' using errcode='42501'; end if;
 if p_page is null or p_page<0 or p_page>100000 then raise exception 'Invalid page.'; end if;
 select count(*) into total from public.bookings b join public.slots s on s.id=b.slot_id where b.campaign_id=p_campaign and (p_date is null or (s.start_time at time zone 'Indian/Mauritius')::date=p_date) and (coalesce(p_search,'')='' or position(lower(p_search) in lower(b.employee_name||' '||b.employee_code||' '||b.sbu))>0);
 select coalesce(jsonb_agg(to_jsonb(q)),'[]') into result from (select b.* from public.bookings b join public.slots s on s.id=b.slot_id where b.campaign_id=p_campaign and (p_date is null or (s.start_time at time zone 'Indian/Mauritius')::date=p_date) and (coalesce(p_search,'')='' or position(lower(p_search) in lower(b.employee_name||' '||b.employee_code||' '||b.sbu))>0) order by s.start_time,b.created_at,b.id limit 25 offset p_page*25) q;
 return jsonb_build_object('rows',result,'total',total);
end; $$;
revoke all on function public.booking_page(uuid,text,date,int) from public;
grant execute on function public.booking_page(uuid,text,date,int) to authenticated;

create or replace function public.campaign_save_info_page(p_ids uuid[]) returns table(campaign_id uuid,saved_at timestamptz,saved_by text) language plpgsql security definer set search_path='' as $$
begin
 if not public.is_admin() then raise exception 'Administrator access required.' using errcode='42501'; end if;
 return query select distinct on (l.details->>'campaignId') (l.details->>'campaignId')::uuid,l.created_at,coalesce(l.actor_name,nullif(trim(a.full_name),''),u.email,'Unknown admin') from public.audit_logs l left join auth.users u on u.id=l.admin_id left join public.admin_emails a on a.email=lower(u.email) where l.details->>'campaignId'=any(select unnest(p_ids)::text) and l.action in ('campaign.save','campaign.status','campaign.create') order by l.details->>'campaignId',l.created_at desc,l.id desc;
end; $$;

revoke all on function public.campaign_save_info_page(uuid[]) from public;
grant execute on function public.campaign_save_info_page(uuid[]) to authenticated;
create index if not exists campaigns_created_idx on public.campaigns(created_at desc,id);
