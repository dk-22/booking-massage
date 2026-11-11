"""Run against a disposable migrated database: PGHOST=... PGPORT=... python3 booking.py.
Requires psql; uses only Python's standard library. Never run against production.
"""
import concurrent.futures, subprocess, uuid

def sql(query, ok=True):
    p=subprocess.run(['psql','-X','-d','postgres','-At','-v','ON_ERROR_STOP=1','-c',query],text=True,capture_output=True)
    if ok and p.returncode: raise AssertionError(p.stderr)
    return p
c,s,slot=map(str,[uuid.uuid4(),uuid.uuid4(),uuid.uuid4()])
sql(f"insert into public.campaigns(id,name,status) values('{c}','Test','published'); insert into public.sessions(id,campaign_id) values('{s}','{c}'); insert into public.slots(id,campaign_id,session_id,start_time,end_time,capacity) values('{slot}','{c}','{s}',now()+interval '1 day',now()+interval '1 day 20 minutes',1); insert into public.sbus values('TEST') on conflict do nothing;")
def book(code,request):
    return sql(f"set role anon; select public.create_booking('{c}','{slot}','{code}','Test Employee','TEST','{request}');",False)
with concurrent.futures.ThreadPoolExecutor(2) as pool:
    requests=list(map(str,[uuid.uuid4(),uuid.uuid4()]))
    results=list(pool.map(lambda x:book(*x),zip(['A','B'],requests)))
assert sum(p.returncode==0 for p in results)==1,results
winner=next(i for i,p in enumerate(results) if p.returncode==0)
assert book(['A','B'][winner],requests[winner]).returncode==0,'Identical retry failed'
assert book(['A','B'][winner],str(uuid.uuid4())).returncode!=0,'Duplicate employee accepted'
assert sql(f"select booked_count from public.slots where id='{slot}'").stdout.strip()=='1'
assert sql('set role anon; select * from public.bookings;',False).returncode!=0,'Private data exposed'
assert sql(f"set role anon; update public.slots set capacity=99 where id='{slot}';",False).returncode!=0,'Direct write allowed'
assert sql("set role authenticated; select public.manage_campaign('{\"action\":\"create\",\"name\":\"Unauthorized\"}');",False).returncode!=0,'Unauthorized admin accepted'
assert 'Test' in sql('set role anon; select name from public.campaigns;').stdout,'Published campaign hidden'
# Concurrent requests by one employee against distinct slots must consume only one place.
second=str(uuid.uuid4())
sql(f"update public.slots set capacity=5 where id='{slot}'; insert into public.slots(id,campaign_id,session_id,start_time,end_time,capacity) values('{second}','{c}','{s}',now()+interval '2 days',now()+interval '2 days 20 minutes',5);")
def same_employee(target):
    return sql(f"set role anon; select public.create_booking('{c}','{target}','SAME','Same Employee','TEST','{uuid.uuid4()}');",False)
with concurrent.futures.ThreadPoolExecutor(2) as pool:
    duplicates=list(pool.map(same_employee,[slot,second]))
assert sum(p.returncode==0 for p in duplicates)==1,'Concurrent duplicate employee accepted'
sql(f"delete from public.bookings where campaign_id='{c}'; delete from public.slots where campaign_id='{c}'; delete from public.sessions where campaign_id='{c}'; delete from public.campaigns where id='{c}';")
print('PASS: last-place race, concurrent employee duplicate, idempotent retry, employee duplicate, count, private reads, direct writes, admin rejection, published visibility')
