import {createClient} from 'npm:@supabase/supabase-js@2';
import {requestAdminSignIn,signInMessage,adminSignInRedirect} from './handler.ts';
Deno.serve(async request=>{
 const origin=request.headers.get('origin')||'';
 const allowed=(Deno.env.get('ADMIN_SIGN_IN_ORIGINS')||'').split(',').map(x=>x.trim()).filter(Boolean);
 const cors={'Access-Control-Allow-Origin':allowed.includes(origin)?origin:'null','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS','Vary':'Origin'};
 const response=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,'Content-Type':'application/json','Cache-Control':'no-store'}});
 if(!allowed.includes(origin))return response({error:'Origin not allowed.'},403);
 if(request.method==='OPTIONS')return new Response(null,{status:204,headers:cors});
 if(request.method!=='POST')return response({error:'Method not allowed.'},405);
 const started=Date.now();
 try{
  const body=await request.json();
  if(typeof body.email!=='string')return response({error:'Enter an email address.'},400);
  const redirects=(Deno.env.get('ADMIN_SIGN_IN_REDIRECT_URLS')||'').split(',').map(value=>value.trim()).filter(Boolean);
  const redirectTo=adminSignInRedirect(origin,body.redirectTo,redirects);
  if(!redirectTo)return response({error:'Redirect URL not allowed.'},400);
  const client=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}});
  await requestAdminSignIn(body.email,{
   eligible:async email=>{const {data,error}=await client.rpc('allow_admin_sign_in_request',{p_email:email});if(error)throw error;return data===true;},
   send:async email=>{const {error}=await client.auth.signInWithOtp({email,options:{emailRedirectTo:redirectTo}});if(error)throw error;}
  });
 }catch{
  // Do not disclose eligibility or email-provider errors to unauthenticated callers.
  console.error('Admin sign-in request failed. Check function and Auth logs.');
 }
 // Keep responses and minimum latency consistent for unknown, disabled and active admins.
 await new Promise(resolve=>setTimeout(resolve,Math.max(0,800-Date.now())));
 return response({message:signInMessage});
});
