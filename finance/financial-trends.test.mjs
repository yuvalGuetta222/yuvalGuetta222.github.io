import test from "node:test";
import assert from "node:assert/strict";
import {makeTimeline,compareMonthly,actionableMonthlyNotes,addMonths,percentChange} from "./financial-trends.mjs";
const expense=(occurred_on,category,amount_agorot,entry_kind="expense")=>({occurred_on,category,amount_agorot,entry_kind,merchant:category});
const income=(income_month,amount_agorot,received=true)=>({income_month,amount_agorot,received});
test("timeline fills past 6 months and handles year boundary",()=>{
 assert.equal(addMonths("2026-01",-1),"2025-12");
 assert.equal(addMonths("2026-12",1),"2027-01");
 assert.equal(makeTimeline({endMonth:"2026-03",count:3}).map(m=>m.key).join(","),"2026-01,2026-02,2026-03");
});
test("monthly totals use posted expenses net of refunds and received incomes",()=>{
 const t=makeTimeline({
  endMonth:"2026-10",count:2,now:new Date("2026-10-23"),
  transactions:[expense("2026-10-02","מזון",60000),expense("2026-10-03","מזון",15000,"refund"),expense("2026-09-12","בילויים",50000)],
  incomes:[income("2026-10-01",1000000),income("2026-10-01",200000,false)]
 });
 assert.equal(t[1].expenses,45000);assert.equal(t[1].income,1000000);
 assert.equal(t[1].unreceivedIncome,200000);assert.equal(t[1].balance,955000);
 assert.equal(t[0].balance,null);
});
test("missing reports do not equal zero income or expense",()=>{
 const t=makeTimeline({endMonth:"2026-10",count:2,incomes:[income("2026-10-01",100000)]});
 const a=compareMonthly({timeline:t,month:"2026-10"});
 assert.equal(a.covered,false);assert.equal(a.incomeCovered,false);assert.equal(a.expenseDifference,null);
 assert.ok(actionableMonthlyNotes(t,a).some(n=>n.title.includes("חסר פירוט")));
});
test("comparison respects month-to-date when selected month is current",()=>{
 const now=new Date("2026-10-23T10:00:00");
 const t=makeTimeline({now,endMonth:"2026-10",count:2,transactions:[
  expense("2026-09-03","מסעדות",40000),
  expense("2026-09-29","מסעדות",75000),
  expense("2026-10-05","מסעדות",50000)
 ]});
 const c=compareMonthly({timeline:t,month:"2026-10",now});
 assert.equal(c.covered,true);assert.equal(c.sameDay,true);
 assert.equal(c.previousExpenses,40000);assert.equal(c.expenseDifference,10000);
});
test("category differences preserve bank-provided labels for cross-month comparison",()=>{
 const t=makeTimeline({endMonth:"2026-10",count:2,now:new Date("2026-11-05"),transactions:[
  expense("2026-09-01","מסעדות ובתי קפה",30000),
  expense("2026-10-12","מסעדות ובתי קפה",50000),
  expense("2026-10-12","רכב ודלק",15000)]});
 const c=compareMonthly({timeline:t,month:"2026-10",now:new Date("2026-11-05")});
 assert.equal(c.categoryChanges[0].category,"מסעדות ובתי קפה");
 assert.equal(c.categoryChanges[0].difference,20000);
 const added=c.categoryChanges.find(x=>x.category==="רכב ודלק");
 assert.equal(added.percent,null);
});
test("income variance correctly indicates fall, without sign reversal",()=>{
 const t=makeTimeline({endMonth:"2026-10",count:2,now:new Date("2026-11-02"),
  incomes:[income("2026-09-01",1200000),income("2026-10-01",1000000)]});
 const c=compareMonthly({timeline:t,month:"2026-10",now:new Date("2026-11-02")});
 assert.equal(c.incomeDifference,-200000);
 assert.ok(actionableMonthlyNotes(t,c).some(x=>x.title.includes("ההכנסה")));
});
test("percentage changes do not divide by zero",()=>{
 assert.equal(percentChange(30000,0),null);
 assert.equal(percentChange(1000,2000),-50);
});
test("comparison warns if missing baseline rather than inventing a trend",()=>{
 const t=makeTimeline({endMonth:"2026-10",count:2,transactions:[expense("2026-10-02","סופר",20000)]});
 const c=compareMonthly({timeline:t,month:"2026-10"});
 assert.equal(c.covered,false);
 assert.equal(c.categoryChanges.length,1);
 assert.equal(c.expensePercent,null);
});
