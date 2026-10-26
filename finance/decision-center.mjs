import {reconcileSources} from "./reconciliation-core.mjs";
import {householdBalance} from "./household-ledger.mjs";
import {spendingForecast} from "./coach-engine.mjs";

export const formatILS = agorot => new Intl.NumberFormat("he-IL",{
 style:"currency",currency:"ILS",minimumFractionDigits:0,maximumFractionDigits:2
}).format((Number(agorot)||0)/100);
export function addMonth(month,delta){
 if(!/^20\d{2}-(0[1-9]|1[0-2])$/.test(String(month)))throw Error("Invalid month");
 const y=+month.slice(0,4),m=+month.slice(5);
 const date=new Date(Date.UTC(y,m-1+delta,1));
 return String(date.getUTCFullYear())+"-"+String(date.getUTCMonth()+1).padStart(2,"0");
}
const safeAmount=n=>Number.isSafeInteger(Number(n))?Number(n):0;
const signed=t=>(t.entry_kind==="refund"?-1:1)*safeAmount(t.amount_agorot);
const dated=t=>String(t.occurred_on||"").slice(0,7);
const norm=s=>String(s||"").trim().replace(/\s+/g," ").toLocaleLowerCase("he-IL");
export function auditHealth(audit=[]){
 const results=reconcileSources(audit||[]);
 const disputed=results.filter(x=>!["source_matched"].includes(x.status));
 const missing=!results.length;
 const gap=results.filter(x=>x.gapAgorot!==null && x.gapAgorot!==0)
  .reduce((s,x)=>s+Math.abs(x.gapAgorot),0);
 return {status:missing?"missing":disputed.length?"review":"verified_from_file",
  sourceCount:results.length, flagged:disputed.length, gapAgorot:gap,
  items:disputed.map(x=>({label:x.label,status:x.status,gapAgorot:x.gapAgorot,
   differentHeaderClaims:x.differentHeaderClaims}))};
}
/* A recurring signal is not proof of a subscription. Require three distinct
   consecutive transaction months and exactly one charge per merchant per month. */
