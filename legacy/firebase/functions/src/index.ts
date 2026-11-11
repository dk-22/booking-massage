import {getAuth} from 'firebase-admin/auth';
import {initializeApp} from 'firebase-admin/app';
import {getFirestore, FieldValue} from 'firebase-admin/firestore';
import {onCall, HttpsError} from 'firebase-functions/v2/https';
import {createHash} from 'node:crypto';
initializeApp();
const db = getFirestore();
const hash = (s:string) => createHash('sha256').update(s).digest('hex');
function text(v:unknown, max=120):string { if(typeof v!=='string'||!v.trim()||v.length>max) throw new HttpsError('invalid-argument','Please complete all fields.'); return v.trim(); }
async function approvedAdmin(uid:string|undefined):Promise<string> {
 if(!uid)throw new HttpsError('unauthenticated','Please sign in first.');
 const user=await getAuth().getUser(uid);
 if(!user.emailVerified||!user.email)throw new HttpsError('permission-denied','Please verify your email address first.');
 const email=user.email.trim().toLowerCase();
 const entry=await db.collection('adminEmails').doc(email).get();
 if(entry.get('enabled')!==true)throw new HttpsError('permission-denied','This email address is not authorized for the admin portal. Contact your administrator.');
 return email;
}
export const authorizeAdmin = onCall(async request=>{
 await approvedAdmin(request.auth?.uid);
 const user=await getAuth().getUser(request.auth!.uid);
 await getAuth().setCustomUserClaims(user.uid,{...user.customClaims,admin:true});
 return {authorized:true};
});
export const createBooking = onCall({enforceAppCheck:false}, async request => {
 const d=request.data; const campaignId=text(d.campaignId), slotId=text(d.slotId);
 const employeeCode=text(d.employeeCode).normalize('NFKC').toUpperCase(), employeeName=text(d.employeeName), sbu=text(d.sbu);
 const token=text(d.requestId); if(!/^[a-zA-Z0-9-]{20,100}$/.test(token)) throw new HttpsError('invalid-argument','Invalid request reference.');
 const bookingRef=db.collection('bookings').doc(hash(token));
 const claimRef=db.collection('bookingClaims').doc(hash(JSON.stringify([campaignId,employeeCode])));
 const fingerprint=hash(JSON.stringify([campaignId,slotId,employeeCode,employeeName,sbu]));
 return db.runTransaction(async tx=>{
  const [existing,campaign,slot,claim,settings]=await tx.getAll(bookingRef,db.collection('campaigns').doc(campaignId),db.collection('slots').doc(slotId),claimRef,db.doc('settings/booking'));
  if(existing.exists){if(existing.get('fingerprint')!==fingerprint) throw new HttpsError('already-exists','Request reference already used.'); return {bookingId:bookingRef.id};}
  if(campaign.get('status')!=='published') throw new HttpsError('failed-precondition','This campaign is no longer accepting bookings.');
  const s=slot.data(); if(!s||s.campaignId!==campaignId||s.status!=='active'||s.startTime.toMillis()<=Date.now()) throw new HttpsError('failed-precondition','This time slot is no longer available.');
  const session=await tx.get(db.collection('sessions').doc(s.sessionId));
  if(session.get('status')!=='active'||session.get('campaignId')!==campaignId) throw new HttpsError('failed-precondition','Session unavailable.');
  if(claim.exists) throw new HttpsError('already-exists','You already have a booking for this campaign.');
  if(s.bookedCount>=s.capacity) throw new HttpsError('resource-exhausted','This time slot has just been fully booked.');
  if(!settings.get('sbus')?.includes(sbu)) throw new HttpsError('invalid-argument','Please select a valid SBU.');
  const summaryRef=db.collection('publicSlots').doc(slotId); const summary=await tx.get(summaryRef);
  const now=FieldValue.serverTimestamp();
  tx.create(bookingRef,{campaignId,slotId,sessionId:s.sessionId,employeeCode,employeeName,sbu,fingerprint,status:'confirmed',createdAt:now,updatedAt:now});
  tx.create(claimRef,{campaignId,employeeCode,bookingId:bookingRef.id,createdAt:now});
  tx.update(slot.ref,{bookedCount:s.bookedCount+1});
  tx.set(summaryRef,{campaignId,sessionId:s.sessionId,startTime:s.startTime,endTime:s.endTime,capacity:s.capacity,bookedCount:s.bookedCount+1,names:[...(summary.get('names')||[]),employeeName],status:'active'});
  return {bookingId:bookingRef.id};
 });
});

