import {setupBackup} from "./export-view.js";
import {householdBalance} from "./household-ledger.mjs";
import {setupCoach} from "./coach-view.js";
import {setupIncomeManagement} from "./income-view.js";
import {setupCategoryDashboard} from "./category-view.js";
import {recurringIncomeSummary} from "./income-utils.mjs";
import {setupBatches} from "./import-batches.js";
import {setupHistory} from "./history.js";
import {setupImporter} from "./importer.js";
import {CATEGORIES} from "./credit-core.mjs";
import {setupAnalysis} from "./analysis.js";
import {createClient} from "https://esm.sh/@supabase/supabase-js@2.76.1";
const SB_URL="https://vimklcufkafrmkcfxxak.supabase.co";
const SB_PUBLIC_KEY="sb_publishable_4n9nLMOpeR4VcMSKvXiYWQ_E-83U8va";
const supabase=createClient(SB_URL,SB_PUBLIC_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
const $=id=>document.getElementById(id);
const today=()=>{const d=new Date();return [d.getFullYear(),String(d.getMonth()+1).padStart(2,"0"),String(d.getDate()).padStart(2,"0")].join("-")};
const currentMonth=()=>today().slice(0,7);
const money=agorot=>new Intl.NumberFormat("he-IL",{style:"currency",currency:"ILS",minimumFractionDigits:0,maximumFractionDigits:2}).format(agorot/100);
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
function toAgorot(input,allowZero=false){
  const s=String(input??"").trim();
  if(!/^\d{1,9}(?:\.\d{1,2})?$/.test(s))throw Error("יש להזין סכום חיובי עם עד שתי ספרות אחרי הנקודה");
  const [w,f=""]=s.split(".");
  const n=Number(w)*100+Number(f.padEnd(2,"0"));
  if(!Number.isSafeInteger(n)||n>100000000000||(!allowZero&&n<=0))throw Error("הסכום אינו בטווח המותר");
  return n;
}
let household=null, user=null, signup=false, data={income:[],transactions:[],fixed:[],budgets:[],recurring:[],coverage:[]},busy=false;
let reloadSequence=0;
const view=id=>{for(const n of ["auth-view","pending-view","app-view"])$(n).classList.toggle("hidden",n!==id)};
function notice(msg,target="app-error"){const el=$(target);el.textContent=msg??"";if(msg){el.scrollIntoView({block:"nearest",behavior:"smooth"})}}
function defaultDates(){$("month").value=currentMonth();document.querySelector('input[name="occurred_on"]').value=today();document.querySelector('input[name="income_month"]').value=currentMonth()}
function authError(err){const m=String(err?.message||err||"תקלה בלתי צפויה");
 if(/invalid login credentials/i.test(m))return "כתובת המייל או הסיסמה אינן נכונות";
 if(/email not confirmed/i.test(m))return "יש לאמת את כתובת המייל דרך ההודעה שקיבלת";
 if(/already registered/i.test(m))return "כבר קיים חשבון עם כתובת המייל הזו";
 if(/rate limit|too many requests/i.test(m))return "בוצעו ניסיונות רבים מדי. נסה שוב מאוחר יותר";
 if(/password/i.test(m))return "בדוק את הסיסמה. מומלץ לבחור סיסמה ארוכה וחזקה";
 return "לא ניתן לבצע את הפעולה כרגע. "+m.slice(0,170);
}
function setAuthMode(){signup=!signup;$("auth-heading").textContent=signup?"יצירת חשבון":"כניסה לאתר הפרטי";$("auth-description").textContent=signup?"הרשמה ואימות מייל, ואז אישור גישה ידני":"התחברו באמצעות כתובת המייל והסיסמה שלכם";$("auth-submit").textContent=signup?"יצירת חשבון":"התחברות";$("auth-toggle").textContent=signup?"כבר יש חשבון? התחברות":"עוד אין חשבון? יצירת חשבון";$("password").autocomplete=signup?"new-password":"current-password";notice("","auth-error")}
$("auth-toggle").addEventListener("click",setAuthMode);
$("auth-form").addEventListener("submit",async e=>{
 e.preventDefault();notice("","auth-error");if(busy)return;busy=true;$("auth-submit").disabled=true;
 const email=$("email").value.trim(),password=$("password").value;
 try{
  if(signup){
   const {data:d,error}=await supabase.auth.signUp({email,password,options:{emailRedirectTo:location.origin+location.pathname}});
   if(error)throw error;
   if(d.session){await showFor(d.session.user)}else{notice("נשלח קישור לאימות המייל (אם הכתובת תקינה). לאחר האימות חזור לאתר והתחבר. עדיין יידרש אישור גישה אישי.","auth-error")}
  }else{
   const {data:d,error}=await supabase.auth.signInWithPassword({email,password});if(error)throw error;
   await showFor(d.user);
  }
 }catch(err){notice(authError(err),"auth-error")}finally{busy=false;$("auth-submit").disabled=false}
});
async function showFor(nextUser){
 user=nextUser??null;household=null;
 if(!user){view("auth-view");return}
 const {data:d,error}=await supabase.from("tevuna_members").select("household_id,role").eq("user_id",user.id).maybeSingle();
 if(error){view("pending-view");$("pending-email").textContent=user.email||"";notice("אין אפשרות לבדוק את ההרשאה כרגע. נסה שוב.","pending-message");return}
 if(!d){view("pending-view");$("pending-email").textContent=user.email||"";notice("החשבון עדיין לא נמצא ברשימת המשתמשים המאושרים.","pending-message");return}
 household=d.household_id;view("app-view");await reload();
}
$("pending-refresh").addEventListener("click",async()=>{notice("בודק הרשאות…","pending-message");const {data:{user:u},error}=await supabase.auth.getUser();if(error){notice("בדיקת האימות נכשלה. נסה להתחבר מחדש.","pending-message");return}await showFor(u)});
document.querySelectorAll(".logout").forEach(btn=>btn.addEventListener("click",async()=>{const {error}=await supabase.auth.signOut();if(error){notice(authError(error));return}user=null;household=null;data={income:[],transactions:[],fixed:[],budgets:[],recurring:[],coverage:[]};$("password").value="";view("auth-view")}));
const screenTitles={
 dashboard:["התמונה הכלכלית שלנו","הוצאות, הכנסות ותובנות שמבוססות על מה שנשמר בפועל"],
 history:["השוואת חודשים","איך ההוצאות וההכנסות השתנו לאורך זמן"],
 import:["ייבוא פירוט אשראי","בוחרים קובץ, בודקים עסקאות ושומרים רק את מה שאושר"],
 statements:["פירוטי אשראי שיובאו","ניהול ומחיקה של קובצי עסקאות שלמים"],
 incomes:["ניהול הכנסות","הכנסות קבועות, חד־פעמיות ומה התקבל בפועל"],
 budgets:["ניהול תקציב","מסגרת חודשית לכל קטגוריה לפי שמות הקטגוריות של חברת האשראי"],
 fixed:["הוצאות קבועות","התחייבויות חוזרות לתכנון משפחתי"],
 backup:["גיבוי וייצוא","שמירת עותק פרטי של נתוני המשפחה והעסקאות"]
};
function switchScreen(name){
 for(const screen of document.querySelectorAll(".screen"))screen.classList.toggle("hidden",screen.id!==name);
 document.querySelectorAll("[data-screen]").forEach(btn=>btn.classList.toggle("active",btn.dataset.screen===name));
 const [title,description]=screenTitles[name]||screenTitles.dashboard;
 $("app-screen-title").textContent=title;$("app-screen-description").textContent=description;
 const menu=$("nav-more");if(menu){
  const summary=menu.querySelector("summary");
  summary.firstChild.textContent=(name==="dashboard"||name==="history"?"ניהול נתונים":title)+" ";
  menu.classList.toggle("current",name!=="dashboard"&&name!=="history");menu.open=false;
 }
 document.dispatchEvent(new CustomEvent("tevuna:screen-changed",{detail:{screen:name}}));
}
document.querySelectorAll("[data-screen]").forEach(btn=>btn.addEventListener("click",()=>switchScreen(btn.dataset.screen)));
$("ledger-fixed-link").addEventListener("click",()=>switchScreen("fixed"));
$("month").addEventListener("change",()=>{if($("recurring-income-form"))$("recurring-income-form").elements.start_month.value=$("month").value;if($("fixed-form"))$("fixed-form").elements.start_month.value=$("month").value;reload()});
$("date-basis").addEventListener("change",reload);
const cadenceMonths={monthly:1,bimonthly:2,quarterly:3,yearly:12};
async function loadTransactions(start,next){
 const fields="id,merchant,category,amount_agorot,entry_kind,occurred_on,billing_month,installment_number,installment_total,source_snapshot,source";
 const basis=$("date-basis").value==="billing"?"billing_month":"occurred_on";
 const fetch=async(field,manual=false)=>{
  const result=[];
  for(let offset=0;offset<10000;offset+=1000){
   let query=supabase.from("tevuna_transactions").select(fields).eq("household_id",household)
    .gte(field,start).lt(field,next).order(field,{ascending:false}).order("id").range(offset,offset+999);
   if(manual)query=query.eq("source","manual");else if(basis==="billing_month")query=query.neq("source","manual");
   const {data:page,error}=await query;if(error)return {data:[],error};
   result.push(...(page||[]));if(!page||page.length<1000)return {data:result,error:null};
  }
  return {data:[],error:new Error("נתונים רבים מדי לטעינה מלאה")};
 };
 if(basis==="occurred_on")return fetch(basis);
 const [cards,manual]=await Promise.all([fetch("billing_month"),fetch("occurred_on",true)]);
 if(cards.error)return cards;if(manual.error)return manual;
 return {data:[...cards.data,...manual.data],error:null};
}

async function reload(){
 if(!household)return;
 const request=++reloadSequence,requestedHousehold=household;
 try {const m=$("month").value||currentMonth();const start=m+"-01";
 const yr=Number(m.slice(0,4)),mo=Number(m.slice(5,7));const next=(mo===12?yr+1:yr)+"-"+String(mo===12?1:mo+1).padStart(2,"0")+"-01";
 notice("טוען נתונים…");
 const [i,t,f,b,r,c]=await Promise.all([
 supabase.from("tevuna_incomes").select("id,label,amount_agorot,income_month,received,recurring_income_id").eq("household_id",household).eq("income_month",start).order("created_at",{ascending:false}),
 loadTransactions(start,next),
 supabase.from("tevuna_fixed_expenses").select("id,label,category,amount_agorot,cadence,active,start_month,end_month").eq("household_id",household).order("created_at",{ascending:false}),
 supabase.from("tevuna_budgets").select("id,category,amount_agorot,budget_month").eq("household_id",household).eq("budget_month",start).order("category"),
 supabase.from("tevuna_recurring_incomes").select("id,label,amount_agorot,start_month,end_month,active").eq("household_id",household).order("created_at",{ascending:false}),
 supabase.from("tevuna_fixed_expense_card_coverage").select("fixed_expense_id,transaction_id,expense_month").eq("household_id",household).eq("expense_month",start)]);
 if(request!==reloadSequence||household!==requestedHousehold||$("month").value!==m)return;
 const err=[i.error,t.error,f.error,b.error,r.error,c.error].find(Boolean);
 if(err){notice("שגיאה בטעינת הנתונים. בדוק את החיבור ונסה שוב.");return}
 data={income:i.data||[],transactions:t.data||[],fixed:f.data||[],budgets:b.data||[],recurring:r.data||[],coverage:c.data||[]};
 render();
 notice("");
 document.dispatchEvent(new CustomEvent("tevuna:loaded",{detail:{data,month:m,household}}));
 }catch(error){
  if(request!==reloadSequence||household!==requestedHousehold)return;
  console.error("Tevuna: error loading or rendering a financial month",error);
  notice("לא ניתן להשלים את טעינת החודש. הנתונים לא נמחקו. נסו לרענן את הדף; אם התקלה נמשכת, פתחו את האתר בדפדפן מעודכן.");
 }
}
function line(label,sub,val,id=null,table=null){
 const row=document.createElement("div");row.className="line-item";
 const info=document.createElement("div"),b=document.createElement("b");b.textContent=label;const s=document.createElement("small");s.textContent=sub;info.append(b,s);
 const other=document.createElement("div");other.className="sub-row";const amount=document.createElement("span");amount.className="value";amount.textContent=money(val);other.append(amount);
 if(id&&table){const del=document.createElement("button");del.className="danger";del.textContent="מחיקה";del.type="button";del.addEventListener("click",()=>removeItem(table,id));other.append(del)}row.append(info,other);return row;
}
function fillLines(id,items){const box=$(id);box.replaceChildren(...(items.length?items:[Object.assign(document.createElement("p"),{className:"empty",textContent:"אין עדיין נתונים לחודש או לסוג שנבחר."})]))}
function monthlyFixed(){return data.fixed.filter(x=>x.active).reduce((sum,x)=>sum+Math.round(x.amount_agorot/cadenceMonths[x.cadence]),0)}
function categorySpend(){const c=new Map();for(const t of data.transactions){c.set(t.category,(c.get(t.category)||0)+(t.entry_kind==="refund"?-1:1)*t.amount_agorot)}return [...c.entries()].sort((a,b)=>b[1]-a[1])}
function updateCategorySuggestions(){
 const dataList=$("finance-category-options");if(!dataList)return;
 const defaults=["מזון וסופר","מסעדות ומשלוחים","תחבורה","בילויים","בריאות","קניות","חשבונות הבית","שכירות","מנויים","חינוך","ביטוח","נסיעות ונופש","אחר"];
 const all=new Set([...defaults,...data.transactions.map(t=>t.category),...data.budgets.map(b=>b.category)]);
 dataList.replaceChildren();
 for(const name of [...all].filter(v=>typeof v==="string"&&v.trim()&&v.length<=60).sort((a,b)=>a.localeCompare(b,"he"))){
  const option=document.createElement("option");option.value=name;dataList.append(option);
 }
}
function fixedRow(item){
 const provision=householdBalance({fixed:[item],month:$("month").value}).planned;
 const base=line(item.label,item.category+" • "+({monthly:"חודשי",bimonthly:"דו־חודשי",quarterly:"רבעוני",yearly:"שנתי"})[item.cadence]+(item.active?"":" • לא פעיל"),item.amount_agorot,item.id,"tevuna_fixed_expenses");
 if(!item.active)return base;
 const bar=document.createElement("div");bar.className="fixed-reconcile";
 const current=data.coverage.find(c=>c.fixed_expense_id===item.id);
 const trx=current&&data.transactions.find(t=>t.id===current.transaction_id&&t.entry_kind!=="refund");
 const remaining=householdBalance({transactions:data.transactions,fixed:[item],coverage:data.coverage,month:$("month").value}).unmatched;
 const helper=document.createElement("p");helper.className="note";helper.textContent="שריון חודשי: "+money(provision)+" • שעדיין נלקח בחשבון: "+money(remaining);bar.append(helper);
 if(trx){
  const lbl=document.createElement("div");lbl.className="fixed-linked";lbl.textContent="נכלל בעסקת אשראי: "+trx.merchant+" • "+money(trx.amount_agorot)+" • "+trx.occurred_on;
  const undo=document.createElement("button");undo.type="button";undo.className="secondary";undo.textContent="בטל התאמה";
  undo.addEventListener("click",async()=>{undo.disabled=true;notice("מעדכן התאמה…");const {error}=await supabase.from("tevuna_fixed_expense_card_coverage").delete().eq("household_id",household).eq("fixed_expense_id",item.id).eq("expense_month",$("month").value+"-01");if(error){notice("לא ניתן לבטל התאמה: "+error.message);undo.disabled=false;return}await reload()});
  bar.append(lbl,undo);
 } else {
  const candidates=data.transactions.filter(t=>t.entry_kind!=="refund"&&!data.coverage.some(c=>c.transaction_id===t.id));
  if(candidates.length){
   const select=document.createElement("select");select.setAttribute("aria-label","בחר עסקת אשראי שמתאימה להוצאה "+item.label);select.append(new Option("בחר עסקה שכבר כוללת את ההוצאה…",""));
   for(const t of candidates){const o=new Option(t.occurred_on+" • "+t.merchant+" • "+money(t.amount_agorot),t.id);select.append(o)}
   const save=document.createElement("button");save.type="button";save.className="secondary";save.textContent="קשר לעסקה";save.disabled=true;select.addEventListener("change",()=>save.disabled=!select.value);
   save.addEventListener("click",async()=>{
    const selected=data.transactions.find(t=>t.id===select.value);if(!selected||selected.entry_kind==="refund")return;
    if(!confirm("האם "+item.label+" בסך "+money(provision)+" באמת כלול בעסקה "+selected.merchant+" בסך "+money(selected.amount_agorot)+"? סכום שכבר נכלל בעסקה לא יופחת שוב."))return;
    save.disabled=true;const {error}=await supabase.from("tevuna_fixed_expense_card_coverage").insert({household_id:household,created_by:user.id,fixed_expense_id:item.id,expense_month:$("month").value+"-01",transaction_id:selected.id});
    if(error){notice("לא ניתן לבצע התאמה: "+error.message);save.disabled=false;return}await reload();
   });
   bar.append(select,save);
  }else bar.append(Object.assign(document.createElement("p"),{className:"note",textContent:"אין בחודש זה עסקאות אשראי זמינות להתאמה. ההתחייבות מנוכה במלואה מהיתרה לתכנון."}));
 }
 const dates=document.createElement("div");dates.className="fixed-dates";dates.setAttribute("aria-label","תקופת תוקף של "+item.label);
 const startLabel=document.createElement("label");startLabel.textContent="תחילת ההתחייבות";
 const startInput=document.createElement("input");startInput.type="month";startInput.value=item.start_month?.slice(0,7)||"";startLabel.append(startInput);
 const endLabel=document.createElement("label");endLabel.textContent="סיום (אופציונלי)";
 const endInput=document.createElement("input");endInput.type="month";endInput.value=item.end_month?.slice(0,7)||"";endLabel.append(endInput);
 const saveDates=document.createElement("button");saveDates.type="button";saveDates.className="secondary";saveDates.textContent="עדכן תוקף";
 saveDates.addEventListener("click",async()=>{
  if(!startInput.value){notice("חובה לבחור תאריך התחלה כדי לחשב היסטוריה מדויקת.");return}
  if(endInput.value&&endInput.value<startInput.value){notice("תאריך הסיום לא יכול להיות לפני תאריך ההתחלה.");return}
  saveDates.disabled=true;
  const {data:updated,error}=await supabase.from("tevuna_fixed_expenses")
   .update({start_month:startInput.value+"-01",end_month:endInput.value?endInput.value+"-01":null})
   .eq("id",item.id).eq("household_id",household).select("id");
  if(error||!updated?.length){notice("לא ניתן לעדכן את התוקף: "+String(error?.message||"הרשומה לא נמצאה"));saveDates.disabled=false;return}
  await reload();notice("תוקף ההתחייבות נשמר. המגמות ההיסטוריות עודכנו.");saveDates.disabled=false;
 });
 dates.append(startLabel,endLabel,saveDates);
 if(!item.start_month)dates.append(Object.assign(document.createElement("p"),{className:"note",textContent:"אין תאריך תחילה היסטורי. חודשים קודמים לא ייחשבו כמאומתים עד שתמלאו תאריך."}));
 bar.append(dates);
 const wrap=document.createElement("div");wrap.className="fixed-expense-item";wrap.append(base,bar);return wrap;
}
function render(){
 updateCategorySuggestions();
 const inc=data.income.filter(x=>x.received).reduce((a,x)=>a+x.amount_agorot,0);
 const incomes=recurringIncomeSummary(data.recurring,data.income,$("month").value);
 const spent=data.transactions.reduce((a,x)=>a+(x.entry_kind==="refund"?-1:1)*x.amount_agorot,0);
 const ledger=householdBalance({incomes:data.income,transactions:data.transactions,fixed:data.fixed,coverage:data.coverage,month:$("month").value});
 $("s-income").textContent=money(inc);
 $("s-income-meta").textContent=incomes.pending>0?"בנוסף צפויות "+money(incomes.pending)+" שטרם אושרו":"הכנסות שהתקבלו בפועל";
 $("s-spent").textContent=money(spent);
 $("s-fixed").textContent=money(ledger.unmatched);
 $("s-fixed-meta").textContent="מתוך "+money(ledger.planned)+" התחייבויות; "+money(ledger.matched)+" כבר נכללים בעסקאות";
 $("s-balance").textContent=money(ledger.availableAfterProvisions);
 $("s-balance").className="value "+(ledger.availableAfterProvisions<0?"negative":"positive");
 $("ledger-equation").textContent=money(ledger.confirmedIncome)+" הכנסות − "+money(ledger.recordedSpending)+" עסקאות − "+money(ledger.unmatched)+" התחייבויות שטרם נכללו = "+money(ledger.availableAfterProvisions);
 $("ledger-note").textContent="זהו סכום לתכנון, לא יתרת הבנק. התחייבויות שלא קושרו לעסקאות מנוכות, גם אם שולמו מחוץ לאשראי. בחודשים בלי עסקאות, לא משחררים התחייבויות אוטומטית.";
 const cat=categorySpend();

 const insights=[];
 if(!data.income.length&&!data.transactions.length)insights.push("כדי להתחיל, הוסיפו משכורת ועסקאות ראשונות. עד אז לא ניתן לנתח את מצבכם.");
 for(const b of data.budgets){const current=cat.find(x=>x[0]===b.category)?.[1]||0;if(current>b.amount_agorot)insights.push("הוצאות "+b.category+" חרגו ב-"+money(current-b.amount_agorot)+" מהתקציב שנקבע.");}
 if(inc>0&&spent>inc)insights.push("העסקאות המדווחות גבוהות מההכנסות שהתקבלו בחודש שנבחר. בדקו גם התחייבויות והכנסות שטרם דווחו.");
 if(data.fixed.some(x=>x.active))insights.push("הוצאות קבועות מוצגות בנפרד מעסקאות, כדי שלא לספור אותן פעמיים. בעתיד נתאים חיובים בפועל להתחייבויות.");
 if(!insights.length)insights.push("עדיין אין חריגות מזוהות מנתוני החודש. המשיכו לעדכן את ההוצאות כדי לשפר את התמונה.");
 $("insight-lines").replaceChildren(...insights.map(t=>{const d=document.createElement("div");d.className="insight";d.textContent=t;return d}));

 fillLines("income-list",data.income.map(x=>line(x.label,x.received?"התקבל בפועל":"טרם התקבל",x.amount_agorot,x.id,"tevuna_incomes")));
 fillLines("fixed-list",data.fixed.map(x=>fixedRow(x)));
 const bars=data.budgets.map(b=>{const spent=cat.find(x=>x[0]===b.category)?.[1]||0,ratio=b.amount_agorot?Math.max(0,spent/b.amount_agorot*100):spent?100:0;
  const wrap=document.createElement("div"),r=line(b.category,"נוצלו "+money(spent)+" מתוך "+money(b.amount_agorot),b.amount_agorot,b.id,"tevuna_budgets");
  const bar=document.createElement("div");bar.className="bar";const inner=document.createElement("div");inner.className="bar-fill"+(spent>b.amount_agorot?" over":"");inner.style.width=Math.min(100,ratio)+"%";bar.append(inner);wrap.append(r,bar);return wrap});
 fillLines("budget-list",bars);
}
async function removeItem(table,id){
 if(!household||!confirm("למחוק את הרשומה הזו? לא ניתן לשחזר את המחיקה באתר זה."))return;
 notice("מוחק רשומה…");const {error}=await supabase.from(table).delete().eq("id",id).eq("household_id",household);
 if(error){notice(authError(error));return}await reload()
}
async function save(table,values,form){
 if(!household)throw Error("החשבון עדיין לא אושר.");
 const {error}=await supabase.from(table).insert({...values,household_id:household,created_by:user.id});if(error)throw error;
 form.reset();await reload()
}
function bindForm(id,table,prepare){const f=$(id);f.addEventListener("submit",async e=>{e.preventDefault();const button=f.querySelector('button[type="submit"]');button.disabled=true;notice("שומר נתונים…");
 try{const v=prepare(new FormData(f));await save(table,v,f);if(id==="tx-form")f.querySelector('[name="occurred_on"]').value=today();if(id==="income-form")f.querySelector('[name="income_month"]').value=$("month").value;if(id==="fixed-form")f.elements.start_month.value=$("month").value;notice("נשמר בהצלחה.");}
 catch(err){notice(authError(err))}finally{button.disabled=false}})}
bindForm("tx-form","tevuna_transactions",f=>({occurred_on:f.get("occurred_on"),merchant:String(f.get("merchant")).trim(),category:String(f.get("category")).trim(),amount_agorot:toAgorot(f.get("amount")),entry_kind:f.get("entry_kind")}));
bindForm("income-form","tevuna_incomes",f=>({label:String(f.get("label")).trim(),income_month:f.get("income_month")+"-01",amount_agorot:toAgorot(f.get("amount")),received:f.get("received")==="on"}));
bindForm("fixed-form","tevuna_fixed_expenses",f=>({label:String(f.get("label")).trim(),category:String(f.get("category")).trim(),
 amount_agorot:toAgorot(f.get("amount")),cadence:f.get("cadence"),
 start_month:String(f.get("start_month"))+"-01",end_month:f.get("end_month")?String(f.get("end_month"))+"-01":null}));
$("budget-form").addEventListener("submit",async e=>{
 e.preventDefault();if(!household)return;const f=e.currentTarget,button=f.querySelector('button[type="submit"]');button.disabled=true;
 try{const v=new FormData(f);const category=v.get("category"),amount_agorot=toAgorot(v.get("amount"),true),budget_month=$("month").value+"-01";
 const existing=data.budgets.find(b=>b.category===category);
 const row={household_id:household,category,amount_agorot,budget_month,created_by:user.id};
 const res=existing?await supabase.from("tevuna_budgets").update({amount_agorot}).eq("id",existing.id).eq("household_id",household):await supabase.from("tevuna_budgets").insert(row);
 if(res.error)throw res.error;f.reset();await reload();notice("התקציב נשמר.")
 }catch(err){notice(authError(err))}finally{button.disabled=false}
});
setupImporter({supabase,notice,reload,getContext:()=>({user,household})});
setupBackup({supabase,getContext:()=>({user,household})});
setupBatches({supabase,notice,reload,getContext:()=>({user,household})});
setupAnalysis({supabase,getContext:()=>({user,household})});
setupHistory({supabase,getContext:()=>({user,household})});
setupCoach({supabase,getContext:()=>({user,household})});
setupCategoryDashboard({supabase,reload,getContext:()=>({user,household})});
setupIncomeManagement({supabase,notice,reload,getContext:()=>({user,household}),getData:()=>data});
defaultDates();
$("recurring-income-form").elements.start_month.value=$("month").value;
$("fixed-form").elements.start_month.value=$("month").value;
(async()=>{
 try{const {data:d,error}=await supabase.auth.getSession();if(error)throw error;await showFor(d.session?.user||null);
  supabase.auth.onAuthStateChange((event,session)=>{
   if(event==="SIGNED_OUT"){user=null;household=null;view("auth-view")}
   else if(event==="SIGNED_IN"||event==="TOKEN_REFRESHED"){setTimeout(()=>{if(!household&&session?.user)showFor(session.user)},0)}
  });
 }catch(err){view("auth-view");notice("שגיאה בחיבור לשירות ההתחברות. נסה לטעון את הדף מחדש.","auth-error")}
})();
