import test from "node:test";
import assert from "node:assert/strict";
import {monthsInLabel,statementMonthEvidence,analyzeWorkbook,validatePreparedReport,parseExpectedAgorot} from "./bulk-import-core.mjs";
const headers=["תאריך עסקה","שם בית העסק","קטגוריה","4 ספרות אחרונות של כרטיס האשראי","סוג עסקה","סכום חיוב","תאריך חיוב"];
const rows=[["אוקטובר 2026 | כל העסקאות"],["3 עסקאות"],headers,
 ["2026-09-30","WOLT","מסעדות","7888","רגילה",45.1,"2026-10-10"],
 ["2026-10-02","FOX","ביגוד",9591,"רגילה",100,"2026-10-10"],
 ["2026-10-08","RESTAURANT","מסעדות",628,"רגילה",20,"2026-10-10"]];
test("Recognize Hebrew and numeric months while ignoring transaction dates",()=>{
 assert.deepEqual(monthsInLabel("אוקטובר_2026_כל_כרטיסי_האשראי.xlsx"),["2026-10"]);
 assert.deepEqual(monthsInLabel("statement-2026-09.xlsx"),["2026-09"]);
 assert.deepEqual(monthsInLabel("דו״ח 08.2026.csv"),["2026-08"]);
 assert.deepEqual(monthsInLabel("פירוט.xlsx"),[]);
});
test("Report month remains October while September purchase date stays September",()=>{
 const result=analyzeWorkbook({filename:"אוקטובר_2026_אשראי_מאוחד.xlsx",
  sheets:[{name:"כל העסקאות",data:rows},{name:"בדיקת התאמה",data:[["מספר עסקאות",3]]}]});
 assert.equal(result.selectedIndex,0);
 assert.equal(result.evidence.month,"2026-10");
 assert.equal(result.analysis.valid[0].occurred_on,"2026-09-30");
 assert.equal(result.analysis.valid[0].billingMonth,"2026-10-01");
 assert.deepEqual(new Set(result.analysis.valid.map(r=>r.rowCardLast4)),new Set(["7888","9591","0628"]));
 assert.equal(result.summary.unknownCount,0);
 assert.deepEqual(result.analysis.valid.map(r=>r.category),["מסעדות","ביגוד","מסעדות"]);
});
test("Unknown and conflicting report months require explicit review",()=>{
 assert.equal(statementMonthEvidence({filename:"no-month.xlsx",transactions:[]}).status,"unknown");
 assert.equal(statementMonthEvidence({filename:"אוגוסט_2026.xlsx",sheetName:"ספטמבר 2026"}).status,"conflict");
 assert.equal(statementMonthEvidence({filename:"2026-09.xlsx",transactions:[{billingMonth:"2026-10-01"}]}).status,"conflict");
 assert.equal(statementMonthEvidence({filename:"other.xlsx",transactions:[{billingMonth:"2026-10-01"}]}).status,"inferred");
 assert.equal(statementMonthEvidence({filename:"other.xlsx",transactions:[{billingMonth:"2026-09-01"},{billingMonth:"2026-10-01"}]}).status,"unknown");
});
test("Missing card or mismatched totals block import",()=>{
 const obj={rows:[{selected:true,rowCardLast4:"7888",entry_kind:"expense",amount_agorot:4510}],
  statementMonth:"2026-10",expectedCount:1,expectedAgorot:4510};
 assert.deepEqual(validatePreparedReport(obj),[]);
 assert.equal(validatePreparedReport({...obj,expectedCount:2}).length,1);
 assert.equal(validatePreparedReport({...obj,expectedAgorot:5000}).length,1);
 assert.equal(validatePreparedReport({...obj,rows:[{...obj.rows[0],rowCardLast4:null}]}).length,1);
 assert.deepEqual(validatePreparedReport({...obj,rows:[{...obj.rows[0],rowCardLast4:null}],manualLast4:"9591"}),[]);
 assert.equal(parseExpectedAgorot("123.45"),12345);
});
