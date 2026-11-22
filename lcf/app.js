"use strict";
// Phase 1 local demo only. No network calls, no BCS transfer, no TikTok upload.
const KEY = "acf.phase1.review.v1";
const STATES = ["DRAFT","READY_FOR_REVIEW","APPROVED","PUBLISHED","ARCHIVED_TO_BCS"];
const sample = {id:"DEMO-001",title:"Contoh konten Dharma",status:"DRAFT",publishedAt:null};
function read(){try{const v=JSON.parse(localStorage.getItem(KEY));return v&&v.id===sample.id&&STATES.includes(v.status)?v:{...sample};}catch{return {...sample};}}
let item=read();
const $ = id => document.getElementById(id);
function save(){localStorage.setItem(KEY,JSON.stringify(item));render();}
function render(){
  $("content-title").textContent=item.title;
  $("status").textContent=item.status;
  $("publication-time").textContent=item.publishedAt||"Belum dikonfirmasi";
  $("review").disabled=item.status!=="DRAFT";
  $("approve").disabled=item.status!=="READY_FOR_REVIEW";
  $("publish").disabled=item.status!=="APPROVED";
  $("send").disabled=true; // No BCS API configured; never claim a transfer.
  $("notice").textContent=item.status==="PUBLISHED"?"Publikasi dicatat pada browser ini. Transfer ke BCS belum tersedia.":"Mode demo lokal: tidak ada video sungguhan atau koneksi BCS.";
}
$("review").addEventListener("click",()=>{if(item.status==="DRAFT"){item.status="READY_FOR_REVIEW";save();}});
$("approve").addEventListener("click",()=>{if(item.status==="READY_FOR_REVIEW"){item.status="APPROVED";save();}});
$("publish").addEventListener("click",()=>{
  if(item.status!=="APPROVED")return;
  if(!window.confirm("Konfirmasi bahwa video SUDAH berhasil diunggah ke TikTok secara manual?"))return;
  item.status="PUBLISHED";item.publishedAt=new Date().toISOString();save();
});
$("reset").addEventListener("click",()=>{if(window.confirm("Reset data demo lokal?")){item={...sample};save();}});
render();
