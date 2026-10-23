import {applicableRecurring,recurringIncomeSummary} from "./income-utils.mjs";
const $=id=>document.getElementById(id);
const ils=n=>new Intl.NumberFormat("he-IL",{style:"currency",currency:"ILS",maximumFractionDigits:0,maximumFractionDigits:2}).format((Number(n)||0)/100);
let runtime=null;
function el(tag,content,cls){const e=document.createElement(tag);if(content!==null)e.textContent=content;if(cls)e.className=cls;return e;}
function message(t){runtime.notice(t)}
function render(){
 const {household}=runtime.getContext();if(!household)return;
 const data=runtime.getData(),month=$("month").value, summary=recurringIncomeSummary(data.recurring||[],data.income||[],month);
 const target=$("recurring-income-list");target.replaceChildren();
 $("income-pending-summary").textContent=summary.pending>0?"צפוי ועדיין לא סומן כהתקבל: "+ils(summary.pending):"אין כרגע הכנסה קבועה שממתינה לאישור";
 if(!(data.recurring||[]).length){target.append(el("p","לא הגדרתם עדיין הכנסה קבועה.","empty"));return;}
 const active=applicableRecurring(data.recurring,month);
 for(const row of (data.recurring||[])){
   const r=el("div",null,"income-template");
   const details=el("div",null,"income-template-details");
   const isRelevant=active.some(x=>x.id===row.id);
   const posted=(data.income||[]).some(i=>i.recurring_income_id===row.id&&i.received);
   details.append(el("b",row.label),el("small",ils(row.amount_agorot)+" בחודש • מתחיל "+row.start_month.slice(0,7)+(row.end_month?" • עד "+row.end_month.slice(0,7):"")));
   const actions=el("div",null,"income-template-actions");
   const badge=el("span",isRelevant?posted?"התקבלה":"צפויה":"לא פעילה בחודש הזה",isRelevant?(posted?"income-badge received":"income-badge expected"):"income-badge");actions.append(badge);
   if(isRelevant&&!posted){
    const b=el("button","סמן כהתקבלה","primary income-received");b.type="button";
    b.addEventListener("click",async()=>{
     b.disabled=true;
     const {error}=await runtime.supabase.from("tevuna_incomes").insert({
       household_id:household,created_by:runtime.getContext().user.id,
       recurring_income_id:row.id,label:row.label,amount_agorot:row.amount_agorot,
       income_month:month+"-01",received:true
     });
     if(error)message("לא ניתן לאשר הכנסה: "+String(error.message||"שגיאה").slice(0,110));
     else await runtime.reload();
     b.disabled=false;
    });actions.append(b);
   }
   const del=el("button","הסר הגדרה","link template-remove");del.type="button";
   del.title="הסרת הגדרה קבועה לא תמחק הכנסות שכבר התקבלו בחודשים קודמים";
   del.addEventListener("click",async()=>{
    if(!confirm("להסיר את ההכנסה הקבועה '"+row.label+"'? הכנסות שכבר אושרו לא יימחקו."))return;
    del.disabled=true;
    const {error}=await runtime.supabase.from("tevuna_recurring_incomes").delete().eq("household_id",household).eq("id",row.id);
    if(error)message("לא ניתן להסיר את ההגדרה: "+String(error.message).slice(0,110));
    else await runtime.reload();
    del.disabled=false;
   });actions.append(del);
   r.append(details,actions);target.append(r);
 }
}
export function setupIncomeManagement(context){
 runtime=context;
 const form=$("recurring-income-form");
 form.addEventListener("submit",async e=>{
  e.preventDefault();
  const {household,user}=runtime.getContext();if(!household)return;
  const f=new FormData(form),name=String(f.get("label")||"").trim(),amountText=String(f.get("amount")||"");
  const match=/^\d{1,9}(?:\.\d{1,2})?$/.test(amountText);
  const [integer,dec=""]=amountText.split(".");
  const cents=match?(Number(integer)*100+Number(dec.padEnd(2,"0"))):0;
  if(!name||!match||!Number.isSafeInteger(cents)||cents<=0){message("יש להזין שם וסכום תקין.");return}
  const start=f.get("start_month");if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(start)){message("יש לבחור חודש התחלה תקין.");return}
  const submit=form.querySelector('button[type="submit"]');submit.disabled=true;
  const {error}=await runtime.supabase.from("tevuna_recurring_incomes")
   .insert({household_id:household,created_by:user.id,label:name,amount_agorot:cents,start_month:start+"-01"});
  if(error)message("לא ניתן לשמור הכנסה קבועה: "+String(error.message).slice(0,130));
  else{form.reset();form.elements.start_month.value=$("month").value;await runtime.reload();message("הכנסה קבועה נשמרה. כדי לספור אותה כהכנסה שהתקבלה, יש לאשר את קבלתה בחודש הרצוי.")}
  submit.disabled=false;
 });
 document.addEventListener("tevuna:loaded",()=>render());
}