export const manageCampaign = onCall(async request => {
 if(request.auth?.token.admin!==true) throw new HttpsError('permission-denied','Administrator access required.');
 await approvedAdmin(request.auth.uid);
 const d=request.data, action=text(d.action); const now=FieldValue.serverTimestamp();
 if(action==='create') {
  const ref=db.collection('campaigns').doc(); const name=text(d.name), description=typeof d.description==='string'?d.description.trim().slice(0,2000):'';
  const batch=db.batch();batch.create(ref,{name,description,status:'draft',createdAt:now,updatedAt:now});batch.create(db.collection('auditLogs').doc(),{action:'campaign.create',adminId:request.auth.uid,campaignId:ref.id,timestamp:now});await batch.commit();return {id:ref.id};
 }
 const id=text(d.campaignId); if(id.includes('/')) throw new HttpsError('invalid-argument','Invalid campaign.');
 const ref=db.collection('campaigns').doc(id);
 if(action==='status') {
  if(!['draft','published','closed'].includes(d.status)) throw new HttpsError('invalid-argument','Invalid status.');
  await db.runTransaction(async tx=>{const c=await tx.get(ref);if(!c.exists)throw new HttpsError('not-found','Campaign not found.');tx.update(ref,{status:d.status,updatedAt:now});tx.create(db.collection('auditLogs').doc(),{action:'campaign.status',adminId:request.auth!.uid,campaignId:id,previousStatus:c.get('status'),newStatus:d.status,timestamp:now});});return {id};
 }
 if(action==='session') {
  const date=text(d.date),start=text(d.start),end=text(d.end);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(start)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(end))throw new HttpsError('invalid-argument','Invalid date or time.');
  const duration=Number(d.duration),pause=Number(d.breakDuration),capacity=Number(d.capacity);
  if(!Number.isInteger(duration)||duration<5||duration>180||!Number.isInteger(pause)||pause<0||pause>120||!Number.isInteger(capacity)||capacity<1||capacity>100)throw new HttpsError('invalid-argument','Invalid duration, break or capacity.');
  const from=Date.parse(`${date}T${start}:00+04:00`),to=Date.parse(`${date}T${end}:00+04:00`);
  if(!Number.isFinite(from)||!Number.isFinite(to)||from<=Date.now()||to-from<duration*60000||to-from>86400000)throw new HttpsError('invalid-argument','Choose a future session with room for at least one massage.');
  if(Math.floor((to-from+pause*60000)/((duration+pause)*60000))>240)throw new HttpsError('invalid-argument','Limit each session to 240 slots.');
  if(new Date(from+4*3600000).toISOString().slice(0,10)!==date)throw new HttpsError('invalid-argument','Invalid calendar date.');
  const session=db.collection('sessions').doc();
  await db.runTransaction(async tx=>{const c=await tx.get(ref);if(!c.exists||c.get('status')==='closed')throw new HttpsError('failed-precondition','Campaign unavailable.');
   tx.create(session,{campaignId:id,date,startTime:start,endTime:end,massageDuration:duration,breakDuration:pause,defaultSlotCapacity:capacity,status:'active',createdAt:now});
   for(let t=from;t+duration*60000<=to;t+=(duration+pause)*60000){const slot=db.collection('slots').doc();const data={campaignId:id,sessionId:session.id,startTime:new Date(t),endTime:new Date(t+duration*60000),capacity,bookedCount:0,status:'active'};tx.create(slot,data);tx.create(db.collection('publicSlots').doc(slot.id),{...data,names:[]});}
   tx.update(ref,{updatedAt:now});tx.create(db.collection('auditLogs').doc(),{action:'session.create',adminId:request.auth!.uid,campaignId:id,sessionId:session.id,timestamp:now});
  }); return {id:session.id};
 }
 if(action==='sbus'){const sbus=[...new Set(text(d.sbus,2000).split(',').map((s:string)=>s.trim()).filter(Boolean))];const batch=db.batch();batch.set(db.doc('settings/booking'),{sbus});batch.create(db.collection('auditLogs').doc(),{action:'settings.sbus',adminId:request.auth.uid,sbus,timestamp:now});await batch.commit();return {ok:true};}
 throw new HttpsError('invalid-argument','Unknown action.');
});
