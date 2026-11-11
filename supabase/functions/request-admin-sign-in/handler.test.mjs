import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
const source=await readFile(new URL('./handler.ts',import.meta.url),'utf8');
const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {requestAdminSignIn,adminSignInRedirect}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
test('only enabled administrators reach the email sender',async()=>{
 const sent=[];const deps={eligible:async email=>email==='admin@example.test',send:async email=>sent.push(email)};
 await requestAdminSignIn(' ADMIN@example.test ',deps);await requestAdminSignIn('unknown@example.test',deps);await requestAdminSignIn('inactive@example.test',deps);await requestAdminSignIn('not an email',deps);
 assert.deepEqual(sent,['admin@example.test']);
});
test('eligibility failures fail closed',async()=>{
 let sent=false;await assert.rejects(requestAdminSignIn('admin@example.test',{eligible:async()=>{throw Error('DB unavailable');},send:async()=>{sent=true;}}));assert.equal(sent,false);
});

test('sign-in redirects stay on the allowed origin and approved app path',()=>{
 const origin='https://dk-22.github.io';
 const pages=origin+'/booking-massage/bk-admin-codex/login';
 assert.equal(adminSignInRedirect(origin,pages,[pages]),pages);
 assert.equal(adminSignInRedirect(origin,pages,[]),null);
 assert.equal(adminSignInRedirect(origin,'https://other.example/login',['https://other.example/login']),null);
 assert.equal(adminSignInRedirect(origin,'not a URL',['not a URL']),null);
 assert.equal(adminSignInRedirect('http://localhost:4200',undefined,[]),'http://localhost:4200/bk-admin-codex/login');
});
