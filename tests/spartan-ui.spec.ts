import {readFile} from 'node:fs/promises';
import {test,expect,Page} from '@playwright/test';

const futureDay=(offset:number)=>new Date(Date.now()+offset*86400000).toISOString().slice(0,10);
const day=futureDay(30),nextDay=futureDay(31);
const campaignId='11111111-1111-4111-8111-111111111111';
const secondId='22222222-2222-4222-8222-222222222222';

async function fixture(page:Page,admin=false,singleCampaign=false,manyDates=false){
 const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));page.on('console',message=>{if(message.type()==='error'&&message.text().startsWith('ERROR'))errors.push(message.text());});
 await page.routeWebSocket(/supabase\.co/,socket=>socket.close());
 if(admin)await page.addInitScript(()=>{
  const claims={sub:'33333333-3333-4333-8333-333333333333',email:'admin@example.test',role:'authenticated',exp:Math.floor(Date.now()/1000)+3600};
  const token=btoa(JSON.stringify({alg:'HS256',typ:'JWT'}))+'.'+btoa(JSON.stringify(claims))+'.fixture';
  localStorage.setItem('sb-nkwduolajrhpqnkexlsq-auth-token',JSON.stringify({access_token:token,refresh_token:'fixture',expires_at:claims.exp,expires_in:3600,token_type:'bearer',user:{id:claims.sub,email:claims.email,aud:'authenticated',role:'authenticated'}}));
 });
 const campaigns=[{id:campaignId,name:'Workplace wellness',description:'Take a break.',status:'published',created_at:'2026-01-01T00:00:00Z'},{id:secondId,name:'Second campaign',description:'More sessions.',status:'published',created_at:'2026-01-02T00:00:00Z'}];
 if(singleCampaign)campaigns.splice(1);
 const slot=(id:string,campaign_id:string,session_id:string,date:string,hour:number,booked_count=0)=>({id,campaign_id,session_id,start_time:`${date}T${String(hour).padStart(2,'0')}:00:00Z`,end_time:`${date}T${String(hour).padStart(2,'0')}:30:00Z`,capacity:3,booked_count,names:booked_count?['Jane','Sam','Alex'].slice(0,booked_count):[],status:'active'});
 const slots=[slot('s1',campaignId,'date1',day,5,1),slot('s2',campaignId,'date1',day,6,3),slot('s3',campaignId,'date2',nextDay,5),slot('s4',secondId,'date3',day,7)];
 if(manyDates)for(let i=2;i<14;i++)slots.push(slot('extra'+i,campaignId,'extra-date'+i,futureDay(30+i),5));
 let admins=[{email:'admin@example.test',full_name:'Jane Admin',enabled:true,updated_at:'2026-01-01T00:00:00Z'},{email:'other@example.test',full_name:'Other Admin',enabled:true,updated_at:'2026-01-01T00:00:00Z'}];
 let cancellation:any={};
 let units=['Technology','CXO','Other'];let booking={id:'b1',campaign_id:campaignId,slot_id:'s1',employee_name:'Jane',employee_code:'27',sbu:'Technology',status:'confirmed',updated_at:'2026-01-01T00:00:00Z'};
 const writes:{name:string;body:any}[]=[];
 await page.route('**/auth/v1/**',route=>route.fulfill({json:{}}));
 await page.route('**/rest/v1/**',async route=>{
  const url=new URL(route.request().url());const name=url.pathname.split('/').pop()!;
  const body=route.request().method()==='POST'?route.request().postDataJSON():{};
  if(['save_campaign_v2','create_booking','update_booking','save_sbus','delete_campaign','set_campaign_status','save_administrator','set_administrator_status','cancel_booking'].includes(name))writes.push({name,body});
  if(name==='create_booking'&&body.p_employee_code==='DUPLICATE')return route.fulfill({status:400,json:{code:'P0001',message:'You already have a booking for this campaign.'}});
  if(name==='create_booking'){
   const target=slots.find(slot=>slot.id===body.p_slot_id);
   if(target&&target.booked_count>=target.capacity)return route.fulfill({status:400,json:{code:'P0001',message:'This time slot has just been fully booked.'}});
  }
  if(name==='set_campaign_status')campaigns.find(c=>c.id===body.p_campaign_id)!.status=body.p_status;
  if(name==='save_sbus')units=body.p_names.split(',').map((s:string)=>s.trim());
  if(name==='cancel_booking'){cancellation={status:'cancelled',cancelled_by_name:'Jane Admin',cancelled_at:new Date().toISOString()};slots[0].booked_count=0;slots[0].names=[];}
  if(name==='update_booking')booking={...booking,employee_name:body.p_name,employee_code:body.p_code,sbu:body.p_sbu,slot_id:body.p_slot_id};
  let data:any=[];
  if(name==='campaigns')data=url.searchParams.get('select')==='id,name,status'?[...campaigns].sort((a,b)=>b.created_at.localeCompare(a.created_at)):campaigns;
  if(name==='slots'){const filter=url.searchParams.get('campaign_id');data=filter?.startsWith('eq.')?slots.filter(s=>s.campaign_id===filter.slice(3)):slots;}
  if(name==='sessions')data=[{id:'date1',campaign_id:campaignId},{id:'date2',campaign_id:campaignId},{id:'date3',campaign_id:secondId}];
  if(name==='sbus')data=units.map(name=>({name}));
  if(name==='admin_directory')data={rows:admins.filter(a=>[a.email,a.full_name].join(' ').toLowerCase().includes((body.p_search||'').toLowerCase())),total:admins.length};
  if(name==='save_administrator'){const existing=admins.find(a=>a.email===body.p_email);if(existing)existing.full_name=body.p_full_name;else admins.push({email:body.p_email,full_name:body.p_full_name,enabled:true,updated_at:'2026-01-02T00:00:00Z'});data=true;}
  if(name==='set_administrator_status'){admins.find(a=>a.email===body.p_email)!.enabled=body.p_enabled;data=true;}
  if(name==='is_admin')data=true;
  if(name==='current_admin_profile')data=[{full_name:'Jane Admin',email:'admin@example.test'}];
  if(name==='campaign_save_info_page')data=[{campaign_id:campaignId,saved_at:'2026-01-01T12:00:00Z',saved_by:'Test Administrator'}];
  if(name==='booking_page'||name==='booking_page_filtered'){const row={...booking,...cancellation};const rows=!body.p_status||row.status===body.p_status?[row]:[];data={total:rows.length,rows};}
  if(name==='create_booking')data='booking-reference';
  if(['update_booking','save_sbus','save_campaign_v2','delete_campaign','set_campaign_status','save_administrator','set_administrator_status','cancel_booking'].includes(name))data=true;
  await route.fulfill({json:data,headers:{'access-control-expose-headers':'content-range','access-control-allow-origin':'*','content-range':`0-${Array.isArray(data)?Math.max(0,data.length-1):0}/${name==='campaigns'?campaigns.length:1}`}});
 });
 return {errors,writes,slots};
}

