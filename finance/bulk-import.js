import {CATEGORIES,parseCSV,fileIsSupported,convertRows,findHeaderRow} from "./credit-core.mjs";
import {sheetCardSummary,potentialLegacyOverlap} from "./card-import.mjs";
import {resolveBillingAwareDuplicates} from "./credit-dedupe.mjs";
import {analyzeWorkbook,extractControlSheet,statementMonthEvidence,validatePreparedReport,parseExpectedAgorot,auditRecurringStatement} from "./bulk-import-core.mjs";

const $=id=>document.getElementById(id);
const FILE_LIMIT=20,PER_FILE=8*1024*1024,TOTAL=50*1024*1024,MAX_ROWS=4000,PAGE=40;
const fmt=agorot=>new Intl.NumberFormat("he-IL",{style:"currency",currency:"ILS",maximumFractionDigits:2}).format(agorot/100);
let ctx=null,prepared=[],busy=false,cards=[];
function el(tag,text,cls){
 const node=document.createElement(tag);
 if(text!==undefined&&text!==null)node.textContent=String(text);
 if(cls)node.className=cls;
 return node;
}
function option(value,label){
 const node=el("option",label);node.value=value;return node;
}
function notify(text){$("bulk-status").textContent=text||""}
async function fileToSheets(file){
 if(!fileIsSupported(file.name))throw Error("נתמכים רק קובצי XLSX ו-CSV.");
 if(file.size>PER_FILE)throw Error("קובץ גדול מ־8MB. יש לפצל את הדוח.");
 if(/\.xlsx$/i.test(file.name)){
  const {default:readWorkbook}=await import("https://esm.sh/read-excel-file@9.3.12/browser?bundle");
  const result=await readWorkbook(file);
  return result.map(s=>({name:s.sheet,data:s.data})).filter(x=>Array.isArray(x.data));
 }
 const bytes=new Uint8Array(await file.arrayBuffer());
 let text;
 if(bytes[0]===0xff&&bytes[1]===0xfe)text=new TextDecoder("utf-16le").decode(bytes);
 else if(bytes[0]===0xfe&&bytes[1]===0xff)text=new TextDecoder("utf-16be").decode(bytes);
 else{
  try{text=new TextDecoder("utf-8",{fatal:true}).decode(bytes)}
  catch{text=new TextDecoder("windows-1255").decode(bytes)}
 }
 return [{name:"CSV",data:parseCSV(text)}];
}
function prepareSheet(item,index){
 const sheet=item.sheets[index];
 const header=findHeaderRow(sheet?.data||[]);
 if(!header)throw Error("לא נמצאו עמודות תאריך, בית עסק וסכום בגיליון");
 const parsed=convertRows(sheet.data,header.index,header.mapping);
 if(!parsed.valid.length)throw Error("לא נמצאו עסקאות תקינות בגיליון");
 if(parsed.valid.length>MAX_ROWS)throw Error("יותר מ־4,000 עסקאות בקובץ. יש לפצל לפני הייבוא.");
 item.sheetIndex=index;
 item.rows=parsed.valid;
 item.skipped=parsed.skipped.length;
 item.evidence=statementMonthEvidence({filename:item.filename,sheetName:sheet.name,
  topRows:sheet.data.slice(0,header.index),transactions:item.rows});
 item.month=item.evidence.month||"";
 item.autoMonth=item.evidence.status;
 item.page=0;
 const audit=extractControlSheet(item.sheets);
 item.sourceHeaderAgorot=audit.sourceHeaderAgorot;
 item.expectedCount=audit.expectedCount===null?"":String(audit.expectedCount);
 item.expectedTotal=audit.expectedAgorot===null?"":(audit.expectedAgorot/100).toFixed(2);
 item.structuralAudit=auditRecurringStatement({sheet,headerIndex:header.index,mapping:header.mapping,parsed,control:audit});
 item.manualCard="";
 item.manualNewLast4="";
 item.manualNewName="";
}
async function addFiles(input){
 if(busy)return;
 const chosen=[...(input||[])];if(!chosen.length)return;
 const seen=new Set(prepared.map(x=>[x.filename,x.file.size,x.file.lastModified].join("|")));
 const novel=chosen.filter(f=>!seen.has([f.name,f.size,f.lastModified].join("|")) &&
   (seen.add([f.name,f.size,f.lastModified].join("|")),true));
 if(prepared.length+novel.length>FILE_LIMIT){notify("אפשר לבחור עד "+FILE_LIMIT+" קבצים במחזור אחד. אפשר לייבא את היתר במחזור נוסף.");return}
 if(prepared.reduce((n,x)=>n+x.file.size,0)+novel.reduce((n,x)=>n+x.size,0)>TOTAL){notify("הגודל המצטבר המרבי הוא 50MB. פצלו את הבחירה לשני מחזורים.");return}
 $("bulk-import-start").disabled=true;
 for(let i=0;i<novel.length;i++){
  const file=novel[i];
  const item={file,filename:file.name,sheets:[],sheetIndex:0,rows:[],error:null,
   month:"",excluded:false,done:false,newCount:0,duplicateCount:0,page:0};
  prepared.push(item);
  try{
   notify("בודק "+(i+1)+" מתוך "+novel.length+": "+file.name);
   item.sheets=await fileToSheets(file);
   const inspection=analyzeWorkbook({filename:file.name,sheets:item.sheets});
   prepareSheet(item,inspection.selectedIndex);
  }catch(e){item.error=String(e?.message||e).slice(0,220)}
  render();
 }
 $("bulk-import-files").value="";
 render();
 notify("הקבצים נקראו בדפדפן בלבד. בדקו את חודש הדוח והכרטיסים בכל קובץ לפני שמירה.");
}
function updateItemSummary(item,body){
 const selected=item.rows.filter(x=>x.selected);
 const summary=sheetCardSummary(selected);
 const net=selected.reduce((n,r)=>n+(r.entry_kind==="refund"?-1:1)*r.amount_agorot,0);
 const scope=body.querySelector("[data-bulk-cards]");
 scope.textContent=summary.cards.length
  ?summary.cards.map(x=>"•••• "+x.last4+" ("+x.count+")").join(" • "):
  "לא זוהה כרטיס בקובץ";
 const reportDates=[...new Set(selected.map(x=>x.occurred_on.slice(0,7)))].sort();
 const detail=body.querySelector("[data-bulk-stats]");
 detail.textContent=selected.length+" עסקאות • "+fmt(net)+" נטו • חודשי עסקאות: "+
  (reportDates.length?reportDates.join(", "):"אין")+" • "+item.skipped+" שורות שלא נקלטו";
 const errs=[...(item.structuralAudit?.issues||[]),...validatePreparedReport({
  rows:item.rows,statementMonth:item.month,manualLast4:item.manualCard==="new"?item.manualNewLast4:item.manualCard,
  expectedCount:item.expectedCount,expectedAgorot:parseExpectedAgorot(item.expectedTotal)
 })];
 const status=body.querySelector("[data-bulk-validation]");
 status.textContent=errs.length?"⚠ "+errs.join(" "):
  "מוכן לייבוא. "+(item.expectedCount!==""&&item.expectedTotal!==""?
   "הסכומים ומספר העסקאות תואמים לערכי הביקורת שהזנתם.":"ללא אימות מלא של סכום הדוח המקורי.");
 status.className=errs.length?"note negative":"note";
 item.problems=errs;
 updateStartState();
}
function renderRows(item,container){
 container.replaceChildren();
 const rows=item.rows,from=item.page*PAGE,to=Math.min(rows.length,from+PAGE);
 const table=el("table",undefined,"bulk-table");
 const thead=el("thead");const hr=el("tr");
 for(const name of ["כלול","תאריך עסקה","חודש חיוב","כרטיס","בית עסק","קטגוריה","סכום"])hr.append(el("th",name));
 thead.append(hr);table.append(thead);
 const tbody=el("tbody");
 const choices=[...new Set([...CATEGORIES,...rows.map(x=>x.category)].filter(Boolean))];
 for(const row of rows.slice(from,to)){
  const tr=el("tr"),check=el("input");check.type="checkbox";check.checked=row.selected;
  check.disabled=busy||item.done;
  check.setAttribute("aria-label","כלול עסקה בשורה "+row.line);
  check.addEventListener("change",()=>{row.selected=check.checked;item.detailsOpen=true;render()});
  const checkboxCell=el("td");checkboxCell.append(check);
  tr.append(checkboxCell);
  for(const value of [row.occurred_on,row.billingMonth?.slice(0,7)||"לפי חודש הדוח",row.rowCardLast4?"•••• "+row.rowCardLast4:"לא זוהה",row.merchant])
   tr.append(el("td",value));
  const td=el("td"),sel=el("select");sel.setAttribute("aria-label","קטגוריה "+row.merchant);
  for(const choice of choices)sel.append(option(choice,choice));
  sel.value=row.category;sel.disabled=busy||item.done;
  sel.addEventListener("change",()=>{row.category=sel.value;row.categoryMethod="manual"});
  td.append(sel);tr.append(td);
  tr.append(el("td",(row.entry_kind==="refund"?"−":"")+fmt(row.amount_agorot)));
  tbody.append(tr);
 }
 table.append(tbody);container.append(table);
 const nav=el("div",undefined,"bulk-pagination");
 const previous=el("button","הקודם","secondary");previous.type="button";previous.disabled=item.page===0;
 const next=el("button","הבא","secondary");next.type="button";next.disabled=to>=rows.length;
 previous.addEventListener("click",()=>{item.page--;item.detailsOpen=true;render()});
 next.addEventListener("click",()=>{item.page++;item.detailsOpen=true;render()});
 nav.append(previous,el("span",(from+1)+"–"+to+" מתוך "+rows.length),next);container.append(nav);
}
function render(){
 const target=$("bulk-import-list");target.replaceChildren();
 for(const item of prepared){
  const shell=el("article",undefined,"box bulk-item"+(item.done?" completed":""));
  const head=el("div",undefined,"bulk-item-head");
  const title=el("div");title.append(el("strong",item.filename),el("p",item.done?"✓ יובא בהצלחה":item.error?"⚠ נדרש תיקון":"טרם נשמר • בדיקת הנתונים לפני ייבוא","subtitle"));
  head.append(title);
  if(!item.done){
   const remove=el("button","הסר מהרשימה","secondary");remove.type="button";remove.disabled=busy;
   remove.addEventListener("click",()=>{prepared=prepared.filter(x=>x!==item);render()});
   head.append(remove);
  }else head.append(el("span",item.newCount+" עסקאות חדשות • "+item.duplicateCount+" חוזרות","note"));
  shell.append(head);
  if(item.error){shell.append(el("p",item.error,"negative"));target.append(shell);continue}
  const body=el("div",undefined,"bulk-body");
  const sheetLabel=el("label","גיליון עסקאות");
  const sheets=el("select");
  for(const [index,sheet] of item.sheets.entries()){
   if(findHeaderRow(sheet.data||[]))sheets.append(option(String(index),sheet.name));
  }
  sheets.value=String(item.sheetIndex);sheets.disabled=item.done||busy;
  sheets.addEventListener("change",()=>{
   try{prepareSheet(item,Number(sheets.value));item.error=null;render()}
   catch(e){notify("גיליון זה אינו מתאים: "+String(e.message));sheets.value=String(item.sheetIndex)}
  });
  sheetLabel.append(sheets);
  const monthLabel=el("label","חודש הדוח");
  const monthInput=el("input");monthInput.type="month";monthInput.value=item.month;monthInput.disabled=item.done||busy;
  monthInput.setAttribute("aria-label","חודש הדוח עבור "+item.filename);
  monthInput.addEventListener("change",()=>{item.month=monthInput.value;item.autoMonth="manually-confirmed";updateItemSummary(item,body)});
  monthLabel.append(monthInput);
  const fields=el("div",undefined,"bulk-meta-fields");fields.append(sheetLabel,monthLabel);
  body.append(fields);
  const evidence=el("p",item.evidence.message+" "+(item.month?"חודש שנבחר: "+item.month:"חודש הדוח טרם נקבע"),"note");
  body.append(evidence);
  if(item.sourceHeaderAgorot!==null&&item.sourceHeaderAgorot!==undefined){
   const expected=item.expectedTotal?parseExpectedAgorot(item.expectedTotal):null;
   const gap=expected===null?null:item.sourceHeaderAgorot-expected;
   body.append(el("p",gap===null?"כותרת מקור: "+fmt(item.sourceHeaderAgorot):
    gap===0?"סכום גיליון הבקרה תואם לכותרת של הקובץ.":
    "⚠ בגיליון הבקרה נרשם סכום כותרת של "+fmt(item.sourceHeaderAgorot)+
    ", לעומת "+fmt(expected)+" בסיכום העסקאות המפורטות. הפרש: "+fmt(Math.abs(gap))+
    ". ייתכן שהקובץ אינו מכיל את כל העסקאות; ההפרש לא יתווסף כהוצאה.",
    "note"+(gap!==null&&gap!==0?" negative":"")));
  }

  body.append(el("p","", "bulk-cards"));
  body.lastChild?.setAttribute("data-bulk-cards","");
  const stats=el("p",undefined,"note");stats.setAttribute("data-bulk-stats","");body.append(stats);
  const summary=sheetCardSummary(item.rows.filter(x=>x.selected));
  if(!summary.cards.length){
   const manual=el("label","ללא עמודת כרטיס: בחרו כרטיס לכל העסקאות");
   const sel=el("select");sel.append(option("","בחרו כרטיס"));
   for(const card of cards)sel.append(option(card.last4,card.nickname+" •••• "+card.last4));
   sel.append(option("new","כרטיס חדש"));
   sel.value=item.manualCard;
   sel.disabled=item.done||busy;
   sel.addEventListener("change",()=>{item.manualCard=sel.value;render()});manual.append(sel);body.append(manual);
   if(item.manualCard==="new"){
    const grid=el("div",undefined,"bulk-meta-fields");
    const name=el("label","שם כרטיס חדש"),inputName=el("input");
    inputName.maxLength=50;inputName.value=item.manualNewName;
    inputName.addEventListener("input",()=>{item.manualNewName=inputName.value;updateStartState()});
    name.append(inputName);
    const digits=el("label","4 ספרות אחרונות"),inputDigits=el("input");inputDigits.maxLength=4;
    inputDigits.inputMode="numeric";inputDigits.value=item.manualNewLast4;
    inputDigits.addEventListener("input",()=>{item.manualNewLast4=inputDigits.value;updateItemSummary(item,body)});
    digits.append(inputDigits);grid.append(name,digits);body.append(grid);
   }
  }else if(summary.unknownCount)body.append(el("p","חסרות ארבע ספרות ב-"+summary.unknownCount+" שורות; יש לבחור כותרת כרטיס נכונה או להסיר שורות לא מזוהות מהייבוא.","negative"));
  const checks=el("div",undefined,"bulk-meta-fields");
  const countLabel=el("label","מספר עסקאות לביקורת (אופציונלי)"),count=el("input");
  count.type="number";count.min="0";count.step="1";count.value=item.expectedCount;count.disabled=item.done||busy;
  count.addEventListener("input",()=>{item.expectedCount=count.value;updateItemSummary(item,body)});
  countLabel.append(count);
  const totalLabel=el("label","סכום נטו לביקורת ₪ (אופציונלי)"),total=el("input");
  total.inputMode="decimal";total.placeholder="למשל 22062.19";total.value=item.expectedTotal;total.disabled=item.done||busy;
  total.addEventListener("input",()=>{item.expectedTotal=total.value;try{updateItemSummary(item,body)}catch(e){body.querySelector("[data-bulk-validation]").textContent=e.message;updateStartState()}});
  totalLabel.append(total);checks.append(countLabel,totalLabel);body.append(checks);
  const validate=el("p",undefined,"note");validate.setAttribute("data-bulk-validation","");body.append(validate);
  const details=el("details",undefined,"bulk-transaction-details");
  details.open=!!item.detailsOpen;
  details.addEventListener("toggle",()=>{item.detailsOpen=details.open});
  const sum=el("summary","בדיקת עסקאות ושינוי קטגוריות לפני שמירה");
  details.append(sum);
  const actions=el("div",undefined,"bulk-row-actions");
  const selectAll=el("button","בחרו את כל העסקאות","secondary"),selectNone=el("button","בטלו בחירת עסקאות","secondary");
  selectAll.type="button";selectNone.type="button";selectAll.disabled=item.done||busy;selectNone.disabled=item.done||busy;
  selectAll.addEventListener("click",()=>{item.rows.forEach(x=>x.selected=true);item.detailsOpen=true;render()});
  selectNone.addEventListener("click",()=>{item.rows.forEach(x=>x.selected=false);item.detailsOpen=true;render()});
  actions.append(selectAll,selectNone);details.append(actions);
  const rowsPanel=el("div",undefined,"table-wrap");renderRows(item,rowsPanel);details.append(rowsPanel);
  body.append(details);
  shell.append(body);target.append(shell);
  try{updateItemSummary(item,body)}catch(error){
   item.problems=[String(error.message)];validate.textContent=error.message;validate.className="note negative";
  }
 }
 updateStartState();
}
function updateStartState(){
 const remaining=prepared.filter(r=>!r.done);
 const valid=remaining.length>0&&remaining.every(r=>!r.error&&!r.problems?.length&&
  (r.manualCard!=="new"||String(r.manualNewName||"").trim()));
 $("bulk-import-start").disabled=busy||!valid;
 $("bulk-import-files").disabled=busy;
 $("bulk-import-clear").disabled=busy;
 $("bulk-import-count").textContent=prepared.length?
  prepared.filter(r=>r.done).length+" מתוך "+prepared.length+" דוחות נשמרו • "+remaining.length+" עדיין ממתינים":
  "בחרו כמה קבצים ביחד כדי לבדוק אותם לפני השמירה.";
}
async function refreshCards(){
 const {household}=ctx.getContext();if(!household)return;
 const {data,error}=await ctx.supabase.from("tevuna_cards").select("id,nickname,last4")
  .eq("household_id",household).order("last4");
 if(error)throw error;cards=data||[];
}
async function cardFor(context,last4,nickname){
 const remembered=cards.find(c=>c.last4===last4);if(remembered)return remembered;
 const {data:exists,error:lookupError}=await ctx.supabase.from("tevuna_cards")
  .select("id,nickname,last4").eq("household_id",context.household).eq("last4",last4).maybeSingle();
 if(lookupError)throw lookupError;
 if(exists){cards.push(exists);return exists}
 const {data:created,error}=await ctx.supabase.from("tevuna_cards")
  .insert({household_id:context.household,created_by:context.user.id,nickname:nickname||"כרטיס "+last4,last4})
  .select("id,nickname,last4").single();
 if(error){
  if(error.code!=="23505")throw error;
  const {data:concurrent,error:retryError}=await ctx.supabase.from("tevuna_cards")
   .select("id,nickname,last4").eq("household_id",context.household).eq("last4",last4).single();
  if(retryError)throw retryError;cards.push(concurrent);return concurrent;
 }
 cards.push(created);return created;
}
async function digest(value){
 const sha=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value));
 return [...new Uint8Array(sha)].map(x=>x.toString(16).padStart(2,"0")).join("");
}
async function potentialOldDuplicates(context,rows){
 const from=rows.map(x=>x.occurred_on).sort();
 const legacy=[];
 for(let offset=0;offset<10000;offset+=1000){
  const {data,error}=await ctx.supabase.from("tevuna_transactions")
   .select("id,occurred_on,merchant,entry_kind,amount_agorot")
   .eq("household_id",context.household).is("card_id",null).neq("source","manual")
   .gte("occurred_on",from[0]).lte("occurred_on",from.at(-1))
   .order("occurred_on").order("id").range(offset,offset+999);
  if(error)throw error;
  legacy.push(...(data||[]));
  if(!data||data.length<1000)return potentialLegacyOverlap(rows,legacy);
 }
 throw Error("קיימים יותר מדי חיובים ישנים ללא זיהוי כרטיס. הייבוא הופסק לבדיקת כפילויות.");
}
async function persist(context,item){
 const selected=item.rows.filter(x=>x.selected);
 const summary=sheetCardSummary(selected);
 if(summary.unknownCount>0&&!item.manualCard)
  throw Error("חסר זיהוי כרטיס בחלק מהעסקאות.");
 const manualLast4=item.manualCard==="new"?item.manualNewLast4:item.manualCard;
 const rows=selected.map(row=>({
  occurred_on:row.occurred_on,
  billing_month:row.billingMonth||item.month+"-01",
  merchant:row.merchant,
  category:row.category,
  amount_agorot:row.amount_agorot,
  entry_kind:row.entry_kind,
  card_last4:row.rowCardLast4||manualLast4,
  import_identity:row.importIdentity,
  import_sequence:row.importSequence,
  installment_number:row.installment_number,
  installment_total:row.installment_total
 }));
 const expectedNet=parseExpectedAgorot(item.expectedTotal);
 const calculated=selected.reduce((n,r)=>n+(r.entry_kind==="refund"?-1:1)*r.amount_agorot,0);
 const {data,error}=await ctx.supabase.rpc("tevuna_import_statement_verified",{
  p_household:context.household,
  p_filename:item.filename.slice(0,180),
  p_sheet_name:String(item.sheets[item.sheetIndex]?.name||"").slice(0,120)||null,
  p_file_kind:/\.xlsx$/i.test(item.filename)?"xlsx":"csv",
  p_statement_month:item.month+"-01",
  p_rows:rows,
  p_expected_count:item.expectedCount!==""?Number(item.expectedCount):selected.length,
  p_expected_net_agorot:expectedNet??calculated,
  p_source_header_total_agorot:item.sourceHeaderAgorot,
  p_source_header_note:item.sourceHeaderAgorot===null?
   "לא נמצא גיליון בקרה עם סכום כותרת.":
   "נתון מתוך גיליון הבקרה בקובץ; אין אימות ישיר מול PDF חברת האשראי."
 });
 if(error)throw error;
 if(!data||Number(data.transaction_count)!==selected.length||
     Number(data.new_count)+Number(data.existing_count)!==selected.length||
     Number(data.net_agorot)!==calculated)
  throw Error("שרת הנתונים החזיר תוצאה לא צפויה. בדקו את הייבוא לפני ניסיון חוזר.");
 return {stored:Number(data.new_count),duplicates:Number(data.existing_count)};
}
async function saveAll(){
 if(busy)return;
 const context=ctx?.getContext();if(!context?.household||!context?.user){notify("יש להתחבר לחשבון המשפחתי לפני השמירה.");return}
 const pending=prepared.filter(x=>!x.done);
 if(!pending.length)return;
 try{
  for(const item of pending){
   const errors=[...(item.structuralAudit?.issues||[]),...validatePreparedReport({
    rows:item.rows,statementMonth:item.month,
    manualLast4:item.manualCard==="new"?item.manualNewLast4:item.manualCard,
    expectedCount:item.expectedCount,expectedAgorot:parseExpectedAgorot(item.expectedTotal)
   })];
   if(item.error||errors.length||(item.manualCard==="new"&&!item.manualNewName.trim()))
    throw Error("קיימת בעיית אימות ב-"+item.filename+". תקנו לפני השמירה.");
  }
 }catch(e){notify(String(e.message));return}
 const overall=pending.reduce((n,x)=>n+x.rows.filter(r=>r.selected).length,0);
 if(!confirm("לשמור "+pending.length+" דוחות עם "+overall+" עסקאות שנבחרו? כל דוח יישמר בנפרד, וכפילויות באותו כרטיס לא ייספרו פעמיים."))return;
 busy=true;render();
 let newCount=0,dupCount=0,failed=[];
 try{
  await refreshCards();
  for(let index=0;index<pending.length;index++){
   const item=pending[index],selected=item.rows.filter(x=>x.selected);
   notify("בודק דוח "+(index+1)+" מתוך "+pending.length+": "+item.filename);
   try{
    const suspected=await potentialOldDuplicates(context,selected);
    if(suspected>0&&!confirm("בדוח "+item.filename+" זוהו "+suspected+" עסקאות דומות לייבואים ישנים ללא כרטיס. ייתכן כפל הוצאות. לא ניתן להחליט אוטומטית. להמשיך עם הדוח למרות הסיכון?")){
     failed.push(item.filename+": לא אושר חשש לכפילויות מול מידע ישן.");continue;
    }
    const result=await persist(context,item);
    item.done=true;item.newCount=result.stored;item.duplicateCount=result.duplicates;
    newCount+=result.stored;dupCount+=result.duplicates;
    notify("נשמר "+item.filename+" • "+result.stored+" חדשות • "+result.duplicates+" כפולות");
   }catch(error){
    failed.push(item.filename+": "+String(error.message||error).slice(0,190));
    // Keep failed and partial files in the review panel for explicit retry.
   }
   render();
  }
  await ctx.reload();
  document.dispatchEvent(new CustomEvent("tevuna:imported"));
  document.dispatchEvent(new CustomEvent("tevuna:batches-changed"));
  notify("סיום ייבוא: "+pending.filter(x=>x.done).length+" דוחות נשמרו; "+
   newCount+" עסקאות חדשות; "+dupCount+" עסקאות קיימות לא נוספו שוב."+
   (failed.length?" נדרשת בדיקה: "+failed.join(" | "):" כל הדוחות שנבחרו נשמרו."));
 }catch(e){notify("השמירה הופסקה: "+String(e?.message||e).slice(0,220))}
 finally{busy=false;render()}
}
export function setupBulkImporter(runtime){
 ctx=runtime;
 $("bulk-import-files").addEventListener("change",event=>addFiles(event.target.files));
 $("bulk-import-start").addEventListener("click",saveAll);
 $("bulk-import-clear").addEventListener("click",()=>{if(!busy){prepared=prepared.filter(x=>x.done);render()}});
 document.addEventListener("tevuna:screen-changed",async event=>{
  if(event.detail?.screen!=="import")return;
  try{await refreshCards();render()}catch(error){notify("רשימת הכרטיסים אינה זמינה: "+String(error.message||error))}
 });
 render();
}
