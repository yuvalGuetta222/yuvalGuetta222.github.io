import test from "node:test";
import assert from "node:assert/strict";
import {setupCategoryDashboard} from "./category-view.js";

class Element {
 constructor(tag="div"){
  this.tagName=tag;this.style={};this.dataset={};this.children=[];this.listeners=new Map();
  this.className="";this.value="";this.open=false;this.textContent="";this.attributes={};
  this.elements={merchant:{value:""},occurred_on:{value:""},billing_month:{value:""},
    category:{value:""},amount:{value:""},entry_kind:{value:""}};
 }
 append(...children){this.children.push(...children)}
 replaceChildren(...children){this.children=[...children]}
 setAttribute(key,value){this.attributes[key]=value}
 addEventListener(name,callback){this.listeners.set(name,callback)}
 click(){this.listeners.get("click")?.({target:this,currentTarget:this})}
 showModal(){this.open=true}
 close(){this.open=false}
}
test("Category summary opens transactions and the editing form on click",()=>{
 const prev=globalThis.document;const els=new Map(),listeners=new Map();
 globalThis.document={
  createElement:(tag)=>new Element(tag),
  getElementById:(id)=>{if(!els.has(id))els.set(id,new Element());return els.get(id)},
  addEventListener:(name,handler)=>{listeners.set(name,handler)}
 };
 try{
  setupCategoryDashboard({getContext:()=>({household:"test"})});
  const transactions=[
   {id:"a",category:"פנאי בידור וספורט",merchant:"Tennis court",occurred_on:"2026-10-18",
    amount_agorot:45000,entry_kind:"expense",billing_month:"2026-11-01",source:"xlsx"}
  ];
  listeners.get("tevuna:loaded")({detail:{data:{transactions}}});
  const charts=els.get("category-bars").children;assert.equal(charts.length,1);
  charts[0].click();
  assert.equal(els.get("category-detail-dialog").open,true);
  const txs=els.get("category-detail-list").children;assert.equal(txs.length,1);
  assert.match(txs[0].children[0].children[1].children[1].textContent,/כרטיס לא משויך/);
  txs[0].click();
  assert.equal(els.get("category-detail-dialog").open,false);
  assert.equal(els.get("edit-transaction-dialog").open,true);
  assert.equal(els.get("edit-transaction-form").elements.merchant.value,"Tennis court");
  assert.equal(els.get("edit-transaction-form").elements.billing_month.value,"2026-11");
  assert.equal(els.get("edit-transaction-form").elements.amount.value,"450.00");
  assert.equal(els.get("edit-transaction-card-section").hidden,false);
  const data={transactions:[{...transactions[0],card_id:"card-01"}],cards:[{id:"card-01",last4:"7888",nickname:"ויזה משפחתי"}]};
  listeners.get("tevuna:loaded")({detail:{data}});
  els.get("category-bars").children[0].click();
  const matched=els.get("category-detail-list").children[0];
  assert.match(matched.children[0].children[1].children[1].textContent,/7888/);
  assert.match(matched.children[0].children[1].children[1].textContent,/ויזה משפחתי/);
 }finally{globalThis.document=prev}
});
