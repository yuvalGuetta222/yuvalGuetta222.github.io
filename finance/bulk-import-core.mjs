import {findHeaderRow,convertRows} from "./credit-core.mjs";
import {sheetCardSummary,cardFingerprintInput,cardChargeFingerprintInput} from "./card-import.mjs";

const hebrewMonths={
 ינואר:1,פברואר:2,מרץ:3,אפריל:4,מאי:5,יוני:6,יולי:7,אוגוסט:8,ספטמבר:9,אוקטובר:10,נובמבר:11,דצמבר:12
};
const month=(year,number)=>{
 const y=Number(year),m=Number(number);
 if(y<2020||y>2100||m<1||m>12)return null;
 return String(y)+"-"+String(m).padStart(2,"0");
};
export function monthsInLabel(value){
 const normalized=String(value??"").normalize("NFKC").replace(/[\u200e\u200f]/g,"");
 const out=new Set();
 for(const [name,number] of Object.entries(hebrewMonths)){
  const re=new RegExp(name+"[\\s_.,|/-]*(20\\d{2})","g");
  for(const found of normalized.matchAll(re)){
   const result=month(found[1],number);if(result)out.add(result);
  }
 }
 for(const matched of normalized.matchAll(/(?:^|[^\d])(?:(20\d{2})[-_/.](0?[1-9]|1[0-2])|(0?[1-9]|1[0-2])[-_/.](20\d{2}))(?:[^\d]|$)/g)){
  const result=matched[1]?month(matched[1],matched[2]):month(matched[4],matched[3]);
  if(result)out.add(result);
 }
 return [...out];
}
export function statementMonthEvidence({filename="",sheetName="",topRows=[],transactions=[]}={}){
 const filenameMatches=monthsInLabel(filename);
 // Deliberately inspect captions only: individual transaction dates must NOT be used
 // to infer the report's statement month.
 const captions=[sheetName,...topRows.slice(0,3).map(r=>(r||[]).slice(0,8).join(" "))];
 const captionsMatches=[...new Set(captions.flatMap(monthsInLabel))];
 const billing=[...new Set(transactions.map(t=>t.billingMonth?.slice(0,7)).filter(Boolean))];
 const evidence=new Set([...filenameMatches,...captionsMatches]);
 if(evidence.size>1)return {month:null,status:"conflict",message:"שם הקובץ וכותרותיו מציינים חודשים שונים. בחרו ידנית את חודש הדוח.",filenameMatches,captionsMatches,billing};
 if(evidence.size===1){
  const chosen=[...evidence][0];
  if(billing.length===1&&billing[0]!==chosen)
   return {month:null,status:"conflict",message:"חודש הדוח שונה מחודש החיוב שמופיע בעסקאות. בחרו את חודש הדוח במפורש.",filenameMatches,captionsMatches,billing};
  return {month:chosen,status:"identified",message:"חודש הדוח זוהה משם הקובץ או מכותרת הגיליון.",filenameMatches,captionsMatches,billing};
 }
 if(billing.length===1)return {month:billing[0],status:"inferred",message:"חודש הדוח הוסק מתאריכי החיוב בכל העסקאות, ולא מכותרת דוח מפורשת. בדקו אותו.",filenameMatches,captionsMatches,billing};
 return {month:null,status:"unknown",message:"אין חודש דוח חד-משמעי. יש לבחור חודש ידנית לפני הייבוא.",filenameMatches,captionsMatches,billing};
}
/** Separate the independently printed credit-statement headline from the
 * transaction detail's own reconciliation row. Never use the headline as
 * an invented transaction to balance missing entries. */
