import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {auditHealth,recurringPayments,buildAlerts,scenarioImpact,
 goalProgress,decisionHighlights,forecastPanel,addMonth,formatILS} from "./decision-center.mjs";

const date=(m)=>m+"-15";
const tx=(m,merchant,amount,extra={})=>({id:m+merchant,merchant,occurred_on:date(m),
 category:"מנויים",amount_agorot:amount,entry_kind:"charge",...extra});
const fixture=()=>({
 transactions:[{id:"1",category:"מזון",entry_kind:"charge",amount_agorot:120000,occurred_on:"2026-10-10"}],
 incomes:[{received:true,amount_agorot:200000}],
 budgets:[{category:"מזון",amount_agorot:100000}],
 fixed:[{id:"F",active:true,cadence:"monthly",amount_agorot:50000,start_month:"2026-01-01"}],
 coverage:[],
 audit:[{filename:"אשראי_מאוחד.xlsx",transaction_count:1,net_amount_agorot:120000,
   source_header_total_agorot:120000,expected_count:1,expected_net_agorot:120000}]
});
test("Stage 1: source audit keeps unverified and discrepant months visible",()=>{
 const data=fixture();
 assert.equal(auditHealth(data.audit).status,"verified_from_file");
 assert.equal(auditHealth([]).status,"missing");
 const bad=[{...data.audit[0],source_header_total_agorot:150000}];
 const report=auditHealth(bad);
 assert.equal(report.status,"review");
 assert.equal(report.gapAgorot,30000);
 assert.ok(report.items.length>0);
 assert.match(buildAlerts({month:"2026-10",data:{...data,audit:bad}}).alerts[0].title,/בדיקה/);
});
test("Stage 2: subscriptions require 3 distinct consecutive transaction months",()=>{
 const rows=[tx("2026-08","נטפליקס",3500),tx("2026-09"," נטפליקס ",3500),
  tx("2026-10","נטפליקס",4700)];
 const items=recurringPayments(rows,"2026-10");
 assert.equal(items.length,1);
 assert.equal(items[0].amountAgorot,4700);
 assert.equal(items[0].increaseAgorot,1200);
 assert.equal(recurringPayments(rows.slice(0,2),"2026-10").length,0);
 assert.equal(recurringPayments([rows[0],{...rows[0],id:"dup"},...rows.slice(1)],"2026-10").length,0);
});
test("Stage 2: installments and refunds cannot masquerade as subscriptions",()=>{
 const installment=[tx("2026-08","חנות",7000,{installment_total:3}),
  tx("2026-09","חנות",7000,{installment_total:3}),tx("2026-10","חנות",7000,{installment_total:3})];
 assert.equal(recurringPayments(installment,"2026-10").length,0);
 assert.equal(recurringPayments([tx("2026-08","חנות",7000),tx("2026-09","חנות",7000),
  tx("2026-10","חנות",7000,{entry_kind:"refund"})],"2026-10").length,0);
});
test("Stage 2: budgets and price spikes issue contextual, non-push alerts",()=>{
 const rows=[tx("2026-08","שירות",2000),tx("2026-09","שירות",2000),tx("2026-10","שירות",3800)];
 const data=fixture();
 const {alerts}=buildAlerts({month:"2026-10",data,history:rows});
 assert.ok(alerts.some(x=>x.id==="budget:מזון"));
 assert.ok(alerts.some(x=>x.id==="price:שירות"));
 assert.ok(!alerts.some(x=>x.id==="quality-review"));
});
test("Stage 3: scenarios are hypothetical and do not modify ledger",()=>{
 const balance={availableAfterProvisions:300000};
 assert.deepEqual(scenarioImpact({ledger:balance,monthlyAgorot:15000,kind:"reduce"}),{
  monthlyChangeAgorot:15000,annualChangeAgorot:180000,estimatedPlanningBalanceAgorot:315000
 });
 assert.equal(scenarioImpact({ledger:balance,monthlyAgorot:15000,kind:"add"}).estimatedPlanningBalanceAgorot,285000);
 assert.equal(balance.availableAfterProvisions,300000);
 assert.throws(()=>scenarioImpact({ledger:balance,monthlyAgorot:-100,kind:"reduce"}));
});
test("Stage 3: goal progress handles target reached and overdue dates",()=>{
 const g={target_agorot:100000,saved_agorot:25000,target_month:"2026-12-01"};
 assert.deepEqual(goalProgress(g,"2026-10"),{
  target:100000,saved:25000,remaining:75000,percent:25,
  monthsRemaining:3,monthlyRequired:25000,overdue:false
 });
 assert.equal(goalProgress(g,"2027-01").overdue,true);
 assert.equal(goalProgress({...g,saved_agorot:110000},"2027-01").remaining,0);
});
test("Stage 3: forecast is disabled for wrong date basis or disputed reports",()=>{
 const data=fixture();
 assert.equal(forecastPanel({month:"2026-10",basis:"statement",data}).confidence,"unavailable");
 const bad={...data,audit:[{...data.audit[0],source_header_total_agorot:200000}]};
 assert.equal(forecastPanel({month:"2026-10",basis:"transaction",data:bad}).confidence,"unavailable");
});
test("Stage 4: highlights are actionable and amounts in ILS",()=>{
 const data=fixture();
 const summary=decisionHighlights({month:"2026-10",data});
 assert.ok(summary.notes.length>=1&&summary.notes.length<=3);
 assert.ok(summary.notes[0].target);
 assert.match(formatILS(123456),/1,234/);
 assert.equal(addMonth("2026-01",-1),"2025-12");
 const html=readFileSync(new URL("./index.html",import.meta.url),"utf8");
 const app=readFileSync(new URL("./app.js",import.meta.url),"utf8");
 assert.match(html,/data-screen="planning"/);
 assert.match(html,/id="decision-home-notes"/);
 assert.match(html,/id="decision-goal-form"/);
 assert.match(html,/id="decision-scenario-kind"/);
 assert.match(app,/setupDecisionCenter/);
 assert.match(app,/tevuna:loaded/);
});
