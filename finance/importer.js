import { CATEGORIES,parseCSV,findHeaderRow,guessMapping,convertRows,fileIsSupported } from "./credit-core.mjs";
const $=id=>document.getElementById(id);
let workbook=[],rows=[],mapping={},headerRow=-1,candidates=[],fileType="csv",fileSize=0,rawFileName="";
const FIELDS=[["date","תאריך עסקה / חיוב *"],["merchant","בית עסק / תיאור *"],["amount","סכום חיוב בשקלים *"],["category","קטגוריה מתוך הדוח (אופציונלי)"],["kind","חיוב או זיכוי (אופציונלי)"],["reference","אסמכתא (אופציונלי)"],["card","זיהוי כרטיס (אופציונלי)"]];
let runtime=null;
function say(message){$("import-status").textContent=message;$("import-status").hidden=!message}
function reset(){candidates=[];rows=[];mapping={};$("import-review").classList.add("hidden");$("import-save").disabled=true;$("import-preview").replaceChildren()}
function money(n){return new Intl.NumberFormat("he-IL",{style:"currency",currency:"ILS",minimumFractionDigits:0,maximumFractionDigits:2}).format(n/100)}
function option(v,label){const e=document.createElement("option");e.value=v;e.textContent=label;return e}
function headerOptions(mappingToUse){
 const header=rows[headerRow]||[];
 const panel=$("column-mapping");panel.replaceChildren();
 for(const [field,title] of FIELDS){
  const label=document.createElement("label");label.textContent=title;
  const select=document.createElement("select");select.dataset.column=field;
  select.append(option("-1","— לא קיים בקובץ —"));
  header.forEach((value,index)=>select.append(option(String(index),(index+1)+". "+String(value||"עמודה "+(index+1)).slice(0,80))));
  select.value=String(mappingToUse[field]??-1);
  select.addEventListener("change",()=>{mapping[field]=Number(select.value);preview()});
  label.append(select);panel.append(label);
 }
}
function setSheet(){
 const sheetIndex=Number($("sheet-select").value);
 rows=workbook[sheetIndex]?.data||[];
 const found=findHeaderRow(rows);
 if(!found){say("לא הצלחתי לזהות אוטומטית עמודות תאריך, בית עסק וסכום. נסו גיליון אחר או בחרו ידנית את שורת הכותרות.");}
 else say("");
 headerRow=found?.index??0;
 const h=$("header-row");h.replaceChildren();
 for(let i=0;i<Math.min(rows.length,35);i++) h.append(option(String(i),"שורה "+(i+1)+": "+(rows[i]||[]).slice(0,5).map(v=>String(v??"").slice(0,18)).join(" | ")));
 h.value=String(headerRow);
 mapping=found?.mapping||guessMapping(rows[headerRow]||[]);
 headerOptions(mapping);preview();
}
function preview(){
 if(headerRow<0)return;
 const required=["date","merchant","amount"];
 if(required.some(k=>mapping[k]==null||mapping[k]<0||new Set(required.map(x=>mapping[x])).size!==required.length)){
  $("import-review").classList.add("hidden");$("import-save").disabled=true;say("יש לבחור שלוש עמודות נפרדות: תאריך, בית עסק וסכום.");return;
 }
 const out=convertRows(rows,headerRow,mapping);
 candidates=out.valid;
 const max=4000;
 if(candidates.length>max){candidates=candidates.slice(0,max);say("הקובץ מכיל יותר מ-4,000 עסקאות. יוצגו רק 4,000 הראשונות. מומלץ לפצל לפי חודשים.");}
 else say(out.skipped.length?"דילגנו על "+out.skipped.length+" שורות שאינן עסקאות תקינות או שורות סיכום. בדקו את המיפוי לפני שמירה.":"");
 const target=$("import-preview");target.replaceChildren();
 const available=[...new Set([...CATEGORIES,...candidates.map(t=>t.category)])].filter(Boolean).sort((a,b)=>a.localeCompare(b,"he"));
 for(let i=0;i<Math.min(candidates.length,100);i++){
  const t=candidates[i];
  const row=document.createElement("tr");
  const checkbox=document.createElement("input");checkbox.type="checkbox";checkbox.checked=t.selected;
  checkbox.setAttribute("aria-label","ייבא עסקה בשורה "+t.line);
  checkbox.addEventListener("change",()=>{t.selected=checkbox.checked;updateSummary()});
  const category=document.createElement("select");category.setAttribute("aria-label","סיווג לעסקה "+t.merchant);
  available.forEach(c=>category.append(option(c,c)));
  category.value=t.category;
  category.addEventListener("change",()=>{t.category=category.value;t.categoryMethod="manual";const badge=row.querySelector("[data-category-method]");if(badge)badge.textContent="תיקון ידני";updateSummary()});
  function cell(content){const td=document.createElement("td");if(typeof content==="string")td.textContent=content;else td.append(content);row.append(td)}
  cell(checkbox);cell(t.occurred_on);cell(t.merchant);cell(t.entry_kind==="refund"?"זיכוי":"חיוב");cell(category);const tag=document.createElement("span");tag.dataset.categoryMethod="true";tag.textContent=t.categoryMethod==="file"?"מקובץ האשראי":t.categoryMethod==="suggestion"?"זיהוי אוטומטי":t.categoryMethod==="manual"?"תיקון ידני":"לא זוהה";cell(tag);cell(money(t.amount_agorot));
  target.append(row);
 }
 if(candidates.length>100) {
  const e=document.createElement("tr"),td=document.createElement("td");td.colSpan=7;
  td.textContent="בתצוגה נראות 100 העסקאות הראשונות בלבד. יתר העסקאות יישמרו לפי קטגוריות המקור מהקובץ, אם קיימות, או לפי הסיווג המשוער. אפשר לייבא רק את 100 המוצגות.";
  e.append(td);target.append(e);
 }
 $("import-review").classList.remove("hidden");
 $("import-save").disabled=!candidates.length;
 updateSummary();
}
function updateSummary(){
 const selected=candidates.filter(x=>x.selected);
 const fileCount=selected.filter(t=>t.categoryMethod==="file").length;
 const inferredCount=selected.filter(t=>t.categoryMethod==="suggestion").length;
 $("import-summary").textContent="זוהו "+candidates.length+" עסקאות; נבחרו "+selected.length+" לייבוא; "+fileCount+" קטגוריות נקראו ישירות מהקובץ, "+inferredCount+" סווגו אוטומטית; סכום נטו "+money(selected.reduce((s,x)=>s+(x.entry_kind==="refund"?-1:1)*x.amount_agorot,0))+". הקובץ המקורי לא יישלח לשרת.";
 $("import-save").disabled=!selected.length;
}
function onlyVisible(){for(let i=100;i<candidates.length;i++)candidates[i].selected=false;updateSummary();say("רק 100 העסקאות המוצגות ייובאו.")}
function selectAll(){for(const t of candidates)t.selected=true;for(const box of $("import-preview").querySelectorAll('input[type="checkbox"]'))box.checked=true;updateSummary()}
async function readFile(file){
 if(!file)return;
 reset();say("קורא קובץ בדפדפן…");
 if(!fileIsSupported(file.name)){say("הקובץ צריך להיות CSV או XLSX. קבצי PDF ו-XLS ישנים אינם נתמכים עדיין.");return}
 if(file.size>8*1024*1024){say("גודל הקובץ המרבי הוא 8MB. נסו לייצא תקופה קצרה יותר.");return}
 fileType=/\.xlsx$/i.test(file.name)?"xlsx":"csv";fileSize=file.size;rawFileName=file.name;
 try{
  if(fileType==="xlsx"){
   const {default:readWorkbook}=await import("https://esm.sh/read-excel-file@9.3.12/browser?bundle");
   const sheets=await readWorkbook(file);
   workbook=sheets.map(s=>({name:s.sheet,data:s.data})).filter(s=>Array.isArray(s.data));
  }else{
   const buffer=await file.arrayBuffer(),bytes=new Uint8Array(buffer);
   let text;
   if(bytes[0]===0xff&&bytes[1]===0xfe) text=new TextDecoder("utf-16le").decode(bytes);
   else if(bytes[0]===0xfe&&bytes[1]===0xff)text=new TextDecoder("utf-16be").decode(bytes);
   else{try{text=new TextDecoder("utf-8",{fatal:true}).decode(bytes)}catch{text=new TextDecoder("windows-1255").decode(bytes)}}
   workbook=[{name:"CSV",data:parseCSV(text)}];
  }
  if(!workbook.length||workbook.every(x=>!x.data.length))throw Error("לא נמצאו טבלאות נתונים בקובץ");
  const select=$("sheet-select");select.replaceChildren();
  workbook.forEach((s,i)=>select.append(option(String(i),s.name+" ("+s.data.length+" שורות)")));
  let best=0,high=-1;workbook.forEach((s,i)=>{const score=findHeaderRow(s.data)?.score||0;if(score>high){high=score;best=i}});
  select.value=String(best);
  $("import-source").textContent="קובץ: "+file.name.slice(0,90)+" • "+Math.ceil(fileSize/1024)+"KB • "+workbook.length+" גיליון/ות";
  setSheet();
 }catch(err){reset();say("לא ניתן לקרוא את הקובץ: "+String(err?.message||"פורמט לא נתמך").slice(0,120)+". נסו לייצא לקובץ CSV או XLSX אחר.")}
}
async function digest(text) {
 const buf=new TextEncoder().encode(text);
 const hash=new Uint8Array(await crypto.subtle.digest("SHA-256",buf));
 return [...hash].map(x=>x.toString(16).padStart(2,"0")).join("");
}
async function save(){
 const context=runtime?.getContext();
 if(!context?.user||!context?.household){say("צריך להתחבר לחשבון המאושר לפני ייבוא.");return}
 const items=candidates.filter(c=>c.selected);
 if(!items.length)return;
 if(!confirm("לשמור "+items.length+" עסקאות בחשבון המשותף? הקובץ המקורי לא נשמר באתר."))return;
 const btn=$("import-save");btn.disabled=true;let stored=0,duplicates=0,batchId=null;
 try{
  const mapped=[];
  for(const row of items){
   // Identical rows in repeated exports receive the same fingerprint.
   const fp=await digest("tevuna-credit-v2|"+row.identity+"|"+row.sequence);
   mapped.push({household_id:context.household,created_by:context.user.id,occurred_on:row.occurred_on,
    merchant:row.merchant,category:row.category,amount_agorot:row.amount_agorot,
    entry_kind:row.entry_kind,source:fileType,source_fingerprint:fp});
  }
  const filename=String(rawFileName||"פירוט אשראי").slice(0,180);
  const selectedSheet=workbook[Number($("sheet-select").value)]?.name||null;
  const {data:batch,error:batchError}=await runtime.supabase.from("tevuna_import_batches").insert({
   household_id:context.household,created_by:context.user.id,filename,
   sheet_name:selectedSheet?String(selectedSheet).slice(0,120):null,file_kind:fileType,
   statement_month:$("import-statement-month").value?$("import-statement-month").value+"-01":null
  }).select("id").single();
  if(batchError)throw batchError;
  batchId=batch.id;
  for(const record of mapped)record.import_batch_id=batchId;
  for(let i=0;i<mapped.length;i+=75){
   const part=mapped.slice(i,i+75);
   const {data,error}=await runtime.supabase.from("tevuna_transactions")
    .upsert(part,{onConflict:"household_id,source_fingerprint",ignoreDuplicates:true})
    .select("id");
   if(error)throw error;
   stored+=data?.length||0;duplicates+=part.length-(data?.length||0);
   say("מייבא… נשמרו "+stored+" עסקאות, דולגו "+duplicates+" כפולות.");
  }
  if(stored===0 && batchId){
   const {error:cleanError}=await runtime.supabase.from("tevuna_import_batches").delete()
    .eq("id",batchId).eq("household_id",context.household);
   if(cleanError)throw cleanError;
   batchId=null;
  }
  say("✓ הייבוא הסתיים. נשמרו "+stored+" עסקאות חדשות; "+duplicates+" עסקאות חוזרות לא נשמרו שוב. פירוט עם עסקאות חדשות נשמר ב'פירוטים שיובאו', משם אפשר למחוק אותו בשלמותו.");
  $("import-file").value="";reset();
  if(stored>0){const months=new Map();for(const x of items){const month=x.occurred_on.slice(0,7);months.set(month,(months.get(month)||0)+1)}const mostCommon=[...months].sort((a,b)=>b[1]-a[1])[0]?.[0];if(mostCommon)$("month").value=mostCommon;}
  await runtime.reload();
  document.dispatchEvent(new CustomEvent("tevuna:imported"));
  document.dispatchEvent(new CustomEvent("tevuna:batches-changed"));
 }catch(err){
  say("הייבוא לא הושלם. נשמרו "+stored+" עסקאות לפני התקלה; אפשר לייבא את אותו קובץ שוב, ועסקאות זהות אמורות להיות מדולגות. פירוט: "+String(err?.message||err).slice(0,180));
  btn.disabled=false;
  if(batchId) {
   say("הייבוא הופסק לאחר שמירת "+stored+" עסקאות. ייבוא חלקי בשם '"+String(rawFileName).slice(0,60)+"' מופיע ב'פירוטים שיובאו', ותוכלו למחוק אותו בשלמותו או לייבא את הקובץ שוב.");
   document.dispatchEvent(new CustomEvent("tevuna:batches-changed"));
   await runtime.reload();
  }
 }
}
export function setupImporter(context){
 runtime=context;
 $("import-file").addEventListener("change",e=>readFile(e.target.files?.[0]));
 $("sheet-select").addEventListener("change",setSheet);
 $("header-row").addEventListener("change",e=>{headerRow=Number(e.target.value);mapping=guessMapping(rows[headerRow]||[]);headerOptions(mapping);preview()});
 $("import-save").addEventListener("click",save);
 $("only-visible").addEventListener("click",onlyVisible);
 $("select-all-import").addEventListener("click",selectAll);
}
