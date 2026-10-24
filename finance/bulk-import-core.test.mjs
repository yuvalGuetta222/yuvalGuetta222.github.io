import {findHeaderRow,convertRows} from "./credit-core.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import {monthsInLabel,statementMonthEvidence,analyzeWorkbook,validatePreparedReport,parseExpectedAgorot,buildBulkTransactions,extractControlSheet,auditRecurringStatement} from "./bulk-import-core.mjs";
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

test("Several statements retain separate reporting month, purchase date and card, with idempotent fingerprints",async()=>{
 const analyze=analyzeWorkbook({filename:"אוקטובר_2026_אשראי_מאוחד.xlsx",sheets:[{name:"כל העסקאות",data:rows}]});
 const purchase=analyze.analysis.valid;
 const cardIds=new Map([["7888","00000000-0000-4000-8000-000000000001"],
 ["9591","00000000-0000-4000-8000-000000000002"],["0628","00000000-0000-4000-8000-000000000003"]]);
 const make=async(month)=>buildBulkTransactions({rows:purchase,household:"household",userId:"user",
  statementMonth:month,source:"xlsx",cardIds,hash:async value=>"hash:"+value});
 const october=await make("2026-10");
 assert.equal(october[0].occurred_on,"2026-09-30");
 assert.equal(october[0].billing_month,"2026-10-01");
 assert.equal(october[0].card_id,cardIds.get("7888"));
 assert.equal(october[1].card_id,cardIds.get("9591"));
 assert.equal(october[2].card_id,cardIds.get("0628"));
 assert.equal(new Set(october.map(x=>x.source_fingerprint)).size,3);
 assert.deepEqual((await make("2026-10")).map(x=>x.source_fingerprint),october.map(x=>x.source_fingerprint));
 const september=await make("2026-09");
 assert.deepEqual(september.map(x=>x.source_fingerprint),october.map(x=>x.source_fingerprint));
 assert.equal(september[0].billing_month,"2026-10-01"); // authoritative date in row, even when statement label changes
});
test("Bulk mapper refuses to guess an unavailable card",async()=>{
 await assert.rejects(()=>buildBulkTransactions({rows:[{...convertRow(),rowCardLast4:"7293"}],household:"h",userId:"u",
  statementMonth:"2026-10",source:"xlsx",cardIds:new Map(),hash:async x=>x}),/Unidentified payment card/);
});
function convertRow(){return analyzeWorkbook({filename:"אוקטובר_2026.xlsx",sheets:[{name:"עסקאות",data:rows}]}).analysis.valid[0]}

test("Credit workbook with a partial September statement records the headline gap without inventing transactions",()=>{
 const parsed=extractControlSheet([{name:"בקרת סכומים",data:[
  ["מדד","סכום בשח","הסבר"],
  ["סך הכל בשורת הכותרת בדוח",11006.79,"כותרת"],
  ["סך עסקאות שזוהו בפירוט",7560.02,"חישוב"],
  ["סך הכל",60,7560.02]
 ]}]);
 assert.equal(parsed.expectedCount,60);
 assert.equal(parsed.expectedAgorot,756002);
 assert.equal(parsed.sourceHeaderAgorot,1100679);
});
test("Full October workbook recognizes grand total and count in control tab",()=>{
 const parsed=extractControlSheet([{name:"בקרת התאמה",data:[
  ["רכיב בדוח MAX","סכום PDF","סכום גיליון","פער","מספר עסקאות"],
  ["סה״כ כל העסקאות",22062.19,22062.19,0,77]
 ]}]);
 assert.deepEqual(parsed,{expectedCount:77,expectedAgorot:2206219,sourceHeaderAgorot:2206219});
});
test("Visa report totals and counts can be inferred from control tab independently",()=>{
 const parsed=extractControlSheet([{name:"בקרת סכומים",data:[
  ["סך חיובים בדוח המקורי",2997.07],
  ["סך עסקאות בקובץ המאוחד",2997.07],
  ["מספר עסקאות",22]
 ]}]);
 assert.deepEqual(parsed,{expectedCount:22,expectedAgorot:299707,sourceHeaderAgorot:299707});
});

test("Recurring 16-column format passes only when dates, card endings and source ledger are consistent",()=>{
 const header=["תאריך עסקה","שם בית העסק","קטגוריה","4 ספרות אחרונות של כרטיס האשראי",
 "סוג עסקה","סכום חיוב","מטבע חיוב","סכום עסקה מקורי","מטבע עסקה מקורי","תאריך חיוב",
 "הערות","תיוגים","מועדון הנחות","מפתח דיסקונט","אופן ביצוע העסקה","שער המרה"];
 const data=[["אוקטובר 2026"],header,
 ["13-10-2026","קינן שפי","עירייה וממשלה","9591","רגילה",300,"₪",300,"₪","15-10-2026"],
 ["12-10-2026","קלמנטינה פירות וירקות","מזון וצריכה",628,"רגילה",12.9,"₪",12.9,"₪","15-10-2026"]];
 const found=findHeaderRow(data),parsed=convertRows(data,found.index,found.mapping);
 const control={expectedCount:2,expectedAgorot:31290,sourceHeaderAgorot:31290};
 const check=auditRecurringStatement({sheet:{name:"כל העסקאות",data},headerIndex:found.index,
 mapping:found.mapping,parsed,control});
 assert.equal(check.fixedFormat,true);
 assert.deepEqual(check.issues,[]);
 assert.equal(parsed.valid[0].rowCardLast4,"9591");
 assert.equal(parsed.valid[1].rowCardLast4,"0628");
 assert.equal(parsed.valid[1].amount_agorot,1290);
 assert.equal(parsed.valid[1].billingMonth,"2026-10-01");
});
test("A rejected transaction or a blank billing date fails validation rather than silently lowering spending",()=>{
 const header=["תאריך עסקה","שם בית העסק","קטגוריה","4 ספרות אחרונות של כרטיס האשראי","סוג עסקה","סכום חיוב","תאריך חיוב"];
 const rows=[header,
 ["2026-10-15","חנות א","קניות","7888","רגילה",100,"2026-10-15"],
 ["2026-10-15","חנות ב","קניות","7888","רגילה",80,""],
 ["invalid date","חנות ג","קניות","7888","רגילה",35,"2026-10-15"]];
 const found=findHeaderRow(rows),parsed=convertRows(rows,found.index,found.mapping);
 const result=auditRecurringStatement({sheet:{data:rows},headerIndex:found.index,mapping:found.mapping,parsed,control:{}});
 assert.equal(result.fixedFormat,true);
 assert.ok(result.issues.some(x=>x.includes("תאריך חיוב")));
 assert.ok(result.issues.some(x=>x.includes("לא נקראו")));
});
test("When bank headline exceeds parsed detail, standard import is blocked until source is corrected",()=>{
 const header=["תאריך עסקה","שם בית העסק","קטגוריה","4 ספרות אחרונות של כרטיס האשראי","סוג עסקה","סכום חיוב","תאריך חיוב"];
 const data=[header,["2026-09-15","חנות","קניות","9591","רגילה",75,"2026-09-15"]];
 const found=findHeaderRow(data),parsed=convertRows(data,found.index,found.mapping);
 const audit=auditRecurringStatement({sheet:{data},headerIndex:found.index,mapping:found.mapping,parsed,
 control:{expectedAgorot:7500,sourceHeaderAgorot:1100679}});
 assert.ok(audit.issues.some(x=>x.includes("סכום כותרת")));
});
