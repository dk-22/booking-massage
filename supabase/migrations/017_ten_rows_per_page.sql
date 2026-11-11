-- Keep database page sizes aligned with the three admin tables.
create or replace function public.booking_page(p_campaign uuid,p_search text default '',p_date date default null,p_page int default 0) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb; total bigint;
begin
 if not public.is_admin() then raise exception 'Administrator access required.' using errcode='42501'; end if;
 if p_page is null or p_page<0 or p_page>100000 then raise exception 'Invalid page.'; end if;
 select count(*) into total from public.bookings b join public.slots s on s.id=b.slot_id where b.campaign_id=p_campaign and (p_date is null or (s.start_time at time zone 'Indian/Mauritius')::date=p_date) and (coalesce(p_search,'')='' or position(lower(p_search) in lower(b.employee_name||' '||b.employee_code||' '||b.sbu))>0);
 select coalesce(jsonb_agg(to_jsonb(q)),'[]') into result from (select b.* from public.bookings b join public.slots s on s.id=b.slot_id where b.campaign_id=p_campaign and (p_date is null or (s.start_time at time zone 'Indian/Mauritius')::date=p_date) and (coalesce(p_search,'')='' or position(lower(p_search) in lower(b.employee_name||' '||b.employee_code||' '||b.sbu))>0) order by s.start_time,b.created_at,b.id limit 10 offset p_page*10) q;
 return jsonb_build_object('rows',result,'total',total);
end; $$;
revoke all on function public.booking_page(uuid,text,date,int) from public;
grant execute on function public.booking_page(uuid,text,date,int) to authenticated;

create or replace function public.booking_page_filtered(p_campaign uuid,p_search text default '',p_date date default null,p_page int default 0,p_status text default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb; total bigint;
begin
 if not public.is_admin() then raise exception 'Administrator access required.' using errcode='42501'; end if;
 if p_page is null or p_page<0 or p_page>100000 then raise exception 'Invalid page.'; end if;
 if p_status is not null and p_status not in ('confirmed','cancelled') then raise exception 'Invalid booking status.'; end if;
 select count(*) into total from public.bookings b join public.slots s on s.id=b.slot_id where b.campaign_id=p_campaign and (p_status is null or b.status=p_status) and (p_date is null or (s.start_time at time zone 'Indian/Mauritius')::date=p_date) and (coalesce(p_search,'')='' or position(lower(p_search) in lower(b.employee_name||' '||b.employee_code||' '||b.sbu))>0);
 select coalesce(jsonb_agg(to_jsonb(q)),'[]') into result from (select b.* from public.bookings b join public.slots s on s.id=b.slot_id where b.campaign_id=p_campaign and (p_status is null or b.status=p_status) and (p_date is null or (s.start_time at time zone 'Indian/Mauritius')::date=p_date) and (coalesce(p_search,'')='' or position(lower(p_search) in lower(b.employee_name||' '||b.employee_code||' '||b.sbu))>0) order by s.start_time,b.created_at,b.id limit 10 offset p_page*10) q;
 return jsonb_build_object('rows',result,'total',total);
end; $$;
revoke all on function public.booking_page_filtered(uuid,text,date,int,text) from public;
grant execute on function public.booking_page_filtered(uuid,text,date,int,text) to authenticated;


create or replace function public.admin_directory(p_search text default '',p_page integer default 0)
returns jsonb language plpgsql security definer set search_path=public as $$
declare result jsonb;
begin
 if not public.is_admin() then raise exception 'Administrator access required.' using errcode='42501'; end if;
 if p_page<0 then raise exception 'Invalid page.'; end if;
 select jsonb_build_object('total',(select count(*) from public.admin_emails a where concat_ws(' ',a.full_name,a.email) ilike '%'||trim(p_search)||'%'),
 'rows',coalesce((select jsonb_agg(to_jsonb(r)) from (select a.email,a.full_name,a.enabled,a.updated_at from public.admin_emails a where concat_ws(' ',a.full_name,a.email) ilike '%'||trim(p_search)||'%' order by a.enabled desc,a.full_name nulls last,a.email limit 10 offset p_page*10) r),'[]'::jsonb)) into result;
 return result;
end $$;

