import test from "node:test";
import assert from "node:assert/strict";
import {setupHistory} from "./history.js";

class MockElement {
 constructor(tag="div"){
  this.tagName=tag;this.textContent="";this.value="";this.children=[];this.style={};
  this.title="";this.className="";this.handlers=new Map();this.attributes={};
  this.classList={contains:(name)=>name==="hidden"?false:this.className.split(" ").includes(name)};
 }
 append(...items){this.children.push(...items);}
 replaceChildren(...items){this.children=[...items];}
 addEventListener(type,callback){this.handlers.set(type,callback);}
 setAttribute(name,value){this.attributes[name]=value;}
}
function makeFakeDocument(){
 const elements=new Map(),listeners=new Map();
 return {
  getElementById(id){if(!elements.has(id))elements.set(id,new MockElement());return elements.get(id);},
  createElement(tag){return new MockElement(tag);},
  addEventListener(name,fn){if(!listeners.has(name))listeners.set(name,[]);listeners.get(name).push(fn);},
  emit(name,detail){for(const fn of listeners.get(name)||[])fn({detail});}
 };
}
function supabaseMock(data){
 return {
  from(table){
   const state={filter:[],start:0,end:1000};
   const builder={
    select(){return builder;},
    eq(key,value){state.filter.push(row=>row[key]===value);return builder;},
    gte(key,value){state.filter.push(row=>row[key]>=value);return builder;},
    lt(key,value){state.filter.push(row=>row[key]<value);return builder;},
    order(){return builder;},
    range(start,end){state.start=start;state.end=end+1;return builder;},
    then(resolve,reject){
     const records=(data[table]||[]).filter(row=>state.filter.every(fn=>fn(row))).slice(state.start,state.end);
     return Promise.resolve({data:records,error:null}).then(resolve,reject);
    }
   };
   return builder;
  }
 };
}
const household="test-household";
const row=(extra={})=>({household_id:household,...extra});

test("History page loads and renders all widgets when historical fixed start month is unknown",async()=>{
 const original=globalThis.document;
 const fake=makeFakeDocument();
 globalThis.document=fake;
 try{
  fake.getElementById("month").value="2026-10";
  fake.getElementById("history-months").value="6";
  fake.getElementById("date-basis").value="transaction";
  const supabase=supabaseMock({
   tevuna_transactions:[
    row({id:"a",occurred_on:"2026-09-15",merchant:"Store",category:"מזון",amount_agorot:10000,entry_kind:"expense",source:"xlsx"}),
    row({id:"b",occurred_on:"2026-10-15",merchant:"Store",category:"מזון",amount_agorot:20000,entry_kind:"expense",source:"xlsx"})
   ],
   tevuna_incomes:[
    row({id:"c",income_month:"2026-09-01",amount_agorot:500000,received:true}),
    row({id:"d",income_month:"2026-10-01",amount_agorot:500000,received:true})
   ],
   tevuna_fixed_expenses:[row({id:"rent",label:"Rent",active:true,start_month:null,end_month:null,
    amount_agorot:150000,cadence:"monthly"})],
   tevuna_fixed_expense_card_coverage:[]
  });
  setupHistory({supabase,getContext:()=>({household})});
  fake.emit("tevuna:screen-changed",{screen:"history"});
  for(let i=0;i<8;i++)await new Promise(resolve=>setImmediate(resolve));
  const error=fake.getElementById("history-error").textContent;
  assert.equal(error,"","History loader should not throw: "+error);
  assert.equal(fake.getElementById("history-cards").children.length,4);
  assert.equal(fake.getElementById("history-chart").children.length,6);
  const coverage=fake.getElementById("history-coverage").textContent;
  assert.match(coverage,/חסר תאריך תחילה/);
 }finally{globalThis.document=original;}
});
