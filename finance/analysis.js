import {generateInsights,ILS} from "./financial-insights.mjs";
const $=id=>document.getElementById(id);
let runtime=null,seq=0;
function text(tag,value,cls){const e=document.createElement(tag);if(cls)e.className=cls;e.textContent=value;return e}
function safeRender(previous,curr,month){
 const {summary,insights,comparisonLabel}=generateInsights({current:curr.transactions,previous,budgets:curr.budgets,month});
 const panel=$("advanced-insights"),top=$("merchant-leaders"),over=$("analysis-overview"); if(!panel||!top||!over)return;
 const intro=summary.spent>0?"נרשמו הוצאות נטו בסך "+ILS(summary.spent)+". התובנות נשענות על העסקאות הזמינות בלבד.":"העלו דוח אשראי כדי לקבל תמונה מעשית של הרגלי ההוצאות.";
 over.textContent=intro;
 panel.replaceChildren(...insights.map(ins=>{
  const d=document.createElement("article");d.className="smart-insight";
  const pill=text("span",ins.kind==="budget"?"חריגת תקציב":ins.kind==="jump"?"עלייה בהוצאה":ins.kind==="saving"?"פוטנציאל חיסכון":"ממצא","smart-pill "+(ins.priority>=3?"urgent":""));
  const h=text("h3",ins.title),p=text("p",ins.body),action=text("small",ins.action);
  d.append(pill,h,p,action);return d;
 }));
 const strongest=summary.merchants.filter(([,amount])=>amount>0).slice(0,6);
 const max=strongest[0]?.[1]||0;
 top.replaceChildren(...(strongest.length?strongest.map(([name,amount])=>{
  const d=document.createElement("div");d.className="merchant-row";
  const title=document.createElement("div");title.className="merchant-title";title.append(text("b",name),text("span",ILS(amount)));
  const bar=document.createElement("div");bar.className="bar";const fill=document.createElement("div");fill.className="bar-fill";fill.style.width=Math.max(0,Math.min(100,amount/max*100))+"%";bar.append(fill);
  d.append(title,bar);return d;
 }):[text("p","אין עסקאות בחודש שנבחר.","empty")]));
 const comparison=$("analysis-compare");comparison.textContent="השוואת הוצאות בקטגוריות מול "+comparisonLabel+". אם חסרים דוחות, ההשוואה חלקית.";
 const categories=$("comparison-list");categories.replaceChildren();
 const clock=new Date();const actualMonth=[clock.getFullYear(),String(clock.getMonth()+1).padStart(2,"0")].join("-");
 const comparableMonth=month===actualMonth?previous.filter(t=>Number(String(t.occurred_on).slice(-2))<=clock.getDate()):previous;
 const prevCat=new Map((comparableMonth||[]).reduce((list,t)=>{const category=t.category||"אחר",v=t.entry_kind==="refund"?-t.amount_agorot:t.amount_agorot;const existing=list.find(x=>x[0]===category);if(existing)existing[1]+=v;else list.push([category,v]);return list},[]));
 for(const [name,amount] of summary.categories.filter(x=>x[1]>0).slice(0,7)){
  const prevAmount=prevCat.get(name)||0;
  const d=document.createElement("div");d.className="line-item";
  const info=document.createElement("div");
  info.append(text("b",name),text("small","חודש קודם "+ILS(prevAmount)));
  const right=document.createElement("div");right.className="analysis-delta";right.append(text("b",ILS(amount)));
  if(prevAmount>0){const diff=amount-prevAmount,pc=Math.round(diff/prevAmount*100);const chip=text("small",(diff>=0?"+":"")+pc+"%");if(diff>0)chip.className="negative";else chip.className="positive";right.append(chip)}
  d.append(info,right);categories.append(d);
 }
 if(!categories.children.length)categories.append(text("p","אין עסקאות להשוואה.","empty"));
}
export function setupAnalysis(context){
 runtime=context;
 document.addEventListener("tevuna:loaded",async e=>{
  const {data,month,household}=e.detail||{};if(!household||!data)return;
  const current=++seq;
  if($("date-basis").value==="billing"){
   $("analysis-error").textContent="המלצות על התנהגות קנייה זמינות לפי תאריך עסקה; השוואת חודשי חיוב זמינה במסך 'השוואת חודשים'.";
   $("analysis-overview").textContent="הצגה לפי חודש חיוב: לא מחשבים כאן מגמות קנייה לפי תאריך אחר.";
   $("advanced-insights").replaceChildren();
   $("merchant-leaders").replaceChildren();
   $("analysis-compare").textContent="מגמות חיוב מוצגות במסך השוואת חודשים";
   $("comparison-list").replaceChildren();
   return;
  }
  const [yy,mm]=month.split("-").map(Number);
  const prevMonth=mm===1?[yy-1,12]:[yy,mm-1];
  const prevKey=prevMonth[0]+"-"+String(prevMonth[1]).padStart(2,"0");
  const {data:previous,error}=await runtime.supabase.from("tevuna_transactions")
    .select("merchant,category,amount_agorot,entry_kind,occurred_on")
    .eq("household_id",household)
    .gte("occurred_on",prevKey+"-01").lt("occurred_on",month+"-01")
    .limit(1000);
  if(current!==seq)return;
  $("analysis-error").textContent=error?"השוואת חודש קודם אינה זמינה כרגע. מידע מהחודש הנבחר עדיין מוצג.":"";
  safeRender(error?[]:previous||[],data,month);
 });
}
