import test from 'node:test';
import assert from 'node:assert/strict';
import { createDriveAssetLoader } from '../drive-assets.mjs';

function setup() {
  let version='v1', media=0, account='a', authorized=true; const revoked=[]; const rows=new Map(); const statuses=[];
  const cache={async get(key){return rows.get(key)},async put(value){rows.set(value.key,value)}};
  const fetchImpl=async (url) => { if(!authorized) return new Response('',{status:401}); if(url.includes('alt=media')) {media++;return new Response(new Blob(['image'],{type:'image/png'}));} return Response.json({id:'file',mimeType:'image/png',md5Checksum:version}); };
  const loader=createDriveAssetLoader({getAccessToken:async()=>({token:'token',accountId:account}),cache,fetchImpl,makeURL:()=>`blob:${Math.random()}`,revokeURL:url=>revoked.push(url)});
  return {loader,statuses,revoked,setVersion:v=>version=v,setAccount:v=>account=v,deny:()=>authorized=false,media:()=>media};
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
  const x=setup(); await x.loader.load({bookId:'one',fileId:'file'}); x.deny();
  await assert.rejects(x.loader.load({bookId:'one',fileId:'file',onStatus:s=>x.statuses.push(s)}),{code:'AUTH_REQUIRED'});
  assert.equal(x.statuses.at(-1),'authorization-required');
});
