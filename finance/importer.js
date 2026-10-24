import { CATEGORIES,parseCSV,findHeaderRow,guessMapping,convertRows,fileIsSupported } from "./credit-core.mjs";
import {cardCheck,cardFingerprintInput,potentialLegacyOverlap,sheetCardSummary} from "./card-import.mjs";
const $=id=>document.getElementById(id);
let workbook=[],rows=[],mapping={},headerRow=-1,candidates=[],fileType="csv",fileSize=0,rawFileName="";
const FIELDS=[["date","תאריך עסקה / חיוב *"],["merchant","בית עסק / תיאור *"],["amount","סכום חיוב בשקלים *"],["category","קטגוריה מתוך הדוח (אופציונלי)"],["kind","חיוב או זיכוי (אופציונלי)"],["installment","תשלומים בקובץ"],["installmentNumber","תשלום נוכחי"],["installmentTotal","סך תשלומים"],["reference","אסמכתא (אופציונלי)"],["card","זיהוי כרטיס (אופציונלי)"]];
let runtime=null,cards=[];
const selectedCard=()=>cards.find(c=>c.id===$("import-card-select").value)||null;
function option(v,label){const e=document.createElement("option");e.value=v;e.textContent=label;return e}
function showSelectedCard(){checkSelectedCard()}
function checkSelectedCard(){
 const summary=sheetCardSummary(candidates.filter(r=>r.selected));
 const auto=summary.cards.length>0;
 $("import-card-manual").classList.toggle("hidden",auto||!candidates.length);
 $("import-card-new").classList.toggle("hidden",$("import-card-select").value!=="new");
 if(auto){
  const labels=summary.cards.map(c=>"•••• "+c.last4+" • "+c.count+" עסקאות");
  $("import-auto-card-summary").textContent="זוהו אוטומטית "+summary.cards.length+" כרטיסים: "+labels.join(" | ");
  if(summary.unknownCount){
   $("import-card-check").textContent="⚠ ב-"+summary.unknownCount+" עסקאות לא נמצאו ארבע ספרות אחרונות (שורות "+summary.unknownLines.join(", ")+"). תקנו את מיפוי עמודת הכרטיס או בטלו בחירה בשורות האלה. לא נשייך אותן לכרטיס אחר בניחוש.";
   $("import-card-check").className="note negative";
   return false;
  }
  $("import-card-check").textContent="כל העסקאות שנבחרו זוהו לפי עמודת הכרטיס שבקובץ. חשבונות לכל הכרטיסים יירשמו אוטומטית, ללא הזנה ידנית.";
  $("import-card-check").className="note";
  return true;
 }
 $("import-auto-card-summary").textContent=candidates.length?
  "לא נמצאו בקובץ ארבע ספרות אחרונות של כרטיס. אפשר לבחור ידנית כרטיס אחד רק אם כל השורות שייכות אליו.":
  "לא נטען עדיין קובץ.";
 const chosen=selectedCard(),digits=chosen?.last4||String($("import-card-last4").value||"").trim();
 const result=cardCheck(candidates.filter(x=>x.selected),digits);
 if(!chosen&&!String($("import-card-name").value||"").trim()){
  result.ok=false;result.reason="יש לתת שם לכרטיס החדש כדי לזהות אותו בייבואים עתידיים.";
 }
 $("import-card-check").textContent=result.ok?"כרטיס •••• "+digits+" — הזיהוי ידני, משום שאין בקובץ עמודת כרטיס.":"⚠ "+result.reason;
 $("import-card-check").className="note"+(result.ok?"":" negative");
 return result.ok;
}
async function refreshCards(preferred=null){
 const context=runtime?.getContext();if(!context?.household)return;
 const {data,error}=await runtime.supabase.from("tevuna_cards")
  .select("id,nickname,last4").eq("household_id",context.household).order("nickname");
 if(error){say("לא ניתן לטעון את הכרטיסים: "+String(error.message).slice(0,130));return}
 cards=data||[];
 const select=$("import-card-select"),previous=preferred||select.value;
 select.replaceChildren(option("new","+ הוספת כרטיס חדש"));
 for(const card of cards)select.append(option(card.id,card.nickname+" •••• "+card.last4));
 select.value=cards.some(c=>c.id===previous)?previous:"new";
 showSelectedCard();
}
async function resolveCard(context){
 const chosen=selectedCard();if(chosen)return chosen;
 const nickname=String($("import-card-name").value||"").trim();
 const last4=String($("import-card-last4").value||"").trim();
 if(!nickname||nickname.length>50||!/^[0-9]{4}$/.test(last4))throw Error("יש לציין שם לכרטיס וארבע ספרות אחרונות בלבד.");
 const {data:existing,error:lookupError}=await runtime.supabase.from("tevuna_cards")
  .select("id,nickname,last4").eq("household_id",context.household).eq("last4",last4).maybeSingle();
 if(lookupError)throw lookupError;
 if(existing)throw Error("כרטיס שמסתיים ב-"+last4+" כבר רשום. בחרו אותו מרשימת הכרטיסים כדי להימנע מכפילויות.");
 const {data:created,error}=await runtime.supabase.from("tevuna_cards")
  .insert({household_id:context.household,created_by:context.user.id,nickname,last4})
  .select("id,nickname,last4").single();
 if(error)throw error;
 await refreshCards(created.id);
 return created;
}

