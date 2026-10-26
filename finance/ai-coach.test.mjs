import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {setupAICoach} from "./ai-coach.js";

class Element{
 constructor(){this.handlers={};this.textContent="";this.value="";this.children=[];this.dataset={};this.hidden=false;this.disabled=false;}
 addEventListener(type,fn){this.handlers[type]=fn}
 replaceChildren(...c){this.children=[...c]}
 append(...c){this.children.push(...c)}
 querySelector(){return null}
 click(){return this.handlers.click?.()}
}
function environment(){
 const nodes=new Map(),listeners=new Map(),tasks=[new Element(),new Element()];
 tasks[0].dataset.aiTask="summary";tasks[1].dataset.aiTask="saving";
 const original=globalThis.document;
 const doc={
  getElementById(id){if(!nodes.has(id))nodes.set(id,new Element());return nodes.get(id)},
  createElement(){return new Element()},
  querySelectorAll(query){return query==="[data-ai-task]"?tasks:[]},
  querySelector(query){return query.includes("button[data-screen")?{click(){listeners.get("tevuna:screen-changed")?.({detail:{screen:"ai"}})}}:null},
  addEventListener(type,fn){listeners.set(type,fn)}
 };
 globalThis.document=doc;
 return {nodes,tasks,listeners,restore(){globalThis.document=original}};
}
test("Without Cloudflare configuration, AI requests are blocked before displaying an assistant answer",async()=>{
 const e=environment(),calls=[];
 const runtime={
  getContext:()=>({user:{id:"user"},household:"00000000-0000-4000-8000-000000000001"}),
  supabase:{functions:{invoke:async(name,opts)=>{
   calls.push({name,opts});
   if(opts.body.type==="status")return {data:{ready:false,provider:"Cloudflare Workers AI"},error:null};
   return {data:null,error:{context:{json:async()=>({code:"MISSING_API_KEY",error:"יש לחבר חשבון Cloudflare"})}}};
  }}}
 };
 try{
  setupAICoach(runtime);
  globalThis.document.getElementById("month").value="2026-10";
  globalThis.document.getElementById("date-basis").value="statement";
  await e.nodes.get("ai-dashboard-open").click();
  assert.ok(calls.length>=1);
  assert.ok(calls.every(c=>c.opts.body.type==="status"));
  assert.match(e.nodes.get("ai-connection-status").textContent,/Cloudflare Workers AI/);
  assert.match(e.nodes.get("ai-feedback").textContent,/Cloudflare/);
  assert.equal(e.nodes.get("ai-conversation")?.children.length??0,0);
  assert.ok(calls.every(c=>c.opts.headers===undefined));
 }finally{e.restore()}
});
test("Cloudflare AI sends only the selected month context and receives a model response without any client-side credentials",async()=>{
 const e=environment(),calls=[];
 const runtime={
  getContext:()=>({user:{id:"user"},household:"00000000-0000-4000-8000-000000000001"}),
  supabase:{functions:{invoke:async(name,opts)=>{
   calls.push(opts);
   return {data:opts.body.type==="status"?{ready:true,provider:"Cloudflare Workers AI"}:
     {answer:"זו תשובת AI מאובטחת.",provider:"Cloudflare Workers AI",uncertain:false},error:null};
  }}}
 };
 try{
  setupAICoach(runtime);
  globalThis.document.getElementById("month").value="2026-10";
  globalThis.document.getElementById("date-basis").value="statement";
  await e.nodes.get("ai-dashboard-open").click();
  const summaries=calls.filter(c=>c.body.type==="summary");
  assert.equal(summaries.length,1);
  assert.equal(summaries[0].body.month,"2026-10");
  assert.equal(summaries[0].body.basis,"statement");
  assert.equal(summaries[0].headers,undefined);
  assert.ok(e.nodes.get("ai-conversation").children.length>=2);
  assert.match(e.nodes.get("ai-connection-status").textContent,/Cloudflare/);
  assert.equal(e.nodes.get("ai-key-setup").hidden,true);
  await e.tasks[1].click();
  assert.equal(calls.at(-1).body.type,"saving");
  assert.equal(calls.at(-1).headers,undefined);
 }finally{e.restore()}
});
test("No provider key or raw transaction upload appears in public HTML and frontend scripts",()=>{
 const html=readFileSync(new URL("./index.html",import.meta.url),"utf8");
 const src=readFileSync(new URL("./ai-coach.js",import.meta.url),"utf8");
 assert.match(html,/id="ai-conversation"/);
 assert.match(html,/data-screen="ai"/);
 assert.match(html,/id="ai-history-open"/);
 assert.match(html,/Cloudflare Workers AI/);
 assert.doesNotMatch(html,/OpenAI API key|id="ai-key-input"/);
 assert.doesNotMatch(src,/localStorage|sessionStorage|service_role|INSERT INTO/);
 assert.doesNotMatch(src,/from\("tevuna_transactions"\)/);
});

test("Manual provider probe checks actual model response without sending financial data",async()=>{
 const e=environment(),calls=[];
 const household="00000000-0000-4000-8000-000000000001";
 const runtime={
  getContext:()=>({user:{id:"user"},household}),
  supabase:{functions:{invoke:async(name,opts)=>{
   calls.push({name,...opts});
   return {data:opts.body.type==="probe"?{ready:true,model_verified:true,code:"CLOUDFLARE_MODEL_VERIFIED"}:
    {ready:true,configured:true},error:null};
  }}}
 };
 try{
  setupAICoach(runtime);
  await e.nodes.get("ai-test-connection").click();
  assert.equal(calls.length,1);
  assert.deepEqual(calls[0].body,{type:"probe",household});
  assert.match(e.nodes.get("ai-feedback").textContent,/לא נשלחו נתונים פיננסיים/);
  assert.match(e.nodes.get("ai-connection-status").textContent,/המודל חובר/);
  assert.equal(e.nodes.get("ai-key-setup").hidden,true);
 }finally{e.restore()}
});
