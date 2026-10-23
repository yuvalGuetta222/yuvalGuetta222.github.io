import {householdBalance} from "./household-ledger.mjs";
/* Financial timeline: deterministic, no AI inference and no external financial data. */
export const formatILS=agorot=>new Intl.NumberFormat("he-IL",{style:"currency",currency:"ILS",maximumFractionDigits:0}).format((Number(agorot)||0)/100);
export const amountDifference=(current,previous)=>current-previous;
export function addMonths(month,delta){
 const match=/^(\d{4})-(0[1-9]|1[0-2])$/.exec(String(month));
 if(!match)throw new Error("Invalid YYYY-MM month");
 const total=Number(match[1])*12+(Number(match[2])-1)+delta;
 const year=Math.floor(total/12),mm=(total%12+12)%12+1;
 return String(year).padStart(4,"0")+"-"+String(mm).padStart(2,"0");
}
export function percentChange(current,previous){
 if(!Number.isFinite(current)||!Number.isFinite(previous)||previous<=0)return null;
 return Math.round((current-previous)/previous*100);
}
const expenseSign=t=>t.entry_kind==="refund"?-1:1;
function makeMonth(key){return {key,transactions:[],incomes:[],expenseCount:0,incomeCount:0,expenses:0,income:0,unreceivedIncome:0,categories:new Map(),merchants:new Map(),hasExpenseData:false,hasIncomeData:false,balance:null}}
export function makeTimeline({transactions=[],incomes=[],endMonth,count=6,now=new Date()}){
 if(!Number.isInteger(count)||count<1||count>24)throw new Error("count must be 1..24");
 const months=Array.from({length:count},(_,index)=>makeMonth(addMonths(endMonth,index+1-count)));
 const index=new Map(months.map(m=>[m.key,m]));
 for(const t of transactions){
  const m=index.get(String(t.occurred_on||"").slice(0,7));
  if(!m)continue;
  const amount=Number(t.amount_agorot)||0;
  const signed=expenseSign(t)*amount;
  m.transactions.push(t);m.expenseCount++;m.expenses+=signed;m.hasExpenseData=true;
  const category=String(t.category||"אחר");
  m.categories.set(category,(m.categories.get(category)||0)+signed);
  const merchant=String(t.merchant||"לא ידוע");
  m.merchants.set(merchant,(m.merchants.get(merchant)||0)+signed);
 }
 for(const i of incomes){
  const m=index.get(String(i.income_month||"").slice(0,7));
  if(!m)continue;
  const amount=Number(i.amount_agorot)||0;
  m.incomes.push(i);m.incomeCount++;m.hasIncomeData=true;
  if(i.received)m.income+=amount;else m.unreceivedIncome+=amount;
 }
 for(const m of months){
  if(m.hasIncomeData&&m.hasExpenseData)m.balance=m.income-m.expenses;
 }
 const nowMonth=[now.getFullYear(),String(now.getMonth()+1).padStart(2,"0")].join("-");
 return months.map(m=>({...m,partial:m.key===nowMonth}));
}
/**
 * Reconciles each month independently with its specific confirmed credit links.
 * Important limitation: current fixed-expense templates do not contain historical
 * effective dates; applying them to older months is a planning scenario, not
 * evidence those commitments existed in those months.
 */
