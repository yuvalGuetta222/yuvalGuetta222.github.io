import {categoryBreakdown} from "./category-data.mjs";
const $=id=>document.getElementById(id);
const ils=agorot=>new Intl.NumberFormat("he-IL",{style:"currency",currency:"ILS",minimumFractionDigits:0,maximumFractionDigits:2}).format((Number(agorot)||0)/100);
function element(tag,value,cls){const e=document.createElement(tag);if(value!==null)e.textContent=String(value);if(cls)e.className=cls;return e}
let selected=null,runtime=null,editing=null;
export function renderCategoryDashboard(transactions){
 const result=categoryBreakdown(transactions);
 const holder=$("category-bars");if(!holder)return;
 holder.replaceChildren();
 const top=result.groups.find(x=>x.net>0);
 const bottom=[...result.groups].reverse().find(x=>x.net>0);
 $("category-grand-total").textContent="נטו "+ils(result.netTotal);
 const quick=$("quick-summary");quick.replaceChildren();
 const summaries=[
  ["הקטגוריה עם הכי הרבה הוצאות",top?top.name+" • "+ils(top.net):"אין עסקאות"],
  ["הקטגוריה עם הכי מעט הוצאות",bottom?bottom.name+" • "+ils(bottom.net):"אין עסקאות"],
  ["קטגוריות פעילות",result.groups.filter(g=>g.net!==0).length+" קטגוריות"],
 ];
 for(const [name,value] of summaries){
  const line=element("div",null,"quick-item");
  line.append(element("small",name),element("b",value));quick.append(line);
 }
 if(!result.groups.length){holder.append(element("p","כשתייבאו פירוט אשראי, תופיע כאן התפלגות ההוצאות לפי קטגוריה. לחצו על קטגוריה כדי לראות את העסקאות.","empty"));return}
 for(const [index,g] of result.groups.entries()){
  const button=element("button",null,"category-chart-row");button.type="button";
  button.setAttribute("aria-label","פירוט "+g.name+" "+ils(g.net)+", "+g.count+" עסקאות");
  const caption=element("span",null,"category-chart-caption");
  const name=element("span",null,"category-chart-name");name.append(element("span",g.name),element("small",g.count+" עסקאות"));
  const val=element("b",ils(g.net),"category-chart-value");
  caption.append(name,val);
  const track=element("span",null,"category-chart-track");
  const bar=element("span",null,"category-chart-fill"+(g.net<0?" is-credit":""));
  bar.style.width=(Math.max(0,g.net)/result.max*100).toFixed(2)+"%";
  track.append(bar);button.append(caption,track);
  button.addEventListener("click",()=>showCategory(g));
  holder.append(button);
 }
}
function showCategory(group){
 selected=group;
 const dialog=$("category-detail-dialog");
 $("category-detail-title").textContent=group.name;
 $("category-detail-meta").textContent=group.count+" עסקאות וזיכויים • הוצאה נטו "+ils(group.net);
 const container=$("category-detail-list");container.replaceChildren();
 const items=[...group.items].sort((a,b)=>b.occurred_on.localeCompare(a.occurred_on)||String(a.merchant).localeCompare(String(b.merchant),"he"));
 for(const tx of items){
  const line=element("button",null,"category-transaction editable-transaction");line.type="button";line.title="עריכת העסקה";line.addEventListener("click",()=>openEditor(tx));
  const info=element("div",null,"category-tx-info");
  info.append(element("b",tx.merchant||"בית עסק לא ידוע"),element("small",tx.occurred_on+(tx.entry_kind==="refund"?" • זיכוי":"")));
  const amount=(tx.entry_kind==="refund"?-1:1)*Number(tx.amount_agorot||0);
  line.append(info,element("strong",ils(amount),"category-tx-value"+(amount<0?" credit":"")));
  container.append(line);
 }
 dialog.showModal();
}
function openEditor(tx){
 editing=tx;
 const form=$("edit-transaction-form");
 form.elements.merchant.value=tx.merchant;
 form.elements.occurred_on.value=tx.occurred_on;
 form.elements.billing_month.value=tx.billing_month?.slice(0,7)||"";
 form.elements.category.value=tx.category;
 form.elements.amount.value=(Number(tx.amount_agorot)/100).toFixed(2);
 form.elements.entry_kind.value=tx.entry_kind;
 const original=tx.source_snapshot;
 $("edit-transaction-original").textContent=original
  ?"עריכה קודמת: פרטי המקור שנשמרו היו "+original.merchant+" • "+original.occurred_on+" • "+ils(original.amount_agorot)+" • "+original.category
  :"זוהי גרסת העסקה השמורה כרגע. בשמירה ראשונה פרטי המקור יתועדו כדי שתוכלו להשוות.";
 $("edit-transaction-status").textContent="";
 $("category-detail-dialog").close();
 $("edit-transaction-dialog").showModal();
}
export function setupCategoryDashboard(context){
 runtime=context;
 $("category-detail-close").addEventListener("click",()=>$("category-detail-dialog").close());
 $("edit-transaction-close").addEventListener("click",()=>$("edit-transaction-dialog").close());
 $("edit-transaction-form").addEventListener("submit",async event=>{
  event.preventDefault();const {household}=runtime.getContext();if(!editing||!household)return;
  const form=event.currentTarget,f=new FormData(form);
  const amount=String(f.get("amount"));if(!/^\d{1,9}(?:\.\d{1,2})?$/.test(amount)){ $("edit-transaction-status").textContent="סכום לא תקין";return; }
  const [w,c=""]=amount.split("."),cents=Number(w)*100+Number(c.padEnd(2,"0"));
  if(!Number.isSafeInteger(cents)||cents<=0){$("edit-transaction-status").textContent="סכום לא תקין";return}
  const payload={merchant:String(f.get("merchant")||"").trim(),occurred_on:String(f.get("occurred_on")),
   category:String(f.get("category")||"").trim(),amount_agorot:cents,entry_kind:String(f.get("entry_kind")),
   billing_month:f.get("billing_month")?String(f.get("billing_month"))+"-01":null};
  if(!payload.merchant||!payload.category){$("edit-transaction-status").textContent="חסרים פרטי עסקה";return}
  const btn=form.querySelector('[type="submit"]');btn.disabled=true;
  const {data,error}=await runtime.supabase.from("tevuna_transactions").update(payload)
   .eq("household_id",household).eq("id",editing.id).select("id");
  if(error||!data?.length){$("edit-transaction-status").textContent="השמירה נכשלה: "+String(error?.message||"רשומה לא נמצאה").slice(0,125);btn.disabled=false;return}
  $("edit-transaction-dialog").close();editing=null;
  await runtime.reload();btn.disabled=false;
 });
 $("category-detail-dialog").addEventListener("click",e=>{if(e.target===e.currentTarget)e.currentTarget.close()});
 document.addEventListener("tevuna:loaded",e=>{
   // Close outdated detail when the selected month is changed or data reloads.
   if($("category-detail-dialog").open)$("category-detail-dialog").close();
   renderCategoryDashboard(e.detail?.data?.transactions||[]);
 });
}