export function recurringPayments(rows=[],month){
 const byMerchant=new Map();
 for(const t of rows){
  if(t.entry_kind==="refund"||safeAmount(t.amount_agorot)<=0||
     Number(t.installment_total||0)>1)continue;
  const date=dated(t),merchant=String(t.merchant||"").trim();
  if(!/^20\d{2}-(0[1-9]|1[0-2])$/.test(date)||!merchant||
    /^(לא ידוע|אחר|ידני)$/i.test(merchant)||date>month)continue;
  const key=norm(merchant);
  if(!byMerchant.has(key))byMerchant.set(key,[]);
  byMerchant.get(key).push({month:date,amount:safeAmount(t.amount_agorot),merchant});
 }
 const recurring=[];
 for(const [key,items] of byMerchant){
  const counts=new Map();
  for(const item of items)counts.set(item.month,[...(counts.get(item.month)||[]),item]);
  const months=[...counts.keys()].sort();
  for(let i=months.length-1;i>=2;i--){
   const last=months[i],mid=months[i-1],first=months[i-2];
   if(addMonth(last,-1)!==mid||addMonth(mid,-1)!==first)continue;
   if([first,mid,last].some(m=>counts.get(m).length!==1))continue;
   const a=counts.get(first)[0],b=counts.get(mid)[0],c=counts.get(last)[0];
   const baseline=Math.round((a.amount+b.amount)/2);
   if(!baseline||Math.abs(a.amount-b.amount)>Math.max(150,baseline*.12))continue;
   const delta=c.amount-baseline;
   if(c.amount>baseline*1.8||c.amount<baseline*.5)continue;
   const increase=delta>=Math.max(1000,baseline*.08);
   recurring.push({key,merchant:c.merchant,amountAgorot:c.amount,baselineAgorot:baseline,
     increaseAgorot:increase?delta:0,months:[first,mid,last],
     lastMonth:last,likelyCurrent:last>=addMonth(month,-1)});
   break;
  }
 }
 return recurring.sort((a,b)=>b.increaseAgorot-a.increaseAgorot||b.amountAgorot-a.amountAgorot).slice(0,12);
}
export function buildAlerts({month,data,history=[],basis="statement"}){
 const audit=auditHealth(data.audit);
 const list=[];
 const add=(id,level,title,detail,target)=>list.push({id,level,title,detail,target});
 if(audit.status==="missing"&&basis==="statement"){
  add("quality-missing","info","לא נמצאו דוחות מקור לחודש זה",
    "ללא דוח מקור לא ניתן לאמת שכל העסקאות נקלטו; היעדר דוח אינו אפס הוצאות.","statements");
 }else if(audit.status==="review"){
  add("quality-review","warning","נדרשת בדיקה של "+audit.flagged+" מקורות אשראי",
    "למקורות נמצאו הפרשים או נתוני בקרה חסרים"+(audit.gapAgorot?" (פערים מוחלטים: "+formatILS(audit.gapAgorot)+")":"")+
    ". אין ליצור עסקאות משוערות כדי לסגור את ההפרש.","statements");
 }
 const totals=new Map();
 for(const t of data.transactions||[]){
  const c=String(t.category||"אחר");
  totals.set(c,(totals.get(c)||0)+signed(t));
 }
 for(const b of data.budgets||[]){
  const cap=safeAmount(b.amount_agorot),spent=totals.get(b.category)||0;
  if(cap<=0)continue;
  const percent=Math.round(spent/cap*100);
  if(spent>cap)add("budget:"+b.category,"warning","חריגה מהתקציב: "+b.category,
   "נרשמו "+formatILS(spent)+" מול תקציב "+formatILS(cap)+" (חריגה "+formatILS(spent-cap)+").","budgets");
  else if(percent>=80)add("budget:"+b.category,"info","מתקרבים לתקציב: "+b.category,
   "נוצלו "+percent+"% מהמסגרת, לפי עסקאות שנקלטו עד כה.","budgets");
 }
 const recurring=recurringPayments(history,month);
 for(const t of recurring.filter(x=>x.increaseAgorot>0&&x.likelyCurrent).slice(0,2)){
  add("price:"+t.key,"info","עליית מחיר אפשרית: "+t.merchant,
   "החיוב האחרון גבוה בכ-"+formatILS(t.increaseAgorot)+" מחיובים דומים. יש לוודא שאכן מדובר באותו שירות.","planning");
 }
 const severity={warning:0,info:1};
 return {alerts:list.sort((a,b)=>severity[a.level]-severity[b.level]).slice(0,9),
  audit,recurring,totals};
}
export function forecastPanel({month,basis,data,history=[],now=new Date()}){
 const ledger=householdBalance({incomes:data.income,transactions:data.transactions,
  fixed:data.fixed,coverage:data.coverage,month});
 if(basis!=="transaction")return {confidence:"unavailable",reason:"תחזית התנהגות זמינה רק במצב לפי תאריך עסקה.",ledger,forecast:null};
 if(auditHealth(data.audit).status==="review")
  return {confidence:"unavailable",reason:"קיימים פערים בדוחות המקור. יש לפתור אותם לפני תחזית.",ledger,forecast:null};
 const result=spendingForecast({month,current:data.transactions,
  history:history.filter(t=>dated(t)<month),fixed:data.fixed,now});
 return {confidence:result.confidence,reason:result.reason,forecast:result,ledger};
}
export function scenarioImpact({ledger,monthlyAgorot,kind}){
 const amount=safeAmount(monthlyAgorot);
 if(amount<0||amount>1000000000||!["reduce","add"].includes(kind))throw Error("Invalid scenario");
 const change=kind==="reduce"?amount:-amount;
 return {monthlyChangeAgorot:change,annualChangeAgorot:change*12,
  estimatedPlanningBalanceAgorot:safeAmount(ledger.availableAfterProvisions)+change};
}
export function goalProgress(goal,month){
 const target=safeAmount(goal.target_agorot),saved=safeAmount(goal.saved_agorot);
 if(target<=0)throw Error("Invalid goal");
 const remaining=Math.max(0,target-saved);
 let months=null,monthlyRequired=null,overdue=false;
 if(goal.target_month){
  const due=String(goal.target_month).slice(0,7);
  const [y,m]=month.split("-").map(Number),[dy,dm]=due.split("-").map(Number);
  months=(dy-y)*12+dm-m+1;
  overdue=months<=0&&remaining>0;
  monthlyRequired=months>0?Math.ceil(remaining/months):null;
 }
 return {target,saved,remaining,percent:Math.min(100,Math.round(saved/target*100)),
  monthsRemaining:months,monthlyRequired,overdue};
}
export function decisionHighlights({month,data,history=[],basis="statement"}){
 const result=buildAlerts({month,data,history,basis});
 const current=data.transactions||[];
 const largest=new Map();
 for(const t of current)largest.set(t.category,(largest.get(t.category)||0)+signed(t));
 const big=[...largest].filter(x=>x[1]>0).sort((a,b)=>b[1]-a[1])[0];
 const notes=[];
 for(const a of result.alerts.filter(x=>x.level==="warning").slice(0,2))
  notes.push({title:a.title,detail:a.detail,target:a.target,level:"warning"});
 if(notes.length<3&&result.recurring.some(x=>x.likelyCurrent)){
  const recurring=result.recurring.find(x=>x.likelyCurrent);
  notes.push({title:"חיוב חוזר שזוהה לבדיקה",detail:recurring.merchant+
   " • "+formatILS(recurring.amountAgorot)+" בחודש האחרון שנמצא. זו אינדיקציה בלבד.",target:"planning",level:"info"});
 }
 if(notes.length<3&&big)notes.push({title:"קטגוריית ההוצאה המרכזית",detail:
  big[0]+": "+formatILS(big[1])+" בעסקאות שנקלטו.",target:"planning",level:"info"});
 if(notes.length===0)notes.push({title:"הנתונים עדיין חלקיים",
  detail:"ניתן להשלים דוחות ותקציבים כדי לראות תובנות מתאימות.",target:"import",level:"info"});
 return {notes:notes.slice(0,3),alerts:result.alerts,
  recurring:result.recurring,audit:result.audit};
}
