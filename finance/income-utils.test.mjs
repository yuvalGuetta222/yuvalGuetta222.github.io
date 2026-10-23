import test from "node:test";
import assert from "node:assert/strict";
import {applicableRecurring,recurringIncomeSummary} from "./income-utils.mjs";
test("Recurring income begins in its start month, not earlier",()=>{
 const item={id:"x",start_month:"2026-10-01",end_month:null,amount_agorot:100000,active:true};
 assert.equal(applicableRecurring([item],"2026-09").length,0);
 assert.equal(applicableRecurring([item],"2026-10").length,1);
});
test("A received recurring income is not counted as pending",()=>{
 const template={id:"rec-1",start_month:"2026-01-01",amount_agorot:100000,active:true};
 const income={recurring_income_id:"rec-1",amount_agorot:100000,received:true};
 const result=recurringIncomeSummary([template],[income],"2026-10");
 assert.equal(result.received,100000);
 assert.equal(result.pending,0);
 assert.equal(result.scheduled,100000);
});
test("Unconfirmed income remains expected, not received",()=>{
 const template={id:"rec-1",start_month:"2026-01-01",amount_agorot:100000,active:true};
 const result=recurringIncomeSummary([template],[],"2026-10");
 assert.equal(result.received,0);
 assert.equal(result.pending,100000);
});
test("Recurring end date and inactive templates are respected",()=>{
 const a={start_month:"2026-01-01",end_month:"2026-06-01",active:true};
 assert.equal(applicableRecurring([a],"2026-07").length,0);
 assert.equal(applicableRecurring([{...a,active:false}],"2026-05").length,0);
});
