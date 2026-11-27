import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildProloguePages } from '../prologue-document.mjs';

const manifest=JSON.parse(readFileSync(new URL('../voices-of-dawn-manifest.json',import.meta.url),'utf8'));

test('prologue manifest points at the approved Drive source',()=>{
  assert.equal(manifest.assets.folderId,'1NTlN8NlgSYRaW0ufNZHNWxMf5e7Rz5Mz');
  assert.equal(manifest.prologue.source.document_id,'1jD-QfDLh-T3WHTRp6OdjoUvuFSn9XaJAlI3hYKBsfmg');
  assert.equal(manifest.prologue.source.document_version,'FINAL APPROVED v1.0');
  assert.equal(manifest.prologue.status,'FINAL APPROVED v1.0');
  assert.equal(manifest.chapters[0].source.document_id,'1hP9XQD7EHqeSMg5IzAt0l7hXMTDvGrTB1NKr1v6EcBw');
  assert.equal(manifest.chapters[0].source.document_version,'FINAL APPROVED v1.1');
  assert.equal(manifest.prologue.title['zh-Hant'],'灰燼中的哭聲');
});

test('Drive paragraphs become six illustrated pages without changing source text',()=>{
  const paragraphs=[{text:'PROLOGUE · PROLOG',images:[]},{text:'灰燼中的哭聲',images:[]}];
  for(let i=1;i<=6;i++) {
    paragraphs.push({text:'',images:[{src:`https://drive.google.test/illustration-${i}`,alt:`Scene ${i}`}]});
    paragraphs.push({text:i===1?'Pada malam itu, anjing-anjing berhenti menggonggong.':`Paragraph ${i}`,images:[],speaker:''});
  }
  paragraphs.push({text:'破曉之聲',images:[]},{text:'VOICE OF DAWN',images:[]});
  const pages=buildProloguePages(paragraphs);
  assert.equal(pages.length,6);
  assert.deepEqual(pages.map(page=>page.id),Array.from({length:6},(_,i)=>`prologue-page-${String(i+1).padStart(2,'0')}`));
  assert.ok(pages.every(page=>page.images.length===1));
  assert.equal(pages[0].blocks[0].text,'Pada malam itu, anjing-anjing berhenti menggonggong.');
  assert.equal(pages[5].blocks[0].text,'Paragraph 6');
});

test('Drive speaker labels remain distinct metadata and are displayed as speaker cues',()=>{
  const pages=buildProloguePages([
    {text:'cover title',images:[]},
    {text:'',images:[{src:'https://drive.google.test/page-1'}]},
    {text:'(Ibu)',speaker:'Ibu',images:[]},
    {text:'“Pejamkan matamu. Jangan takut.”',images:[]}
  ]);
  assert.equal(pages[0].blocks[0].speaker,'Ibu');
  assert.equal(pages[0].blocks[1].text,'“Pejamkan matamu. Jangan takut.”');
});
