import test from "node:test";
import assert from "node:assert/strict";
import {readWorkersAIAnswer,builtInFallback} from "../supabase/functions/tevuna-ai-coach/inference.mjs";
const {Response,ReadableStream}=globalThis;
const context={
 selected_month:"2026-09",current_month_is_incomplete:false,
 current:{transaction_count:3,recorded_card_and_manual_spending_ils:1234.56,
   received_income_ils:8500,largest_spending_categories:[{category:"מזון",spending_ils:530.5}]},
 previous:{transaction_count:2,recorded_card_and_manual_spending_ils:900},
 comparison:{reliable_full_month_comparison:true,spending_change_ils:334.56,
   category_changes_for_reference_only:[{category:"מזון",previous_ils:300,change_ils:230.5}]},
 budgets:[{category:"מזון",over_budget_ils:30.5}],
 evidence:{current:{mismatched_statement_count:0,no_source_total_count:0},previous:{mismatched_statement_count:0,no_source_total_count:0}}
};
test("Non-stream Cloudflare JSON still supported",async()=>{
 const response=new Response(JSON.stringify({success:true,result:{response:"התשובה בשקלים"}}),
  {headers:{"content-type":"application/json"}});
 assert.equal(await readWorkersAIAnswer(response),"התשובה בשקלים");
});
test("SSE chunks are assembled into a complete Hebrew response",async()=>{
 const chunks=[
   'data: {"response":"ההוצאות "}\n\n',
   'data: {"response":"הן 530 ₪."}\n\n',
   'data: [DONE]\n\n'
 ];
 const encoder=new TextEncoder();
 const body=new ReadableStream({
  start(controller){for(const part of chunks)controller.enqueue(encoder.encode(part));controller.close()}
 });
 const response=new Response(body,{headers:{"content-type":"text/event-stream"}});
 assert.equal(await readWorkersAIAnswer(response),"ההוצאות הן 530 ₪.");
});
test("Incomplete SSE stream with no answer is rejected",async()=>{
 const response=new Response("data: [DONE]\n\n",{headers:{"content-type":"text/event-stream"}});
 await assert.rejects(readWorkersAIAnswer(response),/no text/);
});
test("Upstream errors are not mistaken for valid AI responses",async()=>{
 const response=new Response(JSON.stringify({success:false}),{headers:{"content-type":"application/json"}});
 await assert.rejects(readWorkersAIAnswer(response),/returned an error/);
});
test("SSE supports OpenAI-compatible delta chunks if provider changes envelope",async()=>{
 const stream='data: {"choices":[{"delta":{"content":"שלום "}}]}\n\n'+
 'data: {"choices":[{"delta":{"content":"עולם"}}]}\n\n'+'data: [DONE]\n\n';
 const response=new Response(stream,{headers:{"content-type":"text/event-stream"}});
 assert.equal(await readWorkersAIAnswer(response),"שלום עולם");
});
test("Builtin fallback clearly uses server-side values in shekels",()=>{
 const result=builtInFallback(context,"summary");
 assert.match(result,/1,234\.56/);
 assert.match(result,/8,500/);
 assert.match(result,/530\.5/);
 assert.doesNotMatch(result,/אגורות/);
 const saving=builtInFallback(context,"saving");
 assert.match(saving,/30\.5/);
 assert.match(saving,/230\.5/);
 assert.match(saving,/לא חיסכון מובטח/);
 assert.equal(builtInFallback(context,"question"),null);
});
test("Never infer month over month trend if data are incomplete or unverified",()=>{
 const c={...context,current_month_is_incomplete:true,
 comparison:{reliable_full_month_comparison:false,category_changes_for_reference_only:[]},
 evidence:{...context.evidence,current:{mismatched_statement_count:1,no_source_total_count:0}}};
 const result=builtInFallback(c,"summary");
 assert.doesNotMatch(result,/לעומת החודש הקודם/);
 assert.match(result,/פערים בדוחות המקור/);
});
test("Fallback does not invent recommendations for empty statement",()=>{
 const empty={...context,current:{transaction_count:0,recorded_card_and_manual_spending_ils:0,
 received_income_ils:0,largest_spending_categories:[]},budgets:[],
 comparison:{reliable_full_month_comparison:false}};
 const result=builtInFallback(empty,"saving");
 assert.match(result,/אין מספיק הוצאות מתועדות/);
 assert.doesNotMatch(result,/חיסכון של/);
});
