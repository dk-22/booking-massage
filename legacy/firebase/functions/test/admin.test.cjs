const test=require('node:test');
const assert=require('node:assert/strict');
const {manageCampaign}=require('../lib/index.js');
for(const auth of [undefined,{uid:'employee',token:{}},{uid:'employee',token:{admin:false}}]){
 test(`reject admin mutation for ${auth?.uid || 'anonymous'} (${auth?.token.admin})`,async()=>{
  await assert.rejects(manageCampaign.run({auth,data:{action:'create',name:'Unauthorized'}}),e=>e.code==='permission-denied');
 });
}

test('email authorization requires an authenticated user',async()=>{
 const {authorizeAdmin}=require('../lib/index.js');
 await assert.rejects(authorizeAdmin.run({data:{email:'admin@example.com'}}),e=>e.code==='unauthenticated');
});