async function chooseOption(page:Page,selector:string,text:string){await page.locator(selector).click();await page.getByRole('option',{name:text,exact:true}).click();await expect(page.getByRole('listbox')).toHaveCount(0);}
async function chooseCampaign(page:Page,name='Workplace wellness'){await page.getByRole('tab',{name,exact:true}).click();}
async function chooseFirstDate(page:Page){await page.locator('[data-date-choice]').first().click();}
async function openFirstBooking(page:Page){if(!await page.getByRole('button',{name:'Select time 09:00 – 09:30',exact:true}).isVisible()){await chooseCampaign(page);await chooseFirstDate(page);}await page.getByRole('button',{name:'Select time 09:00 – 09:30',exact:true}).click();return page.getByRole('dialog',{name:'Reserve a massage',exact:true});}

test('employee booking uses standard controls, field errors and confirmation',async({page})=>{
 const {errors,writes}=await fixture(page);await page.goto('/');
 await expect(page.getByRole('heading',{name:'Book your massage',exact:true})).toBeVisible();await expect(page.getByRole('tab',{name:'Workplace wellness',exact:true})).toHaveAttribute('aria-selected','true');await chooseCampaign(page);await chooseFirstDate(page);
 await expect(page.getByRole('button',{name:/^Select time \d/})).toHaveCount(2);
 await page.getByRole('checkbox',{name:'Available only'}).click();await expect(page.getByRole('button',{name:/^Select time \d/})).toHaveCount(1);
 const dialog=await openFirstBooking(page);await expect(dialog).toBeVisible();
 await expect(dialog.getByRole('button',{name:'Confirm booking',exact:true})).toBeDisabled();
 await dialog.getByLabel('Full name',{exact:true}).fill('Test Employee');await dialog.getByLabel('Employee code',{exact:true}).fill('DUPLICATE');await chooseOption(page,'#booking-sbu','Technology');
 await dialog.getByRole('button',{name:'Confirm booking',exact:true}).click();await expect(dialog.getByText('Already booked in this campaign.',{exact:true})).toBeVisible();
 await dialog.getByLabel('Employee code',{exact:true}).fill('NEW');await expect(dialog.getByText('Already booked in this campaign.',{exact:true})).toHaveCount(0);
 await dialog.getByRole('button',{name:'Confirm booking',exact:true}).click();
 await expect(page.getByRole('dialog',{name:'Booking confirmed',exact:true})).toBeVisible();await expect(page.getByText('You’re booked, Test Employee.',{exact:true})).toBeVisible();const tick=page.locator('[data-booking-success]');await expect(tick).toBeVisible();await expect(tick.locator('ng-icon')).toHaveAttribute('name','lucideCheck');await expect(tick).toHaveCSS('width','36px');await expect(tick.locator('ng-icon')).toHaveCSS('width','22px');await expect(tick.locator('ng-icon')).toHaveCSS('color','rgb(5, 150, 105)');await expect(tick.locator('svg')).toHaveCSS('stroke','rgb(5, 150, 105)');await expect(tick).toHaveAttribute('aria-hidden','true');await expect(tick).toHaveCSS('animation-iteration-count','1');await page.emulateMedia({reducedMotion:'reduce'});await expect.poll(()=>tick.evaluate(el=>getComputedStyle(el).animationName)).toBe('none');await page.emulateMedia({reducedMotion:'no-preference'});
 const downloadPromise=page.waitForEvent('download');await page.getByRole('button',{name:'Download .ics',exact:true}).click();const download=await downloadPromise;expect(download.suggestedFilename()).toMatch(/^pause-massage-.*\.ics$/);const contents=await readFile((await download.path())!,'utf8');expect(contents).toContain('BEGIN:VEVENT\r\n');expect(contents).toContain('DTSTART;TZID=Indian/Mauritius:'+day.replaceAll('-','')+'T090000');expect(contents).toContain('DTEND;TZID=Indian/Mauritius:'+day.replaceAll('-','')+'T093000');expect(contents).toContain('SUMMARY:Massage · Workplace wellness');expect(contents).not.toContain('NEW');await expect(page.getByRole('dialog',{name:'Booking confirmed',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Done',exact:true}).click();await expect(page.getByRole('dialog')).toHaveCount(0);
 expect(writes.filter(w=>w.name==='create_booking')).toHaveLength(2);expect(errors).toEqual([]);
});

test('a time filling up preserves details and offers another available date',async({page})=>{
 const {slots,writes,errors}=await fixture(page);
 await page.goto('/');
 const dialog=await openFirstBooking(page);
 await dialog.getByLabel('Full name',{exact:true}).fill('Alex Morgan');
 await dialog.getByLabel('Employee code',{exact:true}).fill('1042');
 await chooseOption(page,'#booking-sbu','Technology');
 slots[0].booked_count=slots[0].capacity;
 await dialog.getByRole('button',{name:'Confirm booking',exact:true}).click();
 await expect(dialog.getByRole('heading',{name:'This time just filled up'})).toBeVisible();
 await expect(dialog.getByText('Choose another time. We’ll keep your details.')).toBeVisible();
 await expect(dialog.getByRole('button',{name:'Confirm booking',exact:true})).toHaveCount(0);
 await dialog.getByLabel('Employee code',{exact:true}).press('Enter');
 expect(writes.filter(write=>write.name==='create_booking')).toHaveLength(1);
 await dialog.getByRole('button',{name:'Choose another time',exact:true}).click();
 await expect(dialog).toHaveCount(0);
 await expect(page.getByRole('heading',{name:'Available times',exact:true})).toBeFocused();
 await expect(page.locator('[data-date-choice]').nth(1)).toHaveAttribute('aria-selected','true');
 await expect(page.getByRole('checkbox',{name:'Available only'})).toBeChecked();
 const replacement=await openFirstBooking(page);
 await expect(replacement.getByLabel('Full name',{exact:true})).toHaveValue('Alex Morgan');
 await expect(replacement.getByLabel('Employee code',{exact:true})).toHaveValue('1042');
 await expect(replacement.locator('#booking-sbu')).toContainText('Technology');
 await replacement.getByRole('button',{name:'Confirm booking',exact:true}).click();
 await expect(page.getByRole('dialog',{name:'Booking confirmed',exact:true})).toBeVisible();
 const requests=writes.filter(write=>write.name==='create_booking');
 expect(requests).toHaveLength(2);
 expect(requests[1].body.p_slot_id).toBe('s3');
 expect(requests[1].body.p_request_id).not.toBe(requests[0].body.p_request_id);
 expect(errors).toEqual([]);
});

test('availability updates show the filled-time alert before confirmation',async({page})=>{
 const {slots,writes,errors}=await fixture(page);
 await page.goto('/');
 const dialog=await openFirstBooking(page);
 await dialog.getByLabel('Full name',{exact:true}).fill('Alex Morgan');
 slots[0].booked_count=slots[0].capacity;
 await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
 await expect(dialog.getByRole('heading',{name:'This time just filled up'})).toBeVisible();
 await expect(dialog.getByLabel('Full name',{exact:true})).toHaveValue('Alex Morgan');
 await expect(dialog.getByRole('button',{name:'Choose another time',exact:true})).toBeEnabled();
 await expect(dialog.getByRole('button',{name:'Confirm booking',exact:true})).toHaveCount(0);
 expect(writes.filter(write=>write.name==='create_booking')).toHaveLength(0);
 expect(errors).toEqual([]);
});

test('campaign picker, date radios, mobile layout and focus restoration',async({page})=>{
 const {errors}=await fixture(page);await page.setViewportSize({width:375,height:812});await page.emulateMedia({reducedMotion:'reduce'});await page.goto('/');
 await chooseCampaign(page,'Second campaign');await expect(page.getByRole('button',{name:'Select time 11:00 – 11:30',exact:true})).toBeVisible();
 await chooseCampaign(page);await expect(page.getByRole('button',{name:'Select time 09:00 – 09:30',exact:true})).toBeVisible();
 await expect(page.locator('[data-slot=popover-content]')).toHaveCount(0);await page.locator('[data-date-choice]').first().focus();await page.keyboard.press('ArrowRight');await page.keyboard.press('Enter');await expect(page.locator('[data-date-choice]').nth(1)).toHaveAttribute('aria-selected','true');
 await page.getByRole('button',{name:'Select time 09:00 – 09:30',exact:true}).click();await page.keyboard.press('Escape');await expect(page.getByRole('dialog')).toHaveCount(0);await expect(page.getByRole('button',{name:'Select time 09:00 – 09:30',exact:true})).toBeFocused();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);expect(errors).toEqual([]);
});

test('availability filter distinguishes fully booked dates from closed slots',async({page})=>{
 const {slots}=await fixture(page);
 slots[0].booked_count=slots[0].capacity;
 slots[2].status='closed';
 await page.goto('/');
 const full=page.getByRole('button',{name:'Select time 09:00 – 09:30',exact:true});
 await expect(full).toBeDisabled();
 await page.getByRole('checkbox',{name:'Available only'}).click();
 await expect(page.getByRole('heading',{name:'All times are booked for this date'})).toBeVisible();
 await page.getByRole('button',{name:'Show all times'}).click();
 await expect(full).toBeVisible();
 await page.locator('[data-date-choice]').nth(1).click();
 await page.getByRole('checkbox',{name:'Available only'}).click();
 await expect(page.getByRole('heading',{name:'No times available'})).toBeVisible();
});

test('administrator can edit bookings and save business units',async({page})=>{
 const {errors,writes}=await fixture(page,true);await page.goto('/bk-admin-codex');
 await page.getByRole('button',{name:'View bookings',exact:true}).first().click();await page.getByRole('button',{name:'Edit booking',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'Edit booking',exact:true});await dialog.getByLabel('Full name',{exact:true}).fill('Jane Updated');await dialog.getByRole('button',{name:'Save booking',exact:true}).click();const review=page.getByRole('alertdialog',{name:'Review booking changes'});await expect(review.getByRole('cell',{name:'Jane Updated',exact:true})).toBeVisible();await expect(review.getByRole('cell',{name:'Business unit',exact:true})).toHaveCount(0);expect(writes.filter(w=>w.name==='update_booking')).toHaveLength(0);await review.getByRole('button',{name:'Back to editing'}).click();await expect(review).toHaveCount(0);await expect(dialog.getByLabel('Full name',{exact:true})).toHaveValue('Jane Updated');await dialog.getByRole('button',{name:'Save booking',exact:true}).click();await review.getByRole('button',{name:'Save',exact:true}).click();await expect(dialog).toHaveCount(0);await expect(page.getByText('Booking updated.',{exact:true})).toBeVisible();await expect(page.getByText('Jane Updated',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Business units',exact:true}).click();await page.getByRole('textbox',{name:'Business units',exact:true}).fill('Technology, CXO, Finance, Other');await page.getByRole('button',{name:'Save settings',exact:true}).click();await expect(page.getByText('Business units saved.',{exact:true})).toBeVisible();await page.getByRole('button',{name:'Close toast',exact:true}).click();
 expect(writes.filter(w=>w.name==='update_booking')).toHaveLength(1);expect(writes.filter(w=>w.name==='save_sbus')).toHaveLength(1);expect(errors).toEqual([]);
});

test('campaign editor stages dates and uses save and delete confirmation components',async({page})=>{
 const {errors,writes}=await fixture(page,true);await page.goto('/bk-admin-codex');
 await page.getByRole('button',{name:'New campaign',exact:true}).click();await page.getByLabel('Campaign name',{exact:true}).fill('New wellness campaign');await page.getByRole('button',{name:'Add a date',exact:true}).click();
 const dateDialog=page.getByRole('dialog',{name:'Add massage date',exact:true});await dateDialog.getByLabel('Date',{exact:true}).click();await page.getByRole('button',{name:'Go to the next month',exact:true}).click();await page.getByRole('grid').getByRole('gridcell',{name:'15',exact:true}).click();await expect(page.getByRole('grid')).toHaveCount(0);await dateDialog.getByRole('button',{name:'Start',exact:true}).click();await chooseOption(page,'#start-hour','10');await chooseOption(page,'#start-minute','15');await page.getByRole('button',{name:'Done',exact:true}).click();await expect(page.locator('#start-hour')).toHaveCount(0);await expect(dateDialog.getByRole('button',{name:'Start',exact:true})).toContainText('10:15');await dateDialog.getByRole('button',{name:'End',exact:true}).click();await chooseOption(page,'#end-hour','13');await chooseOption(page,'#end-minute','45');await page.getByRole('button',{name:'Done',exact:true}).click();await expect(page.locator('#end-hour')).toHaveCount(0);await expect(dateDialog.getByRole('button',{name:'End',exact:true})).toContainText('13:45');await dateDialog.getByRole('button',{name:'Save',exact:true}).click();await expect(dateDialog).toHaveCount(0);await expect(page.getByText('New · unsaved',{exact:true})).toBeVisible();
 await page.getByRole('switch',{name:'Accept bookings',exact:true}).click();await page.getByRole('button',{name:'Save and publish',exact:true}).click();const confirmation=page.getByRole('alertdialog',{name:'Save and publish campaign?',exact:true});await expect(confirmation).toBeVisible();await confirmation.getByRole('button',{name:'Keep editing',exact:true}).click();await expect(confirmation).toHaveCount(0);expect(writes.filter(w=>w.name==='save_campaign_v2')).toHaveLength(0);
 await page.getByRole('button',{name:'Save and publish',exact:true}).click();await page.getByRole('button',{name:'Confirm and publish',exact:true}).click();await expect(page.getByText('Campaign published. Bookings are open.',{exact:true})).toBeVisible();expect(writes.filter(w=>w.name==='save_campaign_v2')).toHaveLength(1);expect(JSON.stringify(writes.find(w=>w.name==='save_campaign_v2')?.body)).toContain('-15');expect(JSON.stringify(writes.find(w=>w.name==='save_campaign_v2')?.body)).toContain('10:15');expect(JSON.stringify(writes.find(w=>w.name==='save_campaign_v2')?.body)).toContain('13:45');
 await page.getByRole('button',{name:'More actions for Workplace wellness',exact:true}).click();await page.getByRole('menuitem',{name:'Delete campaign',exact:true}).click();const deletion=page.getByRole('alertdialog',{name:'Delete campaign?',exact:true});await expect(deletion).toBeVisible();await deletion.getByRole('button',{name:'Keep campaign',exact:true}).click();await expect(deletion).toHaveCount(0);expect(writes.filter(w=>w.name==='delete_campaign')).toHaveLength(0);expect(errors).toEqual([]);
});

test('administrator sign-in submits with Enter without sending a real email',async({page})=>{
 const {errors}=await fixture(page);let direct=0;page.on('request',r=>{if(r.url().includes('/auth/v1/otp'))direct++;});await page.route('**/functions/v1/request-admin-sign-in',r=>r.fulfill({json:{message:'If this email has admin access, you’ll receive a sign-in link.'}}));await page.goto('/bk-admin-codex/login');await page.getByLabel('Email address',{exact:true}).fill('admin@example.test');await page.getByLabel('Email address',{exact:true}).press('Enter');await expect(page.getByText('Check your email',{exact:true})).toBeVisible();expect(direct).toBe(0);expect(errors).toEqual([]);
});

test('standard component layouts remain usable on desktop and mobile',async({page})=>{
 const {errors}=await fixture(page,true);await page.setViewportSize({width:1440,height:960});await page.goto('/');
 await expect(page.getByRole('tab',{name:'Workplace wellness',exact:true})).toHaveAttribute('aria-selected','true');await page.screenshot({path:'artifacts/spartan-home-start.png',fullPage:true});await chooseCampaign(page);await chooseFirstDate(page);await expect(page.getByRole('button',{name:'Select time 09:00 – 09:30',exact:true})).toBeVisible();await page.screenshot({path:'artifacts/spartan-home-desktop.png',fullPage:true});
 await page.setViewportSize({width:375,height:812});await expect(page.getByRole('button',{name:'Select time 09:00 – 09:30',exact:true})).toHaveCSS('height','44px');await page.screenshot({path:'artifacts/spartan-home-mobile.png',fullPage:true});expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);
 const booking=await openFirstBooking(page);await expect(booking).toBeVisible();await booking.evaluate(el=>Promise.all(el.getAnimations({subtree:true}).map(a=>a.finished.catch(()=>{}))));await page.screenshot({path:'artifacts/spartan-dialog-mobile.png',fullPage:true});expect(await booking.evaluate(el=>el.scrollWidth>el.clientWidth)).toBe(false);await page.keyboard.press('Escape');await expect(booking).toHaveCount(0);
 await page.goto('/bk-admin-codex');
 const campaignRow=page.getByRole('row').filter({hasText:'Workplace wellness'});
 const viewBookings=campaignRow.getByRole('button',{name:'View bookings',exact:true});
 const details=campaignRow.getByRole('button',{name:'Details for Workplace wellness'});
 await expect(viewBookings).toBeInViewport();
 await expect(campaignRow.getByRole('button',{name:'More actions for Workplace wellness'})).toBeInViewport();
 await details.click();
 await expect(details).toHaveAttribute('aria-expanded','true');
 await expect(campaignRow.getByText('Test Administrator',{exact:true}).filter({visible:true})).toBeVisible();
 await details.click();
 await page.screenshot({path:'artifacts/spartan-admin-mobile.png',fullPage:true});
 await viewBookings.click();
 const bookingRow=page.getByRole('row').filter({hasText:'Jane'});
 await expect(bookingRow.getByRole('button',{name:'Edit booking',exact:true})).toBeInViewport();
 await expect(bookingRow.getByRole('button',{name:'Cancel booking',exact:true})).toBeInViewport();
 expect(await bookingRow.evaluate(el=>el.closest('table')!.scrollWidth<=el.closest('table')!.parentElement!.clientWidth)).toBe(true);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);
 await page.getByRole('button',{name:'Back to campaigns',exact:true}).click();
 await page.setViewportSize({width:1440,height:960});
 await expect(page.getByRole('columnheader',{name:'Last saved',exact:true})).toBeVisible();
 await page.screenshot({path:'artifacts/spartan-admin-desktop.png',fullPage:true});expect(errors).toEqual([]);
});


test('database values use skeletons while static headings remain visible',async({page})=>{
 const {errors}=await fixture(page,true);
 let release!:()=>void;const pending=new Promise<void>(resolve=>release=resolve);
 await page.route('**/rest/v1/campaigns?**',async route=>{await pending;await route.fallback();});
 await page.goto('/bk-admin-codex');
 await expect(page.getByRole('heading',{name:'Campaigns',exact:true})).toBeVisible();
 await expect(page.getByLabel('Find a campaign',{exact:true})).toBeVisible();
 await expect(page.getByRole('status',{name:'Loading campaigns',exact:true}).getByRole('columnheader',{name:'Campaign',exact:true})).toBeVisible();
 await expect(page.getByRole('status',{name:'Loading campaign pagination',exact:true})).toBeVisible();
 await expect(page.getByRole('status',{name:'Loading campaigns',exact:true})).toBeVisible();

 const skeleton=page.getByRole('status',{name:'Loading campaigns',exact:true}).locator('[data-slot="skeleton"]').first();
 await expect.poll(()=>skeleton.evaluate(el=>el.getAnimations().length)).toBeGreaterThan(0);
 const opacity=await skeleton.evaluate(async el=>{const animation=el.getAnimations()[0];animation.pause();animation.currentTime=0;const start=getComputedStyle(el).opacity;animation.currentTime=600;const middle=getComputedStyle(el).opacity;animation.play();return {start,middle};});
 expect(Number(opacity.middle)).toBeLessThan(Number(opacity.start));
 await page.emulateMedia({reducedMotion:'reduce'});
 await expect.poll(()=>skeleton.evaluate(el=>el.getAnimations().length)).toBe(0);
 await page.emulateMedia({reducedMotion:'no-preference'});
 await expect(page.getByText('0 campaigns',{exact:false})).toHaveCount(0);

 release();
 await expect(page.getByRole('status',{name:'Loading campaigns',exact:true})).toHaveCount(0);
 await expect(page.getByText('Showing 1–2 of 2 campaigns',{exact:true})).toBeVisible();
 expect(errors).toEqual([]);
});


test('reservation count, date options and pagination wait for booking data',async({page})=>{
 await fixture(page,true);await page.goto('/bk-admin-codex');
 await expect(page.getByRole('button',{name:'View bookings',exact:true}).first()).toBeVisible();
 let release!:()=>void;const pending=new Promise<void>(resolve=>release=resolve);
 await page.route('**/rest/v1/rpc/booking_page',async route=>{await pending;await route.fallback();});
 await page.getByRole('button',{name:'View bookings',exact:true}).first().click();
 const table=page.getByRole('status',{name:'Loading bookings',exact:true});
 await expect(table.getByRole('columnheader',{name:'Employee',exact:true})).toBeVisible();
 await expect(table.locator('tbody tr')).toHaveCount(5);
 await expect(table.locator('tbody [data-slot="skeleton"]').filter({visible:true})).toHaveCount(30);
 await expect(table.getByRole('button',{name:'Edit booking'})).toHaveCount(0);
 for(const name of ['Loading reservation count','Loading booking pagination','Loading booking dates'])await expect(page.getByRole('status',{name,exact:true})).toBeVisible();
 await expect(page.getByText('0 reservations · Mauritius time',{exact:true})).toHaveCount(0);
 release();await expect(page.getByRole('status',{name:'Loading reservation count',exact:true})).toHaveCount(0);
 await expect(page.getByText('1 reservation · Mauritius time',{exact:true})).toBeVisible();
});


test('employee loading preserves static labels and shows skeleton table cells',async({page})=>{
 const {errors}=await fixture(page);
 let release!:()=>void;const pending=new Promise<void>(resolve=>release=resolve);
 await page.route('**/rest/v1/campaigns?**',async route=>{await pending;await route.fallback();});
 await page.goto('/');
 const loading=page.getByRole('status',{name:'Loading campaigns and available times',exact:true});
 for(const name of ['Date','Available times'])await expect(loading.getByRole('heading',{name,exact:true})).toBeVisible();
 await expect(page.getByRole('heading',{name:'Choose your session',exact:true})).toBeVisible();
 await expect(loading.getByRole('columnheader',{name:'Time',exact:true})).toBeVisible();
 await expect(loading.getByRole('columnheader',{name:'Availability',exact:true})).toBeVisible();
 await expect(loading.locator('tbody tr')).toHaveCount(4);
 await expect(loading.locator('tbody [data-slot="skeleton"]')).toHaveCount(16);
 await expect(loading.getByRole('button',{name:'Select time',exact:true})).toHaveCount(0);
 release();await expect(loading).toHaveCount(0);
 await expect(page.getByRole('heading',{name:'Available times',exact:true})).toBeVisible();
 await expect(page.getByRole('tab',{name:'Workplace wellness',exact:true})).toHaveAttribute('aria-selected','true');
 expect(errors).toEqual([]);
});


test('Spartan avatar account menu shows initials and signs out',async({page})=>{
 const {errors}=await fixture(page,true);await page.goto('/bk-admin-codex');
 const trigger=page.getByRole('button',{name:'Account menu for Jane Admin',exact:true});
 await expect(trigger.locator('[data-slot="avatar-fallback"]')).toHaveText('JA');
 await expect(page.getByRole('button',{name:'Sign out',exact:true})).toHaveCount(0);
 await trigger.focus();await page.keyboard.press('Enter');
 await expect(page.getByRole('menu').getByText('admin@example.test',{exact:true})).toBeVisible();
 let signOutRequests=0;page.on('request',request=>{if(request.url().includes('/auth/v1/logout'))signOutRequests++;});
 await page.getByRole('menuitem',{name:'Sign out',exact:true}).click();
 const confirmation=page.getByRole('alertdialog',{name:'Sign out?',exact:true});await expect(confirmation).toBeVisible();expect(signOutRequests).toBe(0);
 await confirmation.getByRole('button',{name:'Cancel',exact:true}).click();await expect(confirmation).toHaveCount(0);await expect(trigger).toBeVisible();expect(signOutRequests).toBe(0);
 await trigger.click();await page.getByRole('menuitem',{name:'Sign out',exact:true}).click();await confirmation.getByRole('button',{name:'Sign out',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Administrator sign-in',exact:true})).toBeVisible();expect(signOutRequests).toBe(1);
 await expect(trigger).toHaveCount(0);expect(errors).toEqual([]);
});


test('sidebar administrator management supports add, edit, deactivate and reactivate',async({page})=>{
 const {errors,writes}=await fixture(page,true);await page.goto('/bk-admin-codex');await page.getByRole('button',{name:'Administrators',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Administrators',exact:true})).toBeVisible();
 await expect(page.getByRole('row').filter({hasText:'admin@example.test'}).getByRole('button',{name:'Deactivate',exact:true})).toBeDisabled();
 await page.getByRole('button',{name:'Add administrator',exact:true}).click();const add=page.getByRole('dialog',{name:'Add administrator',exact:true});await add.getByLabel('Full name',{exact:true}).fill('New Admin');await add.getByLabel('Email address',{exact:true}).fill('new@example.test');await add.getByRole('button',{name:'Save administrator',exact:true}).click();await expect(add).toHaveCount(0);
 const row=page.getByRole('row').filter({hasText:'new@example.test'});await row.getByRole('button',{name:'Edit',exact:true}).click();const edit=page.getByRole('dialog',{name:'Edit administrator',exact:true});await expect(edit.getByLabel('Email address')).toHaveAttribute('readonly','');await edit.getByLabel('Full name').fill('Renamed Admin');await edit.getByRole('button',{name:'Save administrator',exact:true}).click();await expect(row).toContainText('Renamed Admin');
 await row.getByRole('button',{name:'Deactivate',exact:true}).click();let confirmation=page.getByRole('alertdialog',{name:'Deactivate administrator?',exact:true});await confirmation.getByRole('button',{name:'Cancel',exact:true}).click();await expect(confirmation).toHaveCount(0);expect(writes.filter(w=>w.name==='set_administrator_status')).toHaveLength(0);
 await row.getByRole('button',{name:'Deactivate',exact:true}).click();await confirmation.getByRole('button',{name:'Deactivate',exact:true}).click();await expect(row).toContainText('Inactive');await row.getByRole('button',{name:'Reactivate',exact:true}).click();confirmation=page.getByRole('alertdialog',{name:'Reactivate administrator?',exact:true});await confirmation.getByRole('button',{name:'Reactivate',exact:true}).click();await expect(row).toContainText('Active');expect(writes.filter(w=>w.name==='save_administrator')).toHaveLength(2);expect(writes.filter(w=>w.name==='set_administrator_status')).toHaveLength(2);await page.getByRole('button',{name:'Bookings',exact:true}).click();await chooseOption(page,'#bookings-campaign','Workplace wellness');await expect(page.getByRole('button',{name:'Edit booking',exact:true})).toBeVisible();expect(errors).toEqual([]);
});

test('mobile sidebar opens and closes after navigating',async({page})=>{
 const {errors}=await fixture(page,true);await page.setViewportSize({width:375,height:812});await page.goto('/bk-admin-codex');await page.getByRole('button',{name:'Open navigation',exact:true}).click();const drawer=page.getByRole('dialog',{name:'Sidebar',exact:true});await expect(drawer.getByRole('button',{name:'Administrators',exact:true})).toBeVisible();await drawer.evaluate(el=>Promise.all(el.getAnimations({subtree:true}).map(a=>a.finished.catch(()=>{}))));await page.screenshot({path:'artifacts/spartan-sidebar-mobile.png'});await drawer.getByRole('button',{name:'Account menu for Jane Admin',exact:true}).click();const menu=page.getByRole('menu');await expect(menu.getByRole('menuitem',{name:'Sign out',exact:true})).toBeVisible();await menu.evaluate(el=>Promise.all(el.getAnimations({subtree:true}).map(a=>a.finished.catch(()=>{}))));const bounds=await menu.boundingBox();expect(bounds!.x).toBeGreaterThanOrEqual(0);expect(bounds!.x+bounds!.width).toBeLessThanOrEqual(375);await page.keyboard.press('Escape');await expect(menu).toHaveCount(0);await drawer.getByRole('button',{name:'Administrators',exact:true}).click();await expect(drawer).toHaveCount(0);await expect(page.getByRole('heading',{name:'Administrators',exact:true})).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);expect(errors).toEqual([]);
});


test('booking cancellation requires confirmation and retains administrator attribution',async({page})=>{
 const {errors,writes}=await fixture(page,true);await page.goto('/bk-admin-codex');await page.getByRole('button',{name:'View bookings',exact:true}).first().click();await page.getByRole('button',{name:'Cancel booking',exact:true}).click();
 const dialog=page.getByRole('alertdialog',{name:'Cancel this booking?',exact:true});await expect(dialog.getByRole('heading',{name:'Jane',exact:true})).toBeVisible();await dialog.getByRole('button',{name:'Keep booking',exact:true}).click();await expect(dialog).toHaveCount(0);expect(writes.filter(w=>w.name==='cancel_booking')).toHaveLength(0);
 await page.getByRole('button',{name:'Cancel booking',exact:true}).click();await dialog.getByRole('button',{name:'Cancel booking',exact:true}).click();await expect(dialog).toHaveCount(0);const row=page.getByRole('row').filter({hasText:'Cancelled by Jane Admin'});await expect(row.getByText('Cancelled',{exact:true}).filter({visible:true})).toBeVisible();await expect(row.locator('[data-slot=badge]').filter({visible:true})).toHaveAttribute('data-variant','destructive');await expect(row.getByRole('button')).toHaveCount(0);expect(writes.filter(w=>w.name==='cancel_booking')).toHaveLength(1);expect(writes.find(w=>w.name==='cancel_booking')?.body.p_expected).toBe('2026-01-01T00:00:00Z');expect(errors).toEqual([]);
});


test('admin sidebar collapses to icons with account menu and no navbar',async({page})=>{
 const {errors}=await fixture(page,true);await page.goto('/bk-admin-codex');await expect(page.getByRole('button',{name:'Account menu for Jane Admin',exact:true})).toBeVisible();await expect(page.getByRole('banner')).toHaveCount(0);
 await page.getByRole('button',{name:'Toggle navigation',exact:true}).click();await expect(page.locator('hlm-sidebar')).toHaveAttribute('data-state','collapsed');
 await page.getByRole('button',{name:'Administrators',exact:true}).click();await expect(page.getByRole('heading',{name:'Administrators',exact:true})).toBeVisible();
 const account=page.getByRole('button',{name:'Account menu for Jane Admin',exact:true});await expect(account.locator('[data-slot="avatar"]')).toBeVisible();await account.click();await expect(page.getByRole('menuitem',{name:'Sign out',exact:true})).toBeVisible();await page.keyboard.press('Escape');
 await page.getByRole('button',{name:'Toggle navigation',exact:true}).click();await expect(page.locator('hlm-sidebar')).toHaveAttribute('data-state','expanded');expect(errors).toEqual([]);
});


test('paginated campaign tabs support pointer and keyboard selection',async({page})=>{
 const {errors}=await fixture(page);await page.goto('/');const first=page.getByRole('tab',{name:'Workplace wellness',exact:true});const second=page.getByRole('tab',{name:'Second campaign',exact:true});await expect(first).toHaveAttribute('aria-selected','true');await expect(page.locator('[data-slot="tabs-paginated-list"]').first()).toBeVisible();await expect(page.getByRole('button',{name:'Select time 09:00 – 09:30',exact:true})).toBeVisible();await second.click();await expect(second).toHaveAttribute('aria-selected','true');await expect(page.getByRole('button',{name:'Select time 11:00 – 11:30',exact:true})).toBeVisible();await first.focus();await page.keyboard.press('Enter');await expect(first).toHaveAttribute('aria-selected','true');expect(errors).toEqual([]);
});

test('a single campaign is selected automatically',async({page})=>{
 const {errors}=await fixture(page,false,true);await page.goto('/');await expect(page.getByRole('tab',{name:'Workplace wellness',exact:true})).toHaveAttribute('aria-selected','true');await expect(page.getByRole('combobox')).toHaveCount(0);await expect(page.getByRole('button',{name:'Select time 09:00 – 09:30',exact:true})).toBeVisible();expect(errors).toEqual([]);
});

test('Spartan Select shows readable filter and booking destination labels',async({page})=>{
 const {errors,writes}=await fixture(page,true);await page.goto('/bk-admin-codex');await chooseOption(page,'#campaign-status','Unpublished');await expect(page.locator('#campaign-status')).toContainText('Unpublished');await chooseOption(page,'#campaign-status','All campaigns');await page.getByRole('button',{name:'View bookings',exact:true}).first().click();await expect(page.locator('#booking-date-filter')).toContainText('All dates');
 const label=(date:string)=>new Intl.DateTimeFormat('en-GB',{timeZone:'Indian/Mauritius',weekday:'short',day:'numeric',month:'short',year:'numeric'}).format(new Date(date+'T12:00:00+04:00'));
 await chooseOption(page,'#booking-date-filter',label(day));await expect(page.locator('#booking-date-filter')).toContainText(label(day));await chooseOption(page,'#booking-date-filter','All dates');
 await page.getByRole('button',{name:'Edit booking',exact:true}).click();await chooseOption(page,'#edit-booking-sbu','CXO');await expect(page.locator('#edit-booking-sbu')).toContainText('CXO');await page.locator('#edit-booking-slot').click();await page.getByRole('option').filter({hasText:label(nextDay)}).click();await expect(page.getByRole('listbox')).toHaveCount(0);await expect(page.locator('#edit-booking-slot')).toContainText(label(nextDay));
 await page.getByRole('button',{name:'Save booking',exact:true}).click();const review=page.getByRole('alertdialog',{name:'Review booking changes',exact:true});await expect(review.getByRole('cell',{name:'Business unit',exact:true})).toBeVisible();await review.getByRole('button',{name:'Save',exact:true}).click();await expect(review).toHaveCount(0);expect(writes.find(w=>w.name==='update_booking')?.body).toMatchObject({p_slot_id:'s3',p_sbu:'CXO'});expect(errors).toEqual([]);
});


test('history uses Trace skeletons and expandable saved details',async({page})=>{
 const {errors}=await fixture(page,true);await page.goto('/bk-admin-codex');
 let release!:()=>void;const pending=new Promise<void>(resolve=>release=resolve);
 await page.route('**/rest/v1/rpc/campaign_history',async route=>{await pending;await route.fulfill({json:[{id:'history-1',action:'campaign.save',actor_name:'Jane Admin',actor_email:'admin@example.test',occurred_at:'2026-01-01T12:00:00Z',details:{}}]});});
 await page.getByRole('button',{name:'More actions for Workplace wellness',exact:true}).click();await page.getByRole('menuitem',{name:'View history',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'Campaign history',exact:true});const loading=dialog.getByRole('status',{name:'Loading history',exact:true});await expect(loading).toBeVisible();await expect(loading.locator('[data-slot="skeleton"]')).toHaveCount(16);
 release();await expect(loading).toHaveCount(0);const entry=dialog.getByRole('button',{name:'Campaign saved by Jane Admin at 16:00',exact:true});await expect(entry).toBeVisible();await expect(dialog.locator('[data-slot="trace"]')).toHaveCount(1);await expect(entry).toHaveAttribute('aria-expanded','false');await entry.click();await expect(entry).toHaveAttribute('aria-expanded','true');await expect(dialog.getByText('Saved by admin@example.test', {exact:true})).toBeVisible();await expect(dialog.getByText('This action was recorded without additional details.',{exact:true})).toBeVisible();await entry.click();await expect(entry).toHaveAttribute('aria-expanded','false');expect(errors).toEqual([]);
});


test('closing and publishing campaigns require explicit confirmation',async({page})=>{
 const {errors,writes}=await fixture(page,true);await page.goto('/bk-admin-codex');
 const openMenu=async()=>{await page.getByRole('button',{name:'More actions for Workplace wellness',exact:true}).click();};
 await openMenu();await page.getByRole('menuitem',{name:'Close bookings',exact:true}).click();let dialog=page.getByRole('alertdialog',{name:'Close bookings?',exact:true});await expect(dialog).toContainText('Existing bookings will be kept.');expect(writes.filter(w=>w.name==='set_campaign_status')).toHaveLength(0);await dialog.getByRole('button',{name:'Cancel',exact:true}).click();await expect(dialog).toHaveCount(0);expect(writes.filter(w=>w.name==='set_campaign_status')).toHaveLength(0);
 await openMenu();await page.getByRole('menuitem',{name:'Close bookings',exact:true}).click();await dialog.getByRole('button',{name:'Close bookings',exact:true}).click();await expect(dialog).toHaveCount(0);const row=page.getByRole('row').filter({hasText:'Workplace wellness'});await expect(row).toContainText('Closed');
 await openMenu();await page.getByRole('menuitem',{name:'Publish campaign',exact:true}).click();dialog=page.getByRole('alertdialog',{name:'Publish campaign?',exact:true});await expect(dialog).toContainText('visible to employees and open for bookings');await dialog.getByRole('button',{name:'Cancel',exact:true}).click();await expect(dialog).toHaveCount(0);expect(writes.filter(w=>w.name==='set_campaign_status')).toHaveLength(1);
 await openMenu();await page.getByRole('menuitem',{name:'Publish campaign',exact:true}).click();await dialog.getByRole('button',{name:'Publish campaign',exact:true}).click();await expect(dialog).toHaveCount(0);await expect(row).toContainText('Bookings open');expect(writes.filter(w=>w.name==='set_campaign_status').map(w=>w.body.p_status)).toEqual(['closed','published']);expect(errors).toEqual([]);
});

test('campaign visibility switch supports pointer and keyboard without saving immediately',async({page})=>{
 const {errors,writes}=await fixture(page,true);await page.goto('/bk-admin-codex');await page.getByRole('button',{name:'New campaign',exact:true}).click();
 const control=page.getByRole('switch',{name:'Accept bookings',exact:true});await expect(control).not.toBeChecked();await expect(page.locator('#visibility-description')).toHaveText('Only admins can see this campaign. Employees can’t view or book it.');
 await control.focus();await page.keyboard.press('Space');await expect(control).toBeChecked();await expect(page.locator('#visibility-description')).toHaveText('Employees can see and book this campaign after you save.');
 await page.setViewportSize({width:375,height:812});await expect(control).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);expect(writes.filter(w=>w.name==='manage_campaign'||w.name==='set_campaign_status')).toHaveLength(0);expect(errors).toEqual([]);
 await page.getByRole('button',{name:'Back to campaigns',exact:true}).click();
 await page.getByRole('button',{name:'More actions for Workplace wellness',exact:true}).click();
 await page.getByRole('menuitem',{name:'Edit campaign',exact:true}).click();
 await page.getByRole('button',{name:'Save changes',exact:true}).click();
 const save=page.getByRole('alertdialog',{name:'Save campaign changes?',exact:true});
 await expect(save.getByText('Employees can continue to see and book this campaign.')).toBeVisible();
 await save.getByRole('button',{name:'Keep editing',exact:true}).click();
 await control.click();
 await page.getByRole('button',{name:'Save and unpublish',exact:true}).click();
 await expect(page.getByRole('alertdialog',{name:'Save and unpublish campaign?',exact:true}).getByText(/Existing bookings will be kept/)).toBeVisible();
 expect(writes.filter(w=>w.name==='save_campaign_v2')).toHaveLength(0);
});


test('attendees open on hover and keyboard focus without a click',async({page})=>{
 const {errors}=await fixture(page);await page.goto('/');await chooseCampaign(page);await chooseFirstDate(page);
 const trigger=page.locator('button[hlmHoverCardTrigger]:visible').first();const card=page.locator('[data-slot="hover-card-content"]');await expect(card).toHaveCount(0);await trigger.hover();await expect(card).toBeVisible();await expect(card.getByText('Jane',{exact:true})).toBeVisible();await card.hover();await expect(card).toBeVisible();await page.getByRole('heading',{name:'Book your massage',exact:true}).hover();await expect(card).toHaveCount(0);
 await trigger.focus();await expect(card).toBeVisible();await page.keyboard.press('Tab');await expect(card).toHaveCount(0);expect(errors).toEqual([]);
});


test('many dates paginate with a white selected dot and no mobile overflow',async({page})=>{
 const {errors}=await fixture(page,false,false,true);await page.setViewportSize({width:375,height:812});await page.goto('/');const dates=page.locator('[data-date-choice]');await expect(dates).toHaveCount(14);const first=dates.first();await expect(first).toHaveAttribute('aria-selected','true');await expect(first.locator('span span')).toHaveCSS('background-color','rgb(255, 255, 255)');await expect(first).toHaveCSS('background-color','rgb(0, 0, 0)');
 const campaign=page.getByRole('tab',{name:'Workplace wellness',exact:true});expect((await first.boundingBox())!.height).toBe((await campaign.boundingBox())!.height);const book=page.getByRole('button',{name:'Select time 09:00 – 09:30',exact:true});const full=page.getByRole('button',{name:'Select time 10:00 – 10:30',exact:true});expect((await book.boundingBox())!.width).toBe((await full.boundingBox())!.width);
 const strip=page.locator('hlm-paginated-tabs-list').nth(1);const next=strip.locator('[data-pagination="next"]');await expect(next).toBeVisible();await next.click();await dates.last().focus();await page.keyboard.press('Enter');await expect(dates.last()).toHaveAttribute('aria-selected','true');await expect(dates.last().locator('span span')).toHaveCSS('background-color','rgb(255, 255, 255)');expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);expect(errors).toEqual([]);
});


test('compact admin bookings filter status across database pages',async({page})=>{
 const {errors}=await fixture(page,true);await page.goto('/bk-admin-codex');await page.getByRole('button',{name:'Bookings',exact:true}).click();await expect(page.getByRole('button',{name:'Edit booking',exact:true})).toBeVisible();await expect(page.locator('#bookings-campaign')).toContainText('Second campaign');await chooseOption(page,'#bookings-campaign','Workplace wellness');await expect(page.getByRole('heading',{name:'Bookings',exact:true})).toHaveCount(1);await expect(page.getByRole('columnheader',{name:'Date & time',exact:true})).toBeVisible();await chooseOption(page,'#booking-status-filter','Cancelled');await expect(page.getByRole('heading',{name:'No matching bookings',exact:true})).toBeVisible();await expect(page.getByText('0 reservations · Mauritius time',{exact:true})).toBeVisible();await chooseOption(page,'#booking-status-filter','Confirmed');await expect(page.getByRole('button',{name:'Edit booking',exact:true})).toBeVisible();await page.screenshot({path:'artifacts/spartan-admin-bookings.png',fullPage:true});await chooseOption(page,'#bookings-campaign','Second campaign');await expect(page.locator('#bookings-campaign')).toContainText('Second campaign');expect(errors).toEqual([]);
});

test('discarding an unsaved date requires confirmation',async({page})=>{
 const {errors,writes}=await fixture(page,true);await page.goto('/bk-admin-codex');await page.getByRole('button',{name:'New campaign',exact:true}).click();await page.getByRole('button',{name:'Add a date',exact:true}).click();const dateDialog=page.getByRole('dialog',{name:'Add massage date',exact:true});await expect(dateDialog.getByRole('button',{name:'Start',exact:true})).toContainText('10:00');await expect(dateDialog.getByRole('button',{name:'End',exact:true})).toContainText('15:00');await dateDialog.getByLabel('Date',{exact:true}).click();await page.getByRole('button',{name:'Go to the next month',exact:true}).click();await page.getByRole('grid').getByRole('gridcell',{name:'15',exact:true}).click();await dateDialog.getByRole('button',{name:'Save',exact:true}).click();await page.getByRole('button',{name:'Discard',exact:true}).click();const confirmation=page.getByRole('alertdialog',{name:'Discard date changes?',exact:true});await expect(confirmation).toBeVisible();await confirmation.getByRole('button',{name:'Keep date',exact:true}).click();await expect(page.getByText('New · unsaved',{exact:true})).toBeVisible();await page.getByRole('button',{name:'Discard',exact:true}).click();await confirmation.getByRole('button',{name:'Discard changes',exact:true}).click();await expect(confirmation).toHaveCount(0);await expect(page.getByText('New · unsaved',{exact:true})).toHaveCount(0);await expect(page.getByRole('heading',{name:'No dates added',exact:true})).toBeVisible();expect(writes).toHaveLength(0);expect(errors).toEqual([]);
});


test('custom admin route works and old admin route does not open administration',async({page})=>{
 await fixture(page);await page.goto('/admin');await expect(page.getByRole('heading',{name:'Administrator sign-in',exact:true})).toHaveCount(0);await expect(page.getByRole('heading',{name:'Book your massage',exact:true})).toBeVisible();await page.goto('/bk-admin-codex-extra');await expect(page.getByRole('heading',{name:'Administrator sign-in',exact:true})).toHaveCount(0);await page.goto('/bk-admin-codex');await expect(page.getByRole('heading',{name:'Administrator sign-in',exact:true})).toBeVisible();
});

test('website and browser tab use the served SVG on employee and admin routes',async({page})=>{
 await fixture(page,true);
 for(const path of ['/','/bk-admin-codex']){
  await page.goto(path);const favicon=page.locator('link[rel="icon"][sizes="32x32"]');await expect(favicon).toHaveAttribute('href','brand/favicon-32x32.png?v=2');await expect(favicon).toHaveAttribute('type','image/png');for(const asset of ['/favicon.ico?v=2','/brand/favicon-32x32.png?v=2','/brand/favicon-16x16.png?v=2']){const iconResponse=await page.request.get(asset);expect(iconResponse.status()).toBe(200);expect(iconResponse.headers()['content-type']).not.toContain('text/html');}const response=await page.request.get('/brand/pause-icon.svg');expect(response.status()).toBe(200);expect(response.headers()['content-type']).toContain('image/svg+xml');expect(await response.text()).toContain('viewBox="0 0 64 64"');const logo=page.locator('img[src="brand/pause-icon.svg"]:visible').first();await expect(logo).toBeVisible();expect(await logo.evaluate((img:HTMLImageElement)=>img.complete&&img.naturalWidth>0)).toBe(true);
 }
});
