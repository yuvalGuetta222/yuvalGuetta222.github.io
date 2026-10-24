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
test("Tevuna AI opens from dashboard, reports disabled key and does not invent an answer",async()=>{
 const e=environment(),calls=[];
 const runtime={
  getContext:()=>({user:{id:"user"},household:"00000000-0000-4000-8000-000000000001"}),
  supabase:{functions:{invoke:async(name,opts)=>{
   calls.push({name,opts});
   if(opts.body.type==="status")return {data:{ready:false,allow_temporary_key:true},error:null};
   return {data:null,error:{context:{json:async()=>({code:"MISSING_API_KEY",error:"חסר מפתח API"})}}};
  }}}
 };
 try{
  setupAICoach(runtime);
  await e.nodes.get("ai-dashboard-open").click();
  assert.equal(calls[0].opts.body.type,"status");
  assert.equal(calls[1].opts.body.type,"summary");
  assert.equal(calls[1].name,"tevuna-ai-coach");
  assert.equal(calls[1].opts.body.household,"00000000-0000-4000-8000-000000000001");
  assert.match(e.nodes.get("ai-connection-status").textContent,/לא הוגדר מפתח/);
  assert.match(e.nodes.get("ai-feedback").textContent,/מפתח/);
  assert.equal(calls[1].opts.headers,undefined);
 }finally{e.restore()}
});
test("OpenAI key is temporary: input clears and only sends it with direct user actions",async()=>{
 const e=environment(),calls=[];
 const runtime={
  getContext:()=>({user:{id:"user"},household:"00000000-0000-4000-8000-000000000001"}),
  supabase:{functions:{invoke:async(name,opts)=>{
   calls.push(opts);
   return {data:opts.body.type==="status"?{ready:false}:{answer:"זהו ניתוח מבוסס נתונים.",uncertain:false},error:null};
  }}}
 };
 try{
  setupAICoach(runtime);
  const key="sk-proj-"+ "A".repeat(32);
  e.nodes.get("ai-key-input").value=key;
  e.nodes.get("ai-use-key").click();
  assert.equal(e.nodes.get("ai-key-input").value,"");
  await e.nodes.get("ai-dashboard-open").click();
  assert.equal(calls[1].headers["x-tevuna-ai-key"],key);
  assert.equal(calls[1].body.type,"summary");
  assert.ok(e.nodes.get("ai-conversation").children.length>=2);
  e.nodes.get("ai-clear-key").click();
  await e.tasks[1].click();
  assert.equal(calls.at(-1).headers,undefined);
 }finally{e.restore()}
});
test("No provider key or raw transaction upload appears in public HTML and frontend scripts",()=>{
 const html=readFileSync(new URL("./index.html",import.meta.url),"utf8");
 const src=readFileSync(new URL("./ai-coach.js",import.meta.url),"utf8");
 assert.match(html,/id="ai-conversation"/);
 assert.match(html,/data-screen="ai"/);
 assert.match(html,/id="ai-history-open"/);
 assert.doesNotMatch(src,/localStorage|sessionStorage|service_role|INSERT INTO/);
 assert.doesNotMatch(src,/from\("tevuna_transactions"\)/);
});
