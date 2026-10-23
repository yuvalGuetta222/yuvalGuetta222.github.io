import test from "node:test";
import assert from "node:assert/strict";
import {parseCSV,detectDelimiter,findHeaderRow,guessMapping,convertRows,parseAmount,parseDate,categorize,fileIsSupported} from "./credit-core.mjs";
import {aggregate,generateInsights} from "./financial-insights.mjs";
test("CSV detects semicolon and quoted Hebrew merchant",()=>{
 const csv="\uFEFFתאריך חיוב;שם בית עסק;סכום חיוב בשח\n23/10/2026;\"סופר; ליד הבית\";\"1,234.50\"\n24/10/2026;וולט;85.40\n";
 assert.equal(detectDelimiter(csv),";");
 const rows=parseCSV(csv);
 assert.equal(rows.length,3);assert.equal(rows[1][1],"סופר; ליד הבית");
 const found=findHeaderRow(rows);assert.equal(found.index,0);
 const result=convertRows(rows,0,found.mapping);
 assert.equal(result.valid.length,2);assert.equal(result.valid[0].amount_agorot,123450);
 assert.equal(result.valid[0].occurred_on,"2026-10-23");
});
test("CSV supports embedded linebreaks, double quotes, commas and Excel sep",()=>{
 const csv="sep=,\nDate,Description,Amount\n10/23/2026,\"Shop \"\"quoted\"\"\nNorth\",34.00\n";
 const rows=parseCSV(csv);
 assert.equal(rows.length,2);assert.equal(rows[1][1],'Shop "quoted"\nNorth');
});
test("DD/MM/YYYY and Excel date are correct, invalid dates excluded",()=>{
 assert.equal(parseDate("01/02/2026"),"2026-02-01");
 assert.equal(parseDate("2026-10-23"),"2026-10-23");
 assert.equal(parseDate("31/02/2026"),null);
 assert.equal(parseDate("10/10/23"),"2023-10-10");
 assert.equal(parseDate(44927),"2023-01-01");
});
test("ILS amounts, credits, separators and cents",()=>{
 assert.equal(parseAmount("₪1,234.50"),123450);
 assert.equal(parseAmount("1.234,50"),123450);
 assert.equal(parseAmount("(235.20)"),-23520);
 assert.equal(parseAmount("-33.22"),-3322);
 assert.equal(parseAmount(13.59),1359);
 assert.equal(parseAmount("not a number"),null);
});
test("Credit refunds, invalid summaries and manual mapping",()=>{
 const rows=[
 ["תאריך עסקה","תיאור","סכום עסקה","סוג פעולה"],
 ["23.10.2026","מסעדה איטלקית","₪152.50","חיוב"],
 ["23.10.2026","החזר בגין מסעדה","20.50","זיכוי"],
 ["23.10.2026","סה״כ","173.00","חיוב"]];
 const mapping=guessMapping(rows[0]),out=convertRows(rows,0,mapping);
 assert.equal(out.valid.length,2);
 assert.equal(out.valid[1].entry_kind,"refund");
 assert.equal(out.skipped.length,1);
});
test("Identical charges on same day get sequence counters",()=>{
 const rows=[["תאריך חיוב","שם בית עסק","סכום חיוב"],["15/10/2026","Wolt","150"],["15/10/2026","Wolt","150"]];
 const result=convertRows(rows,0,guessMapping(rows[0]));
 assert.equal(result.valid[0].sequence,1);
 assert.equal(result.valid[1].sequence,2);
 assert.equal(result.valid[0].identity,result.valid[1].identity);
});
test("Categories and supported file types",()=>{
 assert.equal(categorize("Wolt Delivery"),"מסעדות ומשלוחים");
 assert.equal(categorize("רמי לוי קניות"),"מזון וסופר");
 assert.equal(categorize("SPOTIFY"),"מנויים");
 assert.equal(categorize("חנות בלתי מזוהה"),"אחר");
 assert.ok(fileIsSupported("דוח אשראי.xlsx"));
 assert.equal(fileIsSupported("bill.pdf"),false);
});
test("Net spending deducts refunds",()=>{
 const a=aggregate([{category:"מזון וסופר",merchant:"סופר",amount_agorot:30000,entry_kind:"expense"},
 {category:"מזון וסופר",merchant:"סופר",amount_agorot:8000,entry_kind:"refund"}]);
 assert.equal(a.spent,22000);
 assert.equal(a.categories[0][1],22000);
});
test("Budget overspend, savings estimate and monthly comparison insights",()=>{
 const data={month:"2026-10",now:new Date("2026-10-23T08:00:00Z"),
  current:[
   {merchant:"Wolt",category:"מסעדות ומשלוחים",amount_agorot:120000,entry_kind:"expense",occurred_on:"2026-10-18"},
   {merchant:"Zara",category:"קניות",amount_agorot:60000,entry_kind:"expense",occurred_on:"2026-10-20"}],
  previous:[{merchant:"Wolt",category:"מסעדות ומשלוחים",amount_agorot:60000,entry_kind:"expense",occurred_on:"2026-09-19"}],
  budgets:[{category:"מסעדות ומשלוחים",amount_agorot:90000}]};
 const result=generateInsights(data);
 assert.ok(result.insights.some(x=>x.kind==="budget"));
 assert.ok(result.insights.some(x=>x.kind==="saving"));
});