export function applyFixedToTimeline(timeline,{fixed=[],coverage=[]}={}){
 return timeline.map(m=>{
  const monthCoverage=coverage.filter(x=>String(x.expense_month||"").slice(0,7)===m.key);
  const ledger=householdBalance({incomes:m.incomes,transactions:m.transactions,fixed,coverage:monthCoverage});
  return {...m,monthlyFixedPlan:ledger.planned,linkedFixed:ledger.matched,
   unlinkedFixed:ledger.unmatched,
   spendingWithFixed:m.hasExpenseData?ledger.recordedSpending+ledger.unmatched:null,
   plannedBalance:m.hasIncomeData&&m.hasExpenseData?ledger.availableAfterProvisions:null,
   fullBalanceCoverage:m.hasIncomeData&&m.hasExpenseData};
 });
}
export function compareMonthly({timeline,month,now=new Date()}){
 const current=timeline.find(m=>m.key===month);
 const prevKey=addMonths(month,-1);
 const prev=timeline.find(m=>m.key===prevKey);
 if(!current)return null;
 const sameDay=(month===[now.getFullYear(),String(now.getMonth()+1).padStart(2,"0")].join("-"));
 const comparisonRows=sameDay&&prev?prev.transactions.filter(t=>Number(String(t.occurred_on).slice(-2))<=now.getDate()):prev?.transactions||[];
 const prevCategories=new Map();
 let previousExpenses=0;
 for(const t of comparisonRows){
  const val=expenseSign(t)*(Number(t.amount_agorot)||0),cat=t.category||"אחר";
  previousExpenses+=val;prevCategories.set(cat,(prevCategories.get(cat)||0)+val);
 }
 const categories=[...new Set([...current.categories.keys(),...prevCategories.keys()])]
  .map(category=>{const amount=current.categories.get(category)||0,previous=prevCategories.get(category)||0;
   return {category,amount,previous,difference:amount-previous,percent:percentChange(amount,previous)};})
  .filter(x=>x.amount!==0||x.previous!==0)
  .sort((a,b)=>Math.abs(b.difference)-Math.abs(a.difference));
 const covered=Boolean(current.hasExpenseData&&prev?.hasExpenseData);
 const incomeCovered=Boolean(current.hasIncomeData&&prev?.hasIncomeData);
 return {month,previous:prevKey,sameDay,covered,incomeCovered,categoryChanges:categories,
  expenseDifference:covered?current.expenses-previousExpenses:null,
  expensePercent:covered?percentChange(current.expenses,previousExpenses):null,
  previousExpenses:covered?previousExpenses:null,
  incomeDifference:incomeCovered?current.income-prev.income:null,
  incomePercent:incomeCovered?percentChange(current.income,prev.income):null,
  // Both months must have income and expense records for an available balance comparison.
  balanceDifference:incomeCovered&&covered&&current.balance!==null&&prev.balance!==null?current.balance-prev.balance:null};
}
export function actionableMonthlyNotes(timeline,comparison){
 const notes=[];
 if(!comparison)return notes;
 const current=timeline.find(m=>m.key===comparison.month);
 if(current?.partial)notes.push({level:"neutral",title:"החודש עדיין לא הסתיים",message:"נתוני ההוצאות וההכנסות של החודש הנוכחי חלקיים. הוצאות מושוות לעסקאות עד אותו יום בחודש הקודם; הכנסות מוצגות לפי החודש כולו."});
 if(!comparison.covered){
  notes.push({level:"neutral",title:"חסר פירוט להשוואת הוצאות",message:"יש לייבא עסקאות בשני החודשים הרלוונטיים. לא ניתן להסיק שהוצאה נעלמה רק כי לא יובא דוח."});
 }else{
  const rises=comparison.categoryChanges.filter(x=>x.difference>15000&&x.previous>0).sort((a,b)=>b.difference-a.difference);
  const falls=comparison.categoryChanges.filter(x=>x.difference< -15000&&x.previous>0).sort((a,b)=>a.difference-b.difference);
  if(rises.length){const x=rises[0];notes.push({level:"warning",title:"הגידול הבולט: "+x.category,message:"עלייה של "+formatILS(x.difference)+" לעומת החודש הקודם. בדקו אם מדובר בהוצאה חד-פעמית, בהבדל בתאריכי חיוב או בשינוי בהרגלים."});}
  if(falls.length){const x=falls[0];notes.push({level:"positive",title:"הירידה הבולטת: "+x.category,message:"ירידה של "+formatILS(-x.difference)+". כדאי לבדוק אם זו התייעלות קבועה או הוצאה שתופיע בהמשך."});}
 }
 if(comparison.incomeCovered){
  if(comparison.incomeDifference<0)notes.push({level:"neutral",title:"ההכנסה שדווחה פחתה",message:"ההכנסות שהתקבלו נמוכות ב-"+formatILS(-comparison.incomeDifference)+". בדקו הכנסות שטרם התקבלו לפני שמניחים שהייתה ירידה בשכר."});
 }else notes.push({level:"neutral",title:"כדי לנתח שינוי בהכנסות",message:"עדכנו הכנסות בשני החודשים. חוסר דיווח לא נחשב כהכנסה של אפס."});
 if(current?.hasExpenseData&&!current.hasIncomeData)notes.push({level:"neutral",title:"הנתונים עדיין אינם מלאים",message:"אפשר לנתח הוצאות, אבל לא לחשב הפרש מול הכנסות בלי להזין הכנסות חודשיות."});
 return notes.slice(0,5);
}
