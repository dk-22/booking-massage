alter table public.bookings add column if not exists cancelled_at timestamptz;
alter table public.bookings add column if not exists cancelled_by uuid;
alter table public.bookings add column if not exists cancelled_by_name text;

create or replace function public.cancel_booking(p_id uuid,p_expected timestamptz)
returns void language plpgsql security definer set search_path='' as $$
declare b public.bookings; cid uuid; actor_name text; cancelled_time timestamptz;
begin
 if not public.is_admin() then raise exception 'Administrator access required.' using errcode='42501'; end if;
 select campaign_id into cid from public.bookings where id=p_id;
 if not found then raise exception 'Booking not found.'; end if;
 -- Same campaign, booking, slot lock order as administrative edits.
 perform 1 from public.campaigns where id=cid for update;
 select * into b from public.bookings where id=p_id for update;
 if b.status='cancelled' then return; end if;
 if b.status<>'confirmed' then raise exception 'Only confirmed bookings can be cancelled.'; end if;
 if p_expected is null or b.updated_at<>p_expected then raise exception 'This booking changed. Close this dialog and refresh bookings before cancelling.'; end if;
 perform 1 from public.slots where id=b.slot_id for update;
 select coalesce(nullif(trim(a.full_name),''),u.email) into actor_name from auth.users u left join public.admin_emails a on a.email=lower(u.email) where u.id=auth.uid();
 cancelled_time:=clock_timestamp();
 update public.bookings set status='cancelled',cancelled_at=cancelled_time,cancelled_by=auth.uid(),cancelled_by_name=actor_name,updated_at=cancelled_time where id=p_id;
 update public.slots s set booked_count=(select count(*) from public.bookings where slot_id=s.id and status='confirmed'),names=coalesce((select array_agg(employee_name order by created_at,id) from public.bookings where slot_id=s.id and status='confirmed'),'{}') where s.id=b.slot_id;
 insert into public.audit_logs(admin_id,action,details) values(auth.uid(),'booking.cancel',jsonb_build_object('bookingId',p_id,'campaignId',cid,'slotId',b.slot_id,'employeeName',b.employee_name,'employeeCode',b.employee_code));
end $$;
revoke all on function public.cancel_booking(uuid,timestamptz) from public,anon;
grant execute on function public.cancel_booking(uuid,timestamptz) to authenticated;
