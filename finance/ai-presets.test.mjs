import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {builtInQuestionPrompts,builtInFallback} from "../supabase/functions/tevuna-ai-coach/inference.mjs";

const html=readFileSync(new URL("./index.html",import.meta.url),"utf8");
const context=()=>({
 currency:"ILS", selected_month:"2026-09", previous_month:"2026-08",
 date_basis:"statement",current_month_is_incomplete:false,
 current:{transaction_count:12,recorded_card_and_manual_spending_ils:1260,
  received_income_ils:7000,largest_spending_categories:[
   {category:"מזון",spending_ils:700,share_percent:55.6},
   {category:"תחבורה",spending_ils:350,share_percent:27.8},
   {category:"בית",spending_ils:210,share_percent:16.7}]},
 previous:{transaction_count:10,recorded_card_and_manual_spending_ils:1000,
  received_income_ils:6600},
 comparison:{status:"available",reliable_full_month_comparison:true,
  spending_change_ils:260,spending_change_percent:26,
  category_changes_for_reference_only:[{category:"תחבורה",previous_ils:200,change_ils:150},
   {category:"מזון",previous_ils:600,change_ils:100}]},
 budgets:[{category:"מזון",limit_ils:600,spent_ils:700,remaining_ils:-100,
  over_budget_ils:100},{category:"תחבורה",limit_ils:450,spent_ils:350,
  remaining_ils:100,over_budget_ils:0}],
 evidence:{current:{statement_count:2,mismatched_statement_count:0,
  no_source_total_count:0,mismatch_total_absolute_ils:0},
  previous:{statement_count:2,mismatched_statement_count:0,
   no_source_total_count:0,mismatch_total_absolute_ils:0}}
});
test("Every preset button has a distinct server-approved prompt and computed fallback",()=>{
 const tasks=[...html.matchAll(/data-ai-task="([^"]+)"/g)].map(x=>x[1]);
 assert.equal(tasks.length,9);
 assert.equal(new Set(tasks).size,9);
 assert.deepEqual([...tasks].sort(),Object.keys(builtInQuestionPrompts).sort());
 for(const type of tasks){
  const reply=builtInFallback(context(),type);
  assert.equal(typeof reply,"string",type);
  assert.ok(reply.trim().length>45,type);
  assert.ok(typeof builtInQuestionPrompts[type]==="string");
 }
 assert.equal(builtInFallback(context(),"question"),null);
 assert.match(html,/ai-preset-month/);
 assert.match(html,/ai-preset-control/);
 assert.match(html,/ai-preset-actions/);
});
test("Budget, remaining and categories reflect actual amounts with no invented numbers",()=>{
 const c=context();
 assert.match(builtInFallback(c,"budget"),/100/);
 assert.match(builtInFallback(c,"remaining"),/חריגה של 100/);
 assert.match(builtInFallback(c,"remaining"),/יתרה תקציבית מחושבת של 100/);
 assert.match(builtInFallback(c,"top"),/מזון.*700/);
 assert.match(builtInFallback(c,"top"),/תחבורה.*350/);
 assert.match(builtInFallback(c,"priorities"),/מזון/);
 assert.match(builtInFallback(c,"cashflow"),/7,000/);
 assert.match(builtInFallback(c,"cashflow"),/1,260/);
 assert.doesNotMatch(builtInFallback(c,"cashflow"),/יתרת בנק: \d/);
});
test("Monthly comparison shows exact numbers only for verified complete months",()=>{
 const a=context();
 assert.match(builtInFallback(a,"compare"),/עלייה של 260/);
 const partial={...a,current_month_is_incomplete:true,comparison:{status:"current_month_partial",reliable_full_month_comparison:false}};
 const output=builtInFallback(partial,"compare");
 assert.match(output,/החודש הנבחר עדיין בעיצומו/);
 assert.doesNotMatch(output,/עלייה של 260/);
 const bad={...a,comparison:{status:"source_discrepancy",reliable_full_month_comparison:false}};
 assert.match(builtInFallback(bad,"compare"),/הפרשים בבדיקת דוחות המקור/);
});
test("Missing budgets or incomplete source data are stated, not interpreted as zero spend",()=>{
 const a=context();a.budgets=[];
 assert.match(builtInFallback(a,"budget"),/לא הוגדרו/);
 assert.match(builtInFallback(a,"remaining"),/אין תקציבי קטגוריות/);
 a.evidence.current={statement_count:1,mismatched_statement_count:1,
  no_source_total_count:0,mismatch_total_absolute_ils:250};
 assert.match(builtInFallback(a,"data_quality"),/250/);
 assert.match(builtInFallback(a,"priorities"),/פערי ההתאמה/);
 a.current={...a.current,transaction_count:0,largest_spending_categories:[]};
 assert.match(builtInFallback(a,"data_quality"),/לא נקלטו עסקאות/);
 assert.doesNotMatch(builtInFallback(a,"top"),/700/);
});
test("Every preset answer is computed without passing merchant or account information",()=>{
 const c=context();
 c.current.merchant="SECRET";
 c.current.account_number="HIDDEN";
 for(const type of Object.keys(builtInQuestionPrompts)){
  const reply=builtInFallback(c,type);
  assert.doesNotMatch(reply,/SECRET|HIDDEN|אגורות/);
 }
});
