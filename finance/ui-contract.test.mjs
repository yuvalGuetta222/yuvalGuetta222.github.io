import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const html=readFileSync(new URL("./index.html",import.meta.url),"utf8");
const sourceFiles=["app.js","category-view.js","income-view.js","importer.js","history.js","analysis.js","import-batches.js"];
const sources=sourceFiles.map(name=>[name,readFileSync(new URL(name,import.meta.url),"utf8")]);
test("Each required DOM element exists exactly once",()=>{
 const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(x=>x[1]);
 const occurrences=new Map();
 ids.forEach(id=>occurrences.set(id,(occurrences.get(id)||0)+1));
 for(const [file,source] of sources){
  for(const match of source.matchAll(/\$\("([^"]+)"\)/g)){
   const id=match[1];
   assert.equal(occurrences.get(id),1,"Missing or duplicated DOM id "+id+" accessed by "+file);
  }
 }
});
test("The simplified home removes full transaction navigation but keeps category details",()=>{
 assert.doesNotMatch(html,/data-screen="transactions"/);
 for(const id of ["category-bars","category-detail-dialog","category-detail-list","income-pending-summary","recurring-income-form"])
  assert.match(html,new RegExp('id="'+id+'"'));
});
test("The import form keeps optional manual transaction entry",()=>{
 assert.match(html,/class="manual-transaction-entry box"/);
 assert.match(html,/id="tx-form"/);
});
