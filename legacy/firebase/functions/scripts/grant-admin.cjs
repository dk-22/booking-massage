const {initializeApp,applicationDefault}=require('firebase-admin/app');
const {getAuth}=require('firebase-admin/auth');
const {getFirestore,FieldValue}=require('firebase-admin/firestore');
const uid=process.argv[2], projectId=process.argv[3];
if(!uid||!projectId){console.error('Usage: node scripts/grant-admin.cjs USER_UID PROJECT_ID');process.exit(1);}
initializeApp({credential:applicationDefault(),projectId});
(async()=>{const auth=getAuth(),user=await auth.getUser(uid);if(!user.email)throw new Error('Account has no email address.');await getFirestore().collection('adminEmails').doc(user.email.trim().toLowerCase()).set({enabled:true,updatedAt:FieldValue.serverTimestamp()});await auth.setCustomUserClaims(uid,{...user.customClaims,admin:true});console.log('Admin access granted. Sign out and sign in again.');})().catch(e=>{console.error(e.message);process.exitCode=1;});
