import test from "node:test";
import assert from "node:assert/strict";
import {setupBulkImporter} from "./bulk-import.js";

class MockEl {
 constructor(tag="div"){
  this.tag=tag;this.children=[];this.style={};this.attributes={};this.handlers=new Map();
  this.value="";this.textContent="";this.className="";this.disabled=false;this.open=false;
 }
 append(...children){this.children.push(...children)}
 replaceChildren(...children){this.children=[...children]}
 setAttribute(name,value){this.attributes[name]=value}
 addEventListener(type,listener){this.handlers.set(type,listener)}
 get lastChild(){return this.children.at(-1)}
 querySelector(selector){
  const attr=selector.match(/^\[([a-z-]+)\]$/)?.[1];
  for(const child of this.children){
   if(attr&&attr in child.attributes)return child;
   const nested=child.querySelector?.(selector);if(nested)return nested;
  }
  return null;
 }
}
function mockDocument(){
 const els=new Map(),handlers=new Map();
 return {
  createElement:tag=>new MockEl(tag),
  getElementById:id=>{if(!els.has(id))els.set(id,new MockEl());return els.get(id)},
  addEventListener:(name,listener)=>handlers.set(name,listener),
  els,handlers
 };
}
function asCsv(name,reportMonth,card){
 const prefix=reportMonth==="2026-10"?"2026-09-30":"2026-08-28";
 const content=[
  "דוח "+reportMonth,
  "תאריך עסקה,שם בית העסק,קטגוריה,4 ספרות אחרונות של כרטיס האשראי,סוג עסקה,סכום חיוב,תאריך חיוב",
  [prefix,"חנות אלף","מזון",card,"רגילה",50,reportMonth+"-10"].join(",")
 ].join("\n");
 const buffer=new TextEncoder().encode(content);
 return {name,size:buffer.byteLength,lastModified:1,arrayBuffer:async()=>buffer.buffer};
}
test("Bulk import screen previews two independently attributed monthly CSV statements without runtime errors",async()=>{
 const previous=globalThis.document;
 const doc=mockDocument();globalThis.document=doc;
 try{
  setupBulkImporter({getContext:()=>({household:null,user:null})});
  const changed=doc.els.get("bulk-import-files").handlers.get("change");
  await changed({target:{files:[
   asCsv("אוקטובר_2026_7888.csv","2026-10","7888"),
   asCsv("ספטמבר_2026_9591.csv","2026-09","9591")
  ]}});
  assert.equal(doc.els.get("bulk-import-list").children.length,2);
  const dump=(node)=>[node.textContent,...(node.children||[]).flatMap(dump)].filter(Boolean);
  assert.equal(doc.els.get("bulk-import-start").disabled,false,
   doc.els.get("bulk-status").textContent+" | "+dump(doc.els.get("bulk-import-list")).join(" | ").slice(0,850));
  assert.match(doc.els.get("bulk-import-count").textContent,/2 דוחות/);
 }finally{globalThis.document=previous}
});
