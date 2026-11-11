-- Private, service-role-only check and shared per-email cooldown.
create table public.admin_sign_in_requests(email text primary key,last_requested_at timestamptz not null);
alter table public.admin_sign_in_requests enable row level security;
revoke all on public.admin_sign_in_requests from public,anon,authenticated;
create function public.allow_admin_sign_in_request(p_email text) returns boolean
language plpgsql security definer set search_path='' as $$
declare normalized text:=lower(trim(p_email));accepted boolean:=false;
begin
 if not exists(select 1 from public.admin_emails where email=normalized and enabled) then return false;end if;
 insert into public.admin_sign_in_requests(email,last_requested_at) values(normalized,clock_timestamp())
 on conflict(email) do update set last_requested_at=excluded.last_requested_at
 where admin_sign_in_requests.last_requested_at<clock_timestamp()-interval '60 seconds'
 returning true into accepted;
 return coalesce(accepted,false);
end $$;
revoke all on function public.allow_admin_sign_in_request(text) from public,anon,authenticated;
grant execute on function public.allow_admin_sign_in_request(text) to service_role;