async function resolveAutoCards(context,digitsList){
 const known=new Map(cards.map(c=>[c.last4,c]));
 for(const last4 of digitsList){
  if(known.has(last4))continue;
  const {data:existing,error:lookupError}=await runtime.supabase.from("tevuna_cards")
   .select("id,nickname,last4").eq("household_id",context.household).eq("last4",last4).maybeSingle();
  if(lookupError)throw lookupError;
  if(existing){known.set(last4,existing);continue}
  const {data:created,error}=await runtime.supabase.from("tevuna_cards").insert({
    household_id:context.household,created_by:context.user.id,nickname:"כרטיס "+last4,last4
   }).select("id,nickname,last4").single();
  if(error){
   // Another approved family member might have created the profile concurrently.
   if(error.code!=="23505")throw error;
   const {data:concurrent,error:retryError}=await runtime.supabase.from("tevuna_cards")
    .select("id,nickname,last4").eq("household_id",context.household).eq("last4",last4).single();
   if(retryError)throw retryError;
   known.set(last4,concurrent);
  }else known.set(last4,created);
 }
 return known;
}
function parseExpectedMoney(value){
 const raw=String(value??"").trim().replace(/,/g,"");
 if(!raw)return null;
 if(!/^-?\d{1,9}(?:\.\d{1,2})?$/.test(raw))throw Error("סכום הביקורת אינו תקין.");
 const negative=raw.startsWith("-"),digits=negative?raw.slice(1):raw;
 const [whole,cents=""]=digits.split(".");
 return (negative?-1:1)*(Number(whole)*100+Number(cents.padEnd(2,"0")));
}
function validationState(){
 const selected=candidates.filter(x=>x.selected);
 const sum=selected.reduce((n,x)=>n+(x.entry_kind==="refund"?-1:1)*x.amount_agorot,0);
 const countRaw=$("import-expected-count").value.trim(),netRaw=$("import-expected-total").value.trim();
 const expectedCount=countRaw?Number(countRaw):null,expectedNet=parseExpectedMoney(netRaw);
 const problems=[];
 if(countRaw&&(!Number.isInteger(expectedCount)||expectedCount<0))throw Error("כמות העסקאות לביקורת אינה תקינה.");
 if(expectedCount!==null&&selected.length!==expectedCount)problems.push("מספר העסקאות אינו תואם: "+selected.length+" במקום "+expectedCount);
 if(expectedNet!==null&&sum!==expectedNet)problems.push("סכום העסקאות אינו תואם: "+money(sum)+" במקום "+money(expectedNet));
 return {selected,net:sum,expectedCount,expectedNet,problems,verified:expectedCount!==null&&expectedNet!==null&&!problems.length};
}

