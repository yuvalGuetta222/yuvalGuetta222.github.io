import test from "node:test";
import assert from "node:assert/strict";
import {householdBalance,fixedMonthlyProvision} from "./household-ledger.mjs";
const income=[{received:true,amount_agorot:2444800}];
const fixed=[{id:"rent",label:"שכירות",active:true,amount_agorot:450000,cadence:"monthly"}];
const tx=(id,amount_agorot)=>({id,entry_kind:"expense",amount_agorot});
test("Screenshot regression: 24,448 income - 0 card spending - 4,500 fixed reserve = 19,948",()=>{
 const s=householdBalance({incomes:income,transactions:[],fixed});
 assert.equal(s.confirmedIncome,2444800);assert.equal(s.recordedSpending,0);
 assert.equal(s.unmatched,450000);assert.equal(s.availableAfterProvisions,1994800);
});
test("Card spending and unmatched fixed both reduce planned balance",()=>{
 const s=householdBalance({incomes:income,transactions:[tx("food",200000)],fixed});
 assert.equal(s.availableAfterProvisions,1794800);
});
test("Explicitly matched card charge is deducted only once",()=>{
 const s=householdBalance({incomes:income,transactions:[tx("rent-card",450000)],fixed,
  coverage:[{fixed_expense_id:"rent",transaction_id:"rent-card"}]});
 assert.equal(s.unmatched,0);assert.equal(s.availableAfterProvisions,1994800);
});
test("A partial match only covers the amount visible in the card statement",()=>{
 const s=householdBalance({incomes:income,transactions:[tx("rent-card",300000)],fixed,
  coverage:[{fixed_expense_id:"rent",transaction_id:"rent-card"}]});
 assert.equal(s.unmatched,150000);assert.equal(s.availableAfterProvisions,1994800);
});
test("Deleted card transaction invalidates match even if stale link remains",()=>{
 const s=householdBalance({incomes:income,transactions:[],fixed,coverage:[{fixed_expense_id:"rent",transaction_id:"deleted"}]});
 assert.equal(s.unmatched,450000);assert.equal(s.availableAfterProvisions,1994800);
});
test("Unconfirmed income excluded; refunds reduce recorded spending",()=>{
 const s=householdBalance({incomes:[...income,{received:false,amount_agorot:600000}],
  transactions:[tx("a",20000),{id:"credit",entry_kind:"refund",amount_agorot:5000}],fixed:[]});
 assert.equal(s.recordedSpending,15000);assert.equal(s.confirmedIncome,2444800);
});
test("Inactive fixed expenses excluded; annual and quarterly values treated as monthly provision",()=>{
 const f=[{active:false,amount_agorot:700000,cadence:"monthly"},{active:true,amount_agorot:120000,cadence:"yearly"}];
 const s=householdBalance({fixed:f});
 assert.equal(s.unmatched,10000);
 assert.equal(fixedMonthlyProvision({active:true,amount_agorot:90000,cadence:"quarterly"}),30000);
});
