alter table public.admin_emails add column if not exists full_name text check(full_name is null or length(trim(full_name)) between 1 and 120);
alter table public.audit_logs add column if not exists actor_name text;
alter table public.audit_logs add column if not exists actor_email text;
create or replace function public.stamp_audit_actor() returns trigger language plpgsql security definer set search_path='' as $$
begin
 select coalesce(nullif(trim(a.full_name),''),u.email),u.email into new.actor_name,new.actor_email from auth.users u left join public.admin_emails a on a.email=lower(u.email) where u.id=new.admin_id;
 return new;
end; $$;
revoke all on function public.stamp_audit_actor() from public;
create trigger stamp_audit_actor before insert on public.audit_logs for each row execute function public.stamp_audit_actor();
-- Identity stays in admin-only audit data, never public campaign records.
create or replace function public.campaign_save_info() returns table(campaign_id uuid,saved_at timestamptz,saved_by text) language plpgsql security definer set search_path='' as $$
begin
 if not public.is_admin() then raise exception 'Administrator access required.' using errcode='42501'; end if;
 return query select distinct on (l.details->>'campaignId') (l.details->>'campaignId')::uuid,l.created_at,coalesce(l.actor_name,nullif(trim(a.full_name),''),u.email,'Unknown admin') from public.audit_logs l left join auth.users u on u.id=l.admin_id left join public.admin_emails a on a.email=lower(u.email) where l.details ? 'campaignId' and l.action in ('campaign.save','campaign.status','campaign.create') order by l.details->>'campaignId',l.created_at desc,l.id desc;
end; $$;
create or replace function public.campaign_history(p_campaign_id uuid) returns table(id uuid,action text,occurred_at timestamptz,actor_name text,actor_email text,details jsonb) language plpgsql security definer set search_path='' as $$
begin
 if not public.is_admin() then raise exception 'Administrator access required.' using errcode='42501'; end if;
 return query select l.id,l.action,l.created_at,coalesce(l.actor_name,nullif(trim(a.full_name),''),u.email,'Unknown admin'),coalesce(l.actor_email,u.email),l.details from public.audit_logs l left join auth.users u on u.id=l.admin_id left join public.admin_emails a on a.email=lower(u.email) where l.details->>'campaignId'=p_campaign_id::text or exists(select 1 from public.bookings b where b.id::text=l.details->>'bookingId' and b.campaign_id=p_campaign_id) order by l.created_at desc,l.id desc limit 200;
end; $$;
revoke all on function public.campaign_save_info(),public.campaign_history(uuid) from public;
grant execute on function public.campaign_save_info(),public.campaign_history(uuid) to authenticated;
