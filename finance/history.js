import {makeTimeline,compareMonthly,actionableMonthlyNotes,addMonths,formatILS,percentChange,applyFixedToTimeline} from "./financial-trends.mjs";
const $=id=>document.getElementById(id);
let runtime=null,requestId=0,months=[],focus="",today=new Date();
const formatMonth=key=>{const [y,m]=key.split("-").map(Number);return new Intl.DateTimeFormat("he-IL",{month:"short",year:"numeric"}).format(new Date(y,m-1,1));};
function element(tag,value,cls){const e=document.createElement(tag);e.textContent=value??"";if(cls)e.className=cls;return e;}
function boxEmpty(target,label){target.replaceChildren(element("p",label,"empty"));}
function clsFor(n){return n>0?"negative":n<0?"positive":""}
function differenceLabel(value,available=true){return !available||value===null?"—":(value>=0?"+":"-")+formatILS(Math.abs(value))}
function formatPerc(value){return value===null?"—":(value>=0?"+":"")+value+"%";}
function active(){return !($("history")?.classList.contains("hidden"))}
async function fetchPaged(table,columns,from,to,field){
 const data=[];
 for(let offset=0;offset<15000;offset+=1000){
  const {data:part,error}=await runtime.supabase.from(table).select(columns)
   .eq("household_id",runtime.getContext().household)
   .gte(field,from).lt(field,to).order(field,{ascending:true}).order("id",{ascending:true}).range(offset,offset+999);
  if(error)throw error;
  data.push(...(part||[]));
  if(!part||part.length<1000)return data;
 }
 throw Error("נמצאו יותר מ-15,000 רשומות. לא ניתן להציג סיכום מלא; פצלו את טווח התאריכים.");
}
async function loadHistory(){
 if(!runtime?.getContext().household||!active())return;
 const ticket=++requestId;
 const count=Number($("history-months").value)||6;
 const endMonth=$("month").value;
 if(!/^\d{4}-\d{2}$/.test(endMonth))return;
 $("history-error").textContent="טוען נתוני חודשים…";
 const from=addMonths(endMonth,-count)+"-01",to=addMonths(endMonth,1)+"-01";
 try{
  const {household}=runtime.getContext();
  const billing=$("date-basis").value==="billing";
  const cardSource=billing?fetchPaged("tevuna_transactions","id,occurred_on,billing_month,category,merchant,entry_kind,amount_agorot,source",from,to,"billing_month"):
   fetchPaged("tevuna_transactions","id,occurred_on,billing_month,category,merchant,entry_kind,amount_agorot",from,to,"occurred_on");
  const [txSource,income,fixedResponse,coverageResponse]=await Promise.all([
   cardSource,
   fetchPaged("tevuna_incomes","id,income_month,label,received,amount_agorot",from,to,"income_month"),
   runtime.supabase.from("tevuna_fixed_expenses").select("id,label,amount_agorot,cadence,active,start_month,end_month").eq("household_id",household),
   runtime.supabase.from("tevuna_fixed_expense_card_coverage")
    .select("fixed_expense_id,transaction_id,expense_month")
    .eq("household_id",household).gte("expense_month",from).lt("expense_month",to)
  ]);
  if(fixedResponse.error)throw fixedResponse.error;
  if(coverageResponse.error)throw coverageResponse.error;
  let tx=txSource;
  if(billing){
   const manual=await fetchPaged("tevuna_transactions","id,occurred_on,billing_month,category,merchant,entry_kind,amount_agorot",from,to,"occurred_on");
   const byId=new Map();
   for(const t of txSource.filter(t=>t.source!=="manual"))
    byId.set(t.id,{...t,occurred_on:t.billing_month||t.occurred_on});
   for(const t of manual.filter(t=>t.source==="manual"))
    byId.set(t.id,t);
   tx=[...byId.values()];
  }
  if(ticket!==requestId)return;
  today=new Date();
  months=applyFixedToTimeline(makeTimeline({transactions:tx,incomes:income,endMonth,count:count+1,now:today}),
   {fixed:fixedResponse.data||[],coverage:coverageResponse.data||[],now:today});
  $("history-error").textContent="";
  const select=$("history-focus-month");select.replaceChildren();
  for(const m of months.slice(1).reverse()){const opt=element("option",formatMonth(m.key)+(m.partial?" • חודש פתוח":"" ));opt.value=m.key;select.append(opt)}
  focus=endMonth;select.value=focus;
  render();
 }catch(e){if(ticket!==requestId)return;$("history-error").textContent="לא ניתן לטעון את המגמות: "+String(e?.message||e).slice(0,170)}
}
function createCard(title,value,sub,css){
 const d=element("div","","box history-card");d.append(element("span",title));
 d.append(element("strong",value,"history-main-value "+(css||"")));
 d.append(element("small",sub));return d;
}
function render(){
 if(!months.length)return;
 const display=months.slice(1);
 const expMonths=display.filter(x=>x.hasExpenseData).length;
 const incomeMonths=display.filter(x=>x.hasIncomeData).length;
 const expTotal=display.reduce((a,m)=>a+m.expenses,0),incomeTotal=display.reduce((a,m)=>a+m.income,0);
 if(unknownMonths>0)$("history-coverage").textContent+=" • ב-"+unknownMonths+" חודשים חסר תאריך תחילה של התחייבות קיימת, ולכן היתרה לתכנון אינה מוצגת בהם עד לעדכון ההתחייבויות.";
 $("history-coverage").textContent="קיימים דיווחי עסקאות ב-"+expMonths+" מתוך "+display.length+" חודשים והכנסות ב-"+incomeMonths+" חודשים. חישוב היתרה אפשרי רק ב-"+display.filter(x=>x.fullBalanceCoverage).length+" חודשים שבהם יש את שניהם. ההתחייבויות קבועות עם תאריכי תוקף משויכות רק לחודשים המתאימים. חודש בלי פירוט אינו חודש עם אפס הוצאות.";
 const covered=display.filter(m=>m.fullBalanceCoverage);
 const totalReserved=covered.reduce((sum,m)=>sum+m.unlinkedFixed,0);
 $("history-cards").replaceChildren(
  createCard("הכנסות שהתקבלו בתקופה",formatILS(incomeTotal),incomeMonths+" חודשים עם הכנסות מדווחות"),
  createCard("עסקאות אשראי בתקופה",formatILS(expTotal),expMonths+" חודשים עם עסקאות נטו"),
  createCard("קבועות נוספות לתכנון",formatILS(totalReserved),"ב-"+covered.length+" חודשים מכוסים בלבד • אחרי התאמות לאשראי"),
  createCard("יתרה לתכנון אחרי התחייבויות",covered.length?formatILS(covered.reduce((sum,m)=>sum+m.plannedBalance,0)):"אין מספיק נתונים",
    "מחושב עבור "+covered.length+" חודשים מכוסים בלבד • לא יתרת בנק",
    covered.length&&covered.reduce((sum,m)=>sum+m.plannedBalance,0)<0?"negative":"positive")
 );
 // side-by-side bars have one shared monetary scale to prevent confusing visuals
 const chart=$("history-chart");chart.replaceChildren();
 const largest=Math.max(1,...display.flatMap(m=>[m.income,m.hasExpenseData?m.spendingWithFixed:m.unlinkedFixed]).filter(Number.isFinite));
 for(const m of display){
  const column=element("div","","history-column");
  const cardLabel=m.hasExpenseData?formatILS(m.expenses):"חסרות עסקאות";
  column.setAttribute("aria-label",formatMonth(m.key)+" הכנסות "+(m.hasIncomeData?formatILS(m.income):"חסרות")+
   ", עסקאות אשראי "+cardLabel+", התחייבויות קבועות נוספות "+formatILS(m.unlinkedFixed)+
   (m.hasExpenseData?", הוצאות לתכנון "+formatILS(m.spendingWithFixed):", הוצאות לתכנון אינן מלאות"));
  const group=element("div","","history-bars");
  const expenseStack=element("div","","history-expense-stack");
  const creditPart=element("div","","history-expense-credit"+(!m.hasExpenseData?" unreported":""));
  const fixedPart=element("div","","history-expense-fixed");
  const incBar=element("div","","history-bar income"+(!m.hasIncomeData?" unreported":""));
  creditPart.style.height=(m.hasExpenseData?Math.max(2,Math.max(0,m.expenses)/largest*145):3)+"px";
  fixedPart.style.height=m.unlinkedFixed>0?Math.max(2,m.unlinkedFixed/largest*145)+"px":"0px";
  expenseStack.title="עסקאות אשראי: "+cardLabel+"; התחייבויות נוספות: "+formatILS(m.unlinkedFixed)+
   (m.hasExpenseData?"; ביחד לתכנון: "+formatILS(m.spendingWithFixed):"; לא הוזנו עסקאות אשראי לחודש");
  incBar.style.height=(m.hasIncomeData?Math.max(3,Math.max(0,m.income)/largest*145):3)+"px";
  incBar.title=m.hasIncomeData?"הכנסות "+formatILS(m.income):"חסרות הכנסות";
  expenseStack.append(creditPart,fixedPart);
  group.append(expenseStack,incBar);
  const label=element("button",formatMonth(m.key).split(" ")[0]+(m.partial?"*":""),"history-month-button"+(m.key===focus?" selected":""));
  label.type="button";label.title="הצגת פירוט "+formatMonth(m.key);label.addEventListener("click",()=>{focus=m.key;$("history-focus-month").value=focus;render()});
  column.append(group,label);chart.append(column);
 }
 const table=$("history-table");table.replaceChildren();
 for(const m of [...display].reverse()){
  const row=document.createElement("tr");
  const prev=months.find(x=>x.key===addMonths(m.key,-1));
  const compare=compareMonthly({timeline:months,month:m.key,now:today});
  const monthCell=element("td",formatMonth(m.key)+(m.partial?" • חלקי":""));
  const expenses=element("td",m.hasExpenseData?formatILS(m.expenses):"אין דיווח");
  const income=element("td",m.hasIncomeData?formatILS(m.income):"אין דיווח");
  const fixedPlan=element("td",m.fixedHistoryUnknown?"דורש תאריך תחילה":formatILS(m.unlinkedFixed),"history-fixed-val");
  const totalSpend=element("td",m.fixedHistoryUnknown?"תוקף קבועות לא ידוע":m.hasExpenseData?formatILS(m.spendingWithFixed):"חסר פירוט");
  const difference=element("td",m.plannedBalance===null?"אין נתונים מאומתים":formatILS(m.plannedBalance),
   m.plannedBalance!==null?m.plannedBalance>=0?"positive":"negative":"");
  const expDiff=element("td",compare?.covered?differenceLabel(compare.expenseDifference)+" ("+formatPerc(compare.expensePercent)+")":"אין בסיס");
  const incomeDiff=element("td",compare?.incomeCovered?differenceLabel(compare.incomeDifference)+" ("+formatPerc(compare.incomePercent)+")":"אין בסיס");
  expDiff.className=compare?.covered?clsFor(compare.expenseDifference):"";
  incomeDiff.className=compare?.incomeCovered?(compare.incomeDifference<0?"negative":compare.incomeDifference>0?"positive":""):"";
  row.append(monthCell,income,expenses,fixedPlan,totalSpend,difference,expDiff,incomeDiff);
  row.addEventListener("click",()=>{focus=m.key;$("history-focus-month").value=focus;render()});
  row.className="history-trow"+(focus===m.key?" is-selected":"");
  table.append(row);
 }
 renderDetails();
}
function renderDetails(){
 const compare=compareMonthly({timeline:months,month:focus,now:today});
 const target=$("history-category-compare");target.replaceChildren();
 if(!compare)return;
 const head=$("history-compare-description");
 head.textContent="השוואת "+formatMonth(focus)+" לעומת "+formatMonth(compare.previous)+(compare.sameDay?" עד אותו יום":"")+". עליות וירידות מוצגות רק בהינתן עסקאות בשני החודשים.";
 $("history-income-compare").textContent=compare.incomeCovered
  ?"הכנסות: "+differenceLabel(compare.incomeDifference)+" ("+formatPerc(compare.incomePercent)+")":"הכנסות: חסרים נתונים באחד מהחודשים";
 const current=months.find(x=>x.key===focus);
 $("history-fixed-compare").textContent=current?.fixedHistoryUnknown?"לא ניתן לחשב התחייבויות היסטוריות: יש להגדיר תאריך תחילה בהוצאות קבועות.":current
  ?"קבועות נוספות לתכנון: "+formatILS(current.unlinkedFixed)+" (מתוך "+formatILS(current.monthlyFixedPlan)+" קבועות חודשיות; "+formatILS(current.linkedFixed)+" כבר כלולות בעסקאות אשראי)"
  :"לא נמצאו נתוני התחייבויות";
 $("history-expense-compare").textContent=compare.covered
  ?"הוצאות: "+differenceLabel(compare.expenseDifference)+" ("+formatPerc(compare.expensePercent)+")":"הוצאות: חסרים נתונים באחד מהחודשים";
 if(!compare.covered){boxEmpty(target,"לצורך השוואת קטגוריות, יש לייבא עסקאות לשני החודשים. מידע חסר אינו נספר כאפס.");}
 else {
  for(const cat of compare.categoryChanges){
   const row=element("div","","category-change-row");
   const side=element("div","","category-change-name");
   side.append(element("b",cat.category),element("small",formatILS(cat.previous)+" ← "+formatILS(cat.amount)));
   const delta=element("div","","category-change-amount "+clsFor(cat.difference));
   delta.append(element("b",differenceLabel(cat.difference)),element("small",cat.previous<=0?"קטגוריה חדשה בדיווח":formatPerc(cat.percent)));
   row.append(side,delta);target.append(row);
  }
  if(!compare.categoryChanges.length)boxEmpty(target,"אין עסקאות לניתוח.");
 }
 const notePanel=$("history-notes");notePanel.replaceChildren();
 const notes=actionableMonthlyNotes(months,compare);
 for(const note of notes){
  const d=element("div","","trend-note "+note.level);
  d.append(element("b",note.title),element("p",note.message));notePanel.append(d);
 }
 if(!notes.length)boxEmpty(notePanel,"אין מספיק נתונים לניתוח נוסף.");
}
export function setupHistory(context){
 runtime=context;
 $("history-months").addEventListener("change",loadHistory);
 $("history-focus-month").addEventListener("change",e=>{focus=e.target.value;render()});
 document.addEventListener("tevuna:screen-changed",e=>{if(e.detail?.screen==="history")loadHistory()});
 document.addEventListener("tevuna:loaded",()=>{if(active())loadHistory()});
 $("date-basis").addEventListener("change",()=>{if(active())loadHistory()});
}