export function extractControlSheet(sheets=[]){
 const matches=sheets.filter(x=>/בקרת|התאמה|summary|reconcil|audit/i.test(String(x.name||"")));
 const normalize=s=>String(s??"").normalize("NFKC").replace(/[\u200e\u200f]/g,"").replace(/["״׳']/g,"").replace(/\s+/g," ").trim();
 const amount=v=>{const text=String(v??"").replace(/[,₪\s]/g,"");if(!text)return null;const n=Number(text);return Number.isFinite(n)?Math.round(n*100):null};
 let expectedCount=null,expectedAgorot=null,sourceHeaderAgorot=null;
 for(const sheet of matches)for(const row of sheet.data||[]){
  const label=normalize(row?.[0]),b=row?.[1],c=row?.[2];
  if(/סך עסקאות שזוהו בפירוט|סך עסקאות בקובץ המאוחד/.test(label))
   expectedAgorot=amount(b);
  if(/^מספר עסקאות$/.test(label)&&Number.isInteger(Number(b)))expectedCount=Number(b);
  if(/סך הכל בשורת הכותרת בדוח|סך חיובים בדוח המקורי/.test(label))
   sourceHeaderAgorot=amount(b);
  if(/(?:סהכ|סך הכל) כל העסקאות|סך העסקאות כולן/.test(label)){
   if(amount(c)!==null)expectedAgorot=amount(c);
   else if(expectedAgorot===null)expectedAgorot=amount(b);
   if(sourceHeaderAgorot===null)sourceHeaderAgorot=amount(b);
   if(Number.isInteger(Number(row?.[4]))&&Number(row[4])>0)expectedCount=Number(row[4]);
  }
  if(/^סך הכל$/.test(label)&&Number.isInteger(Number(b))&&amount(c)!==null){
   expectedCount=Number(b);
   if(expectedAgorot===null)expectedAgorot=amount(c);
  }
 }
 return {expectedCount,expectedAgorot,sourceHeaderAgorot};
}
export function analyzeWorkbook({filename,sheets}){
 if(!Array.isArray(sheets)||!sheets.length)throw Error("אין גיליונות נתונים");
 const possibilities=sheets.map((sheet,index)=>{
  const found=findHeaderRow(sheet.data||[]);
  if(!found)return {index,score:0,count:0,valid:[],skipped:[],headerIndex:null,sheetName:sheet.name};
  const result=convertRows(sheet.data,found.index,found.mapping);
  return {index,score:found.score,count:result.valid.length,valid:result.valid,
   skipped:result.skipped,headerIndex:found.index,mapping:found.mapping,sheetName:sheet.name};
 });
 const selected=possibilities.slice().sort((a,b)=>b.count-a.count||b.score-a.score)[0];
 if(!selected?.count)throw Error("לא נמצאה טבלת עסקאות עם תאריך, בית עסק וסכום");
 const selectedSheet=sheets[selected.index];
 const evidence=statementMonthEvidence({filename,sheetName:selectedSheet.name,
  topRows:selectedSheet.data.slice(0,selected.headerIndex),transactions:selected.valid});
 return {options:possibilities.filter(x=>x.count>0).map(x=>({index:x.index,name:x.sheetName,count:x.count})),
  selectedIndex:selected.index,analysis:selected,evidence,
  summary:sheetCardSummary(selected.valid),control:extractControlSheet(sheets)};
}
export function validatePreparedReport(report){
 const rows=report.rows.filter(x=>x.selected!==false);
 if(!rows.length)return ["לא נבחרו עסקאות בקובץ."];
 if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(report.statementMonth||""))return ["יש לבחור חודש דוח תקין."];
 const summary=sheetCardSummary(rows);
 if(summary.unknownCount){
  if(summary.cards.length)return ["חסר זיהוי כרטיס ל-"+summary.unknownCount+" עסקאות. כדי להימנע משיוך שגוי יש לבדוק את הקובץ."];
  if(!/^\d{4}$/.test(report.manualLast4||""))return ["לא נמצאה עמודת כרטיס. בחרו כרטיס ידני רק אם כל העסקאות שייכות אליו."];
 }
 const errors=[];
 if(report.expectedCount!==null&&report.expectedCount!==undefined&&report.expectedCount!==""&&Number(report.expectedCount)!==rows.length)
  errors.push("מספר העסקאות אינו תואם את סכום הביקורת.");
 if(report.expectedAgorot!==null&&report.expectedAgorot!==undefined){
  const net=rows.reduce((s,r)=>s+(r.entry_kind==="refund"?-1:1)*r.amount_agorot,0);
  if(net!==report.expectedAgorot)errors.push("הסכום אינו תואם לדוח.");
 }
 return errors;
}
export function parseExpectedAgorot(text){
 const s=String(text??"").replace(/,/g,"").trim();
 if(!s)return null;
 if(!/^-?\d{1,9}(?:\.\d{1,2})?$/.test(s))throw Error("סכום הביקורת לא תקין");
 const neg=s.startsWith("-"),[a,b=""]=(neg?s.slice(1):s).split(".");
 return (neg?-1:1)*(Number(a)*100+Number(b.padEnd(2,"0")));
}

/** Construct the ledger rows without changing source purchase dates or grouping two cards together. */
export async function buildBulkTransactions({rows,household,userId,statementMonth,source,cardIds,hash}){
 if(!/^(xlsx|csv)$/.test(source))throw Error("Invalid import file source");
 if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(statementMonth))throw Error("Invalid statement month");
 const output=[];
 for(const row of rows){
  const id=cardIds.get(row.rowCardLast4||"manual");
  if(!id)throw Error("Unidentified payment card at row "+row.line);
  const canonical=cardFingerprintInput(id,row);
  output.push({
   household_id:household,created_by:userId,occurred_on:row.occurred_on,
   merchant:row.merchant,category:row.category,amount_agorot:row.amount_agorot,
   card_id:id,entry_kind:row.entry_kind,source,
   source_fingerprint:await hash(canonical),
   dedupe_v4_input:cardChargeFingerprintInput(id,row,row.billingMonth||statementMonth+"-01"),
   billing_month:row.billingMonth||statementMonth+"-01",
   installment_number:row.installment_number,
   installment_total:row.installment_total
  });
 }
 return output;
}

