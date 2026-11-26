import test from 'node:test';
import assert from 'node:assert/strict';
import { createDriveAssetLoader } from '../drive-assets.mjs';

function setup() {
  let version='v1', media=0, account='a', deniedStatus=0; const revoked=[]; const rows=new Map(); const statuses=[];
  const cache={async get(key){return rows.get(key)},async put(value){rows.set(value.key,value)}};
  const fetchImpl=async (url) => { if(deniedStatus) return deniedStatus===403?Response.json({error:{message:'Insufficient file permissions.',errors:[{reason:'insufficientFilePermissions'}]}},{status:403}):new Response('',{status:deniedStatus}); if(url.includes('alt=media')) {media++;return new Response(new Blob(['image'],{type:'image/png'}));} return Response.json({id:'file',mimeType:'image/png',md5Checksum:version}); };
  const loader=createDriveAssetLoader({getAccessToken:async()=>({token:'token',accountId:account,email:'owner@example.com'}),cache,fetchImpl,makeURL:()=>`blob:${Math.random()}`,revokeURL:url=>revoked.push(url)});
  return {loader,statuses,revoked,setVersion:v=>version=v,setAccount:v=>account=v,deny:status=>deniedStatus=status,media:()=>media};
}
test('reuses cached bytes and invalidates changed assets independently by book and account', async()=>{
  const x=setup(), load=(bookId)=>x.loader.load({bookId,fileId:'file',onStatus:s=>x.statuses.push(s)});
  await load('one'); await load('one'); assert.equal(x.media(),1);
  await load('two'); assert.equal(x.media(),2);
  x.setAccount('b'); await load('one'); assert.equal(x.media(),3);
  x.setVersion('v2'); await load('one'); assert.equal(x.media(),4);
  assert.ok(x.statuses.includes('ready')); x.loader.dispose(); assert.equal(x.revoked.length,5);
});
test('expired authorization is reported without exposing cached asset', async()=>{
  const x=setup(); await x.loader.load({bookId:'one',fileId:'file'}); x.deny(401);
  await assert.rejects(x.loader.load({bookId:'one',fileId:'file',onStatus:s=>x.statuses.push(s)}),{code:'AUTH_REQUIRED',status:401});
  assert.equal(x.statuses.at(-1),'authorization-required');
});
test('403 is distinguished from an expired token so the reader can ask for an account with file access', async()=>{
  const x=setup(); x.deny(403);
  await assert.rejects(x.loader.load({bookId:'one',fileId:'file'}),error=>error.code==='AUTH_REQUIRED'&&error.status===403&&error.accountEmail==='owner@example.com'&&error.driveReason==='insufficientFilePermissions'&&/denied access for owner@example.com/.test(error.message));
});
