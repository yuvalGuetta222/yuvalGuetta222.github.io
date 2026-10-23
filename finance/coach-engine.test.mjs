import test from "node:test";
import assert from "node:assert/strict";
import {spendingForecast,savingsPriorities,recurringSignals,installmentSignals,aggregateTransactions,shiftMonth} from "./coach-engine.mjs";
import {parseInstallments,convertRows,guessMapping} from "./credit-core.mjs";
const now=new Date("2026-10-23T10:00:00");
const tx=(date,name,amount,category="פנאי בידור וספורט",other={})=>({occurred_on:date,merchant:name,amount_agorot:amount,category,entry_kind:"expense",...other});
test("No false forecast when statement is stale",()=>{
 const result=spendingForecast({month:"2026-10",now,current:[tx("2026-10-15","shop",40000)]});
 assert.equal(result.projectedTotal,null);assert.equal(result.actual,40000);
 assert.match(result.reason,/לפני 8 ימים/);
});
test("No forecast is fabricated when selected month is historical",()=>{
 const result=spendingForecast({month:"2026-09",now,current:[tx("2026-09-15","shop",15000)]});
 assert.equal(result.projectedTotal,null);
});
test("At least several different dates needed for projection",()=>{
 const result=spendingForecast({month:"2026-10",now,current:[tx("2026-10-22","shop",90000)]});
 assert.equal(result.confidence,"unavailable");
});
test("Projection does not count scheduled fixed expenses twice",()=>{
 const rows=Array.from({length:12},(_,i)=>tx("2026-10-"+String(i+11).padStart(2,"0"),"shop",10000));
 const result=spendingForecast({month:"2026-10",now,current:rows,fixed:[{active:true,amount_agorot:120000,cadence:"monthly"}]});
 assert.ok(result.projectedTotal>result.actual);
 assert.equal(result.plannedMonthlyReference,120000);
 assert.equal(result.plannedIncludedInForecast,false);
 assert.ok(result.projectedTotal<result.actual+120000);
});
test("Complete historical month supports projection with conservative confidence",()=>{
 const past=Array.from({length:22},(_,i)=>tx("2026-09-"+String(i+3).padStart(2,"0"),"shop",10000));
 const current=Array.from({length:8},(_,i)=>tx("2026-10-"+String(i+15).padStart(2,"0"),"shop",9000));
 const result=spendingForecast({month:"2026-10",now,current,history:past});
 assert.equal(result.historyMonths,1);
 assert.ok(result.upper>result.lower);
 assert.equal(result.confidence,"low");
});
test("Refunds reduce actual charges",()=>{
 assert.equal(aggregateTransactions([tx("2026-10-21","shop",20000),tx("2026-10-22","refund",5000,"אחר",{entry_kind:"refund"})]),15000);
});
test("Three ranked priorities are capped with budget breaches first",()=>{
 const current=[
 tx("2026-10-21","A",80000,"פנאי בידור וספורט"),
 tx("2026-10-22","B",30000,"מסעדות ובתי קפה"),
 tx("2026-10-21","C",60000,"קניות"),
 tx("2026-10-21","D",30000,"נופש")
 ];
 const found=savingsPriorities({month:"2026-10",now,current,budgets:[{category:"פנאי בידור וספורט",amount_agorot:60000}]});
 assert.equal(found.length,3);assert.equal(found[0].reason,"חריגה מתקציב");assert.ok(found.every(x=>x.saving>=0));
});
test("No false recurring subscription from duplicate charges in same month",()=>{
 const events=[
 tx("2026-09-10","Wolt",10000),
 tx("2026-09-20","Wolt",10000),
 tx("2026-10-10","Wolt",10000)
 ];
 assert.equal(recurringSignals(events,"2026-10").length,0);
});
test("Recurring signal requires consecutive months and reasonably similar amount",()=>{
 const ok=[tx("2026-09-09","Spotify",3590,"מנויים"),tx("2026-10-09","SPOTIFY",3590,"מנויים")];
 assert.equal(recurringSignals(ok,"2026-10").length,1);
 const gap=[tx("2026-08-09","Spotify",3590),tx("2026-10-09","Spotify",3590)];
 assert.equal(recurringSignals(gap,"2026-10").length,0);
 const changed=[tx("2026-09-09","Spotify",3590),tx("2026-10-09","Spotify",6000)];
 assert.equal(recurringSignals(changed,"2026-10").length,0);
});
test("Installments are counted as charged only once; future balance is separate",()=>{
 const events=[tx("2026-10-12","Store",12000,"קניות",{installment_number:2,installment_total:6})];
 const found=installmentSignals(events,"2026-10");
 assert.equal(found.length,1);assert.equal(found[0].futurePayments,4);
 assert.equal(found[0].futureAmount,48000);
 assert.equal(aggregateTransactions(events),12000);
});
test("Installment parser accepts only explicit credible fraction",()=>{
 assert.deepEqual(parseInstallments("תשלום 2 מתוך 6",null,null),{installment_number:2,installment_total:6});
 assert.deepEqual(parseInstallments("3/12",null,null),{installment_number:3,installment_total:12});
 assert.deepEqual(parseInstallments(null,"3","12"),{installment_number:3,installment_total:12});
 assert.deepEqual(parseInstallments("10/4",null,null),{installment_number:null,installment_total:null});
 assert.deepEqual(parseInstallments("שישה תשלומים",null,null),{installment_number:null,installment_total:null});
});
test("CSV columns with explicit installment field become metadata, not inflated amount",()=>{
 const rows=[["תאריך חיוב","שם בית עסק","סכום חיוב","קטגוריה","תשלומים"],["21/10/2026","חנות חשמל","120","קניות","2/6"]];
 const mapping=guessMapping(rows[0]),v=convertRows(rows,0,mapping);
 assert.equal(mapping.installment,4);
 assert.equal(v.valid[0].installment_number,2);
 assert.equal(v.valid[0].installment_total,6);
 assert.equal(v.valid[0].amount_agorot,12000);
});
