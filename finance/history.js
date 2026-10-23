import {makeTimeline,compareMonthly,actionableMonthlyNotes,addMonths,formatILS,percentChange} from "./financial-trends.mjs";
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
  const [tx,income]=await Promise.all([
   fetchPaged("tevuna_transactions","id,occurred_on,category,merchant,entry_kind,amount_agorot",from,to,"occurred_on"),
   fetchPaged("tevuna_incomes","id,income_month,label,received,amount_agorot",from,to,"income_month")
  ]);
  if(ticket!==requestId)return;
  today=new Date();
  months=makeTimeline({transactions:tx,incomes:income,endMonth,count:count+1,now:today});
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
 $("history-coverage").textContent="בטווח שנבחר קיימים דיווחי עסקאות ב-"+expMonths+" מתוך "+display.length+" חודשים והכנסות ב-"+incomeMonths+" חודשים. חודש ללא נתונים אינו בהכרח חודש ללא הוצאות או הכנסות.";
 $("history-cards").replaceChildren(
  createCard("הוצאות שנרשמו בתקופה",formatILS(expTotal),expMonths+" חודשים עם עסקאות"),
  createCard("הכנסות שהתקבלו בתקופה",formatILS(incomeTotal),incomeMonths+" חודשים עם דיווח הכנסה"),
  createCard("הפרש בתקופה שבה יש שני סוגי נתונים",formatILS(display.reduce((s,m)=>s+(m.balance??0),0)),display.filter(m=>m.balance!==null).length+" חודשים מכוסים • לא יתרת הבנק"),
  createCard("חודשי כיסוי",expMonths+" / "+display.length,"נתוני עסקאות; פרטי כיסוי בהמשך")
 );
 // side-by-side bars have one shared monetary scale to prevent confusing visuals
 const chart=$("history-chart");chart.replaceChildren();
 const largest=Math.max(1,...display.flatMap(m=>[m.income,m.expenses]).filter(Number.isFinite));
 for(const m of display){
  const column=element("div","","history-column");
  column.setAttribute("aria-label",formatMonth(m.key)+" הוצאות "+(m.hasExpenseData?formatILS(m.expenses):"חסרות")+" הכנסות "+(m.hasIncomeData?formatILS(m.income):"חסרות"));
  const group=element("div","","history-bars");
  const expBar=element("div","","history-bar expense"+(!m.hasExpenseData?" unreported":""));
  const incBar=element("div","","history-bar income"+(!m.hasIncomeData?" unreported":""));
  expBar.style.height=(m.hasExpenseData?Math.max(3,Math.max(0,m.expenses)/largest*145):3)+"px";
  incBar.style.height=(m.hasIncomeData?Math.max(3,Math.max(0,m.income)/largest*145):3)+"px";
  expBar.title=m.hasExpenseData?"הוצאות "+formatILS(m.expenses):"חסרות עסקאות";
  incBar.title=m.hasIncomeData?"הכנסות "+formatILS(m.income):"חסרות הכנסות";
  group.append(expBar,incBar);
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
  const difference=element("td",m.balance===null?"לא זמין":formatILS(m.balance),m.balance!==null?m.balance>=0?"positive":"negative":"");
  const expDiff=element("td",compare?.covered?differenceLabel(compare.expenseDifference)+" ("+formatPerc(compare.expensePercent)+")":"אין בסיס");
  const incomeDiff=element("td",compare?.incomeCovered?differenceLabel(compare.incomeDifference)+" ("+formatPerc(compare.incomePercent)+")":"אין בסיס");
  expDiff.className=compare?.covered?clsFor(compare.expenseDifference):"";
  incomeDiff.className=compare?.incomeCovered?(compare.incomeDifference<0?"negative":compare.incomeDifference>0?"positive":""):"";
  row.append(monthCell,income,expenses,difference,expDiff,incomeDiff);
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
}
