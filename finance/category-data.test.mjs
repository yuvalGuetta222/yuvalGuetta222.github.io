import test from "node:test";
import assert from "node:assert/strict";
import {categoryBreakdown} from "./category-data.mjs";
const t=(category,amount_agorot,entry_kind="expense")=>({category,merchant:"merchant",amount_agorot,entry_kind,occurred_on:"2026-10-12"});
test("Category bars sort largest net expense first",()=>{
 const r=categoryBreakdown([t("פנאי בידור וספורט",120000),t("דלק",30000),t("מזון",60000)]);
 assert.deepEqual(r.groups.map(x=>x.name),["פנאי בידור וספורט","מזון","דלק"]);
 assert.equal(r.positiveTotal,210000);
});
test("Refunds reduce the category subtotal and retain source transactions",()=>{
 const r=categoryBreakdown([t("מזון",30000),t("מזון",10000,"refund")]);
 assert.equal(r.groups[0].net,20000);assert.equal(r.groups[0].items.length,2);
});
test("Unknown or negative categories stay inspectable and do not produce negative width",()=>{
 const r=categoryBreakdown([t("נסיעות",50000,"refund"),t("מזון",20000)]);
 assert.equal(r.groups[0].name,"מזון");assert.equal(r.groups[1].net,-50000);
 assert.equal(r.max,20000);
 assert.equal(r.netTotal,-30000);
});
