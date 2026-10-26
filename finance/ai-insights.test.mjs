import test from "node:test";
import assert from "node:assert/strict";
import {ils,buildFinancialInsights} from "../supabase/functions/tevuna-ai-coach/insights.mjs";
const row = (category, amount_agorot, entry_kind="purchase") => ({category,amount_agorot,entry_kind});
const source = (net, header) => ({net_amount_agorot:net,source_header_total_agorot:header});
const base = () => ({
 month:"2026-09",previousMonth:"2026-08",basis:"statement",
 now:new Date("2026-10-26T12:00:00Z"),
 current:[row("מזון",22055),row("מזון",500,"refund"),row("תחבורה",10600)],
 previous:[row("מזון",18000),row("תחבורה",8000)],
 currentIncome:1100100, previousIncome:980000,
 budgets:[{category:"מזון",amount_agorot:20000}],
 source:[source(32155,32155)],previousSource:[source(26000,26000)]
});
test("Converts monetary units correctly, with integer arithmetic and refund handling",()=>{
 assert.equal(ils(125499),1254.99);
 assert.equal(ils(-505),-5.05);
 const out=buildFinancialInsights(base());
 assert.equal(out.currency,"ILS");
 assert.equal(out.currency_symbol,"₪");
 assert.equal(out.current.recorded_card_and_manual_spending_ils,321.55);
 assert.equal(out.current.received_income_ils,11001);
 assert.equal(out.previous.recorded_card_and_manual_spending_ils,260);
 assert.equal(out.current.largest_spending_categories[0].spending_ils,215.55);
 assert.equal(out.budgets[0].over_budget_ils,15.55);
 assert.equal(out.budgets[0].utilization_percent,107.8);
 assert.equal(out.comparison.status,"available");
 assert.equal(out.comparison.spending_change_ils,61.55);
 assert.equal(out.comparison.spending_change_percent,23.7);
 assert.equal(out.comparison.category_changes_for_reference_only[0].change_ils,35.55);
 assert.ok(!JSON.stringify(out).includes("agorot"));
});
test("Incomplete current month suppresses misleading comparison and savings claims",()=>{
 const out=buildFinancialInsights({...base(),month:"2026-10",previousMonth:"2026-09"});
 assert.equal(out.current_month_is_incomplete,true);
 assert.equal(out.comparison.status,"current_month_partial");
 assert.equal(out.comparison.spending_change_ils,null);
 assert.deepEqual(out.comparison.category_changes_for_reference_only,[]);
 assert.ok(out.grounded_focus_candidates.every(x=>x.kind!=="higher_than_previous_month"));
});
test("Reconciliation mismatches and unknown source totals do not produce confident trends",()=>{
 const a=base();a.source=[source(32155,35555)];
 const mismatch=buildFinancialInsights(a);
 assert.equal(mismatch.evidence.current.mismatched_statement_count,1);
 assert.equal(mismatch.evidence.current.mismatch_total_absolute_ils,34);
 assert.equal(mismatch.comparison.status,"source_discrepancy");
 assert.equal(mismatch.comparison.reliable_full_month_comparison,false);
 a.source=[source(32155,null)];
 assert.equal(buildFinancialInsights(a).comparison.status,"unverified_source_totals");
});
test("Missing statements or empty months never mean zero spending or verified savings",()=>{
 const a=base();a.previous=[];
 assert.equal(buildFinancialInsights(a).comparison.status,"insufficient_data");
 a.previous=base().previous;a.previousSource=[];
 assert.equal(buildFinancialInsights(a).comparison.status,"insufficient_data");
});
test("Invalid amount fails rather than silently reporting zero",()=>{
 const a=base();a.current=[row("מזון",Infinity)];
 assert.throws(()=>buildFinancialInsights(a),/Invalid financial amount/);
});
test("Financial payload excludes merchant names, identifiers and original transaction rows",()=>{
 const a=base();
 a.current[0].merchant="סודי";
 a.current[0].id="private-id";
 const out=buildFinancialInsights(a);
 const result=JSON.stringify(out);
 assert.doesNotMatch(result,/סודי|private-id|amount_agorot|account_number|card_last4/);
 assert.ok(out.grounded_focus_candidates.some(x=>x.kind==="over_budget"));
});