function say(message){$("import-status").textContent=message;$("import-status").hidden=!message}
function reset(){candidates=[];rows=[];mapping={};$("import-review").classList.add("hidden");$("import-save").disabled=true;$("import-preview").replaceChildren()}
function money(n){return new Intl.NumberFormat("he-IL",{style:"currency",currency:"ILS",minimumFractionDigits:0,maximumFractionDigits:2}).format(n/100)}
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
  cell(checkbox);cell(t.occurred_on);cell(t.merchant);cell(t.rowCardLast4?"•••• "+t.rowCardLast4:"לא זוהה");cell(t.entry_kind==="refund"?"זיכוי":"חיוב");cell(category);const tag=document.createElement("span");tag.dataset.categoryMethod="true";tag.textContent=t.categoryMethod==="file"?"מקובץ האשראי":t.categoryMethod==="suggestion"?"זיהוי אוטומטי":t.categoryMethod==="manual"?"תיקון ידני":"לא זוהה";cell(tag);cell(t.installment_total?"תשלום "+t.installment_number+"/"+t.installment_total:"לא צוין");cell(money(t.amount_agorot));
  target.append(row);
 }
 if(candidates.length>100) {
  const e=document.createElement("tr"),td=document.createElement("td");td.colSpan=9;
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
 try {
  const check=validationState();
  $("import-validation").textContent=check.problems.length?"⚠ "+check.problems.join(" • "):check.verified?"✓ מספר העסקאות והסכום תואמים לערכים שמילאתם.":"לא אומתה התאמה מלאה לדוח המקורי. הזינו מספר עסקאות וסכום סופי מדוח האשראי אם מופיעים בו.";
 }catch(error){$("import-validation").textContent=error.message}
 $("import-save").disabled=!selected.length||!checkSelectedCard();
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
async function legacyOverlap(context,items){
 if(!items.length)return 0;
 const dates=items.map(x=>x.occurred_on).sort();
 const earliest=dates[0],latest=dates.at(-1),legacy=[];
 for(let offset=0;offset<10000;offset+=1000){
  const {data,error}=await runtime.supabase.from("tevuna_transactions")
   .select("id,occurred_on,merchant,amount_agorot,entry_kind")
   .eq("household_id",context.household).is("card_id",null)
   .neq("source","manual").gte("occurred_on",earliest).lte("occurred_on",latest)
   .order("occurred_on").order("id").range(offset,offset+999);
  if(error)throw error;
  legacy.push(...(data||[]));
  if(!data||data.length<1000)return potentialLegacyOverlap(items,legacy);
 }
 throw Error("יש יותר מדי עסקאות היסטוריות ללא מזהה כרטיס לבדיקת כפילויות. הייבוא הופסק כדי להגן על הנתונים.");
}
async function save(){
 const context=runtime?.getContext();
 if(!context?.user||!context?.household){say("צריך להתחבר לחשבון המאושר לפני ייבוא.");return}
 let validation;try{validation=validationState()}catch(err){say(err.message);return}
 const items=validation.selected;
 if(!items.length)return;
 if(!checkSelectedCard()){say("חלק מהעסקאות לא זוהו לפי כרטיס. תקנו את המיפוי או את בחירת השורות לפני השמירה.");return}
 const summary=sheetCardSummary(items),automatic=summary.cards.length>0;
 const warning=validation.problems.length?"\n⚠ יש פער בבדיקה: "+validation.problems.join("; "):"";
 const modeText=automatic
  ?summary.cards.map(x=>"•••• "+x.last4+" ("+x.count+")").join(", ")
  :"•••• "+(selectedCard()?.last4||$("import-card-last4").value.trim())+" (שיוך ידני)";
 if(!confirm("ייבוא "+items.length+" עסקאות. כרטיסים שזוהו: "+modeText+"."+warning+
   "\nזיהוי כפילויות יבוצע לכל כרטיס בנפרד. האם לשמור?"))return;
 const btn=$("import-save");btn.disabled=true;let stored=0,duplicates=0,batchId=null;
 try{
  const possibleLegacy=await legacyOverlap(context,items);
  if(possibleLegacy>0 && !confirm("⚠ זוהו "+possibleLegacy+" עסקאות דומות בדוחות ישנים ללא מזהה כרטיס. ייתכן שהן כבר כלולות בסיכום המשפחתי.\nהמערכת לא יכולה להכריע אוטומטית אם הן מאותו כרטיס או מכרטיס אחר.\nביטול יאפשר לבדוק את קובצי העבר. להמשיך ולשמור למרות החשש לכפל הוצאות?")){
   btn.disabled=false;say("הייבוא בוטל כדי למנוע כפילות אפשרית מול קבצים ישנים. שום עסקה חדשה לא נשמרה.");return;
  }
  // Create/reuse a separate card profile for each unique last-four found in the file.
  const byLast4=automatic
   ?await resolveAutoCards(context,summary.cards.map(x=>x.last4))
   :new Map([[selectedCard()?.last4||$("import-card-last4").value.trim(),await resolveCard(context)]]);
  const mapped=[];
  for(const row of items){
   const digits=automatic?row.rowCardLast4:[...byLast4.keys()][0];
   const card=byLast4.get(digits);
   if(!card?.id)throw Error("לא ניתן לזהות את הכרטיס של שורה "+row.line);
   // Fingerprint depends on card and purchase identity, never on filename.
   // For multi-card sources the identical-row ordinal is scoped per card.
   const fp=await digest(cardFingerprintInput(card.id,row));
   mapped.push({household_id:context.household,created_by:context.user.id,occurred_on:row.occurred_on,
    merchant:row.merchant,category:row.category,amount_agorot:row.amount_agorot,
    card_id:card.id,
    entry_kind:row.entry_kind,source:fileType,source_fingerprint:fp,billing_month:$("import-statement-month").value?$("import-statement-month").value+"-01":null,installment_number:row.installment_number,installment_total:row.installment_total});
  }
  const filename=String(rawFileName||"פירוט אשראי").slice(0,180);
  const selectedSheet=workbook[Number($("sheet-select").value)]?.name||null;
  const {data:batch,error:batchError}=await runtime.supabase.from("tevuna_import_batches").insert({
   household_id:context.household,created_by:context.user.id,filename,
   card_id:summary.cards.length===1?byLast4.get(summary.cards[0].last4)?.id:
    automatic?null:byLast4.values().next().value?.id,
   sheet_name:selectedSheet?String(selectedSheet).slice(0,120):null,file_kind:fileType,
   statement_month:$("import-statement-month").value?$("import-statement-month").value+"-01":null,
   expected_count:validation.expectedCount,expected_net_agorot:validation.expectedNet
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
   const {data:canonical,error:lookupError}=await runtime.supabase.from("tevuna_transactions")
    .select("id,source_fingerprint,billing_month").eq("household_id",context.household)
    .in("source_fingerprint",part.map(x=>x.source_fingerprint));
   if(lookupError)throw lookupError;
   if(canonical?.length!==part.length)throw Error("לא נמצאו כל העסקאות אחרי השמירה. יש לנסות לייבא את הקובץ מחדש.");
   const links=canonical.map(t=>({household_id:context.household,batch_id:batchId,transaction_id:t.id}));
   const {error:linkError}=await runtime.supabase.from("tevuna_import_batch_transactions")
    .upsert(links,{onConflict:"batch_id,transaction_id",ignoreDuplicates:true});
   if(linkError)throw linkError;
   const month=$("import-statement-month").value?$("import-statement-month").value+"-01":null;
   if(month){
    for(const t of canonical.filter(x=>!x.billing_month)){
     const {error:billingError}=await runtime.supabase.from("tevuna_transactions")
       .update({billing_month:month}).eq("id",t.id).eq("household_id",context.household).is("billing_month",null);
     if(billingError)throw billingError;
    }
    if(canonical.some(t=>t.billing_month&&t.billing_month!==month))
     say("⚠ עסקאות כפולות עם חודש חיוב אחר לא שונו. בדקו התאמה בין הקבצים.");
   }
   say("מייבא… "+stored+" עסקאות חדשות; "+duplicates+" עסקאות שכבר קיימות קושרו גם לדוח זה.");
  }

  say("✓ הייבוא הסתיים. זוהו "+byLast4.size+" כרטיסים. נשמרו "+stored+" עסקאות חדשות; "+duplicates+" עסקאות חוזרות לא נשמרו שוב. כל פירוט נשמר ב'פירוטים שיובאו', משם אפשר למחוק אותו בשלמותו.");
  $("import-file").value="";$("import-expected-count").value="";$("import-expected-total").value="";reset();
  await refreshCards();
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
 $("import-card-select").addEventListener("change",()=>{showSelectedCard();updateSummary()});
 $("import-card-name").addEventListener("input",updateSummary);
 $("import-card-last4").addEventListener("input",updateSummary);
 document.addEventListener("tevuna:screen-changed",e=>{if(e.detail?.screen==="import")refreshCards()});
 document.addEventListener("tevuna:loaded",()=>{if(!$("import").classList.contains("hidden"))refreshCards()});
 showSelectedCard();
 $("import-expected-count").addEventListener("input",updateSummary);
 $("import-expected-total").addEventListener("input",updateSummary);
}
