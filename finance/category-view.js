import {categoryBreakdown} from "./category-data.mjs";
const $=id=>document.getElementById(id);
const ils=agorot=>new Intl.NumberFormat("he-IL",{style:"currency",currency:"ILS",minimumFractionDigits:0,maximumFractionDigits:2}).format((Number(agorot)||0)/100);
function element(tag,value,cls){const e=document.createElement(tag);if(value!==null)e.textContent=String(value);if(cls)e.className=cls;return e}
let selected=null,runtime=null,editing=null;
let cardLabels=new Map(),cardProfiles=[];
export function renderCategoryDashboard(transactions,cards=[]){
 cardProfiles=cards;
 cardLabels=new Map(cards.map(c=>[c.id,c.nickname+" •••• "+c.last4]));
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
  const metadata=element("span",null,"category-tx-meta");
  metadata.append(element("small",tx.occurred_on+(tx.entry_kind==="refund"?" • זיכוי":"")));
  const cardLabel=tx.source==="manual"?"עסקה ידנית • ללא כרטיס":tx.card_id?
    cardLabels.get(tx.card_id)||"כרטיס מזוהה שאינו זמין ברשימה":
    "כרטיס לא משויך • לחצו לשיוך";
  metadata.append(element("small",cardLabel,"category-card-label"+(!tx.card_id&&tx.source!=="manual"?" unknown":"")));
  info.append(element("b",tx.merchant||"בית עסק לא ידוע"),metadata);
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
 const area=$("edit-transaction-card-section"),selector=$("edit-transaction-card");
 area.hidden=tx.source==="manual";
 selector.replaceChildren();
 const option=(value,label)=>{const e=document.createElement("option");e.value=value;e.textContent=label;return e};
 selector.append(option("keep","ללא שיוך כרטיס • להשאיר כפי שהוא"));
 for(const c of cardProfiles)selector.append(option(c.id,c.nickname+" •••• "+c.last4));
 selector.append(option("new","+ הוספת כרטיס חדש"));
 selector.value=tx.card_id||"keep";
 $("edit-card-new-fields").hidden=true;
 $("edit-card-help").textContent=tx.card_id?
   "כרטיס נוכחי: "+(cardLabels.get(tx.card_id)||"לא מזוהה")+". כרטיס שנקבע בעת ייבוא מקורי אינו ניתן לשינוי כאן; שיוך ידני של דוח ישן ניתן לתיקון.":
   "אם אתם יודעים מאיזה כרטיס העסקה הגיעה, בחרו אותו כאן. אפשר גם ליצור כרטיס לפי ארבע ספרות אחרונות בלבד.";
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
 $("edit-transaction-card").addEventListener("change",()=>{
  $("edit-card-new-fields").hidden=$("edit-transaction-card").value!=="new";
 });
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
  try{
   if(editing.source!=="manual"){
    const choice=String(f.get("card_choice")||"keep");
    if(choice==="new"){
     const nickname=String(f.get("new_card_name")||"").trim(),last4=String(f.get("new_card_last4")||"").trim();
     if(!nickname||nickname.length>50||!/^[0-9]{4}$/.test(last4))throw Error("יש להזין שם לכרטיס וארבע ספרות אחרונות.");
     const {data:existing,error:lookupError}=await runtime.supabase.from("tevuna_cards")
      .select("id").eq("household_id",household).eq("last4",last4).maybeSingle();
     if(lookupError)throw lookupError;
     if(existing)throw Error("כרטיס שמסתיים ב-"+last4+" כבר קיים. בחרו אותו מהרשימה במקום ליצור כרטיס נוסף.");
     const {user}=runtime.getContext();
     if(!user?.id)throw Error("יש להתחבר מחדש כדי לשייך כרטיס.");
     const {data:created,error:cardError}=await runtime.supabase.from("tevuna_cards")
      .insert({household_id:household,created_by:user.id,nickname,last4}).select("id").single();
     if(cardError)throw cardError;
     payload.card_id=created.id;
    }else if(choice!=="keep"&&choice!==editing.card_id){
     if(!cardProfiles.some(c=>c.id===choice))throw Error("הכרטיס שנבחר אינו נמצא ברשימת הכרטיסים המאושרים.");
     payload.card_id=choice;
    }else if(choice==="keep"&&editing.card_id){
     // "Keep" is not a delete action: card identity can be corrected only by selecting a known profile.
    }
   }
  }catch(error){
   $("edit-transaction-status").textContent="לא ניתן לשייך כרטיס: "+String(error.message||error).slice(0,160);
   btn.disabled=false;return;
  }
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
   renderCategoryDashboard(e.detail?.data?.transactions||[],e.detail?.data?.cards||[]);
 });
}