/**
 * Safety gate for the household's recurring 16-column XLSX export.
 * A familiar filename is not evidence that all underlying rows were parsed.
 */
export function auditRecurringStatement({sheet,headerIndex,mapping,parsed,control}){
 const issues=[];
 const headers=sheet?.data?.[headerIndex]||[];
 const compact=v=>String(v??"").normalize("NFKC").replace(/[\u200e\u200f]/g,"").replace(/\s+/g," ").trim();
 const label=field=>mapping?.[field]>=0?compact(headers[mapping[field]]):"";
 const fixedFormat=/(?:4 ספרות אחרונות של כרטיס האשראי)/.test(label("card"))
  &&/תאריך עסקה/.test(label("date"))&&/סכום חיוב/.test(label("amount"));
 if(fixedFormat){
  if(mapping.billingDate<0||mapping.billingDate===mapping.date||
    !/תאריך חיוב/.test(label("billingDate")))
   issues.push("עמודת תאריך החיוב של הפורמט הקבוע לא זוהתה.");
  if(mapping.category<0)issues.push("עמודת הקטגוריות המקורית אינה נמצאת.");
  const unresolved=parsed.valid.filter(r=>!r.rowCardLast4||!r.billingMonth);
  if(unresolved.length)issues.push("ל-"+unresolved.length+" עסקאות אין זיהוי כרטיס או תאריך חיוב ברור.");
  const invalid=(parsed.skipped||[]).filter(r=>r.reason!=="שורת סיכום");
  if(invalid.length)issues.push("לא נקראו "+invalid.length+" שורות פעילות. שורות: "+invalid.slice(0,10).map(r=>r.line).join(", ")+".");
  if(control?.sourceHeaderAgorot!==null && control?.sourceHeaderAgorot!==undefined &&
     control?.expectedAgorot!==null && control?.expectedAgorot!==undefined &&
     control.sourceHeaderAgorot!==control.expectedAgorot)
   issues.push("סכום כותרת הדוח שונה מסכום העסקאות המפורטות. ייתכן שהדוח חלקי. יש לתקן את קובץ המקור.");
 }
 return {fixedFormat,issues};
}
