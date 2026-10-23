/* Manage entire imported credit statement sheets, never individual manual records. */
const $=id=>document.getElementById(id);
let runtime=null,selected=null,loading=false,seq=0,records=[];
const money=n=>new Intl.NumberFormat("he-IL",{style:"currency",currency:"ILS",maximumFractionDigits:0}).format((Number(n)||0)/100);
const niceDate=d=>d?new Intl.DateTimeFormat("he-IL",{dateStyle:"medium"}).format(new Date(d)):"—";
const labelMonth=d=>{
 if(!d)return "לא ידוע";
 const [y,m]=String(d).slice(0,7).split("-").map(Number);
 return new Intl.DateTimeFormat("he-IL",{year:"numeric",month:"long"}).format(new Date(y,m-1,1));
};
function el(tag,txt,cls){const item=document.createElement(tag);item.textContent=String(txt??"");if(cls)item.className=cls;return item;}
function period(batch){
 if(!batch.first_transaction_date)return "ללא עסקאות";
 const first=labelMonth(batch.first_transaction_date),last=labelMonth(batch.last_transaction_date);
 return first===last?first:first+" עד "+last;
}
function status(text){$("statements-status").textContent=text||"";}
function render(){
 const target=$("statements-list");target.replaceChildren();
 $("statements-count").textContent=records.length+" פירוטים שמורים";
 if(!records.length){
  const empty=el("div","","box import-empty");
  empty.append(el("h3","עדיין אין פירוטי אשראי שמורים"),el("p","כשמייבאים CSV או Excel ומאשרים שמירה, הפירוט מופיע כאן. ניתן יהיה להסיר אותו ואת כל העסקאות שנוספו ממנו."));
  target.append(empty);return;
 }
 for(const b of records){
  const card=el("article","","box statement-card");
  const main=el("div","","statement-main");
  main.append(el("div",b.statement_month?"פירוט אשראי • "+labelMonth(b.statement_month):"פירוט אשראי • "+period(b),"statement-period"));
  main.append(el("h3",b.filename,"statement-filename"));
  const details=el("p",[
    "גיליון: "+(b.sheet_name||(b.file_kind==="xlsx"?"לא נשמר":"CSV")),"יובא: "+niceDate(b.imported_at),
    "תאריכי עסקאות: "+period(b),
    Number(b.transaction_count)+" עסקאות שנשמרו","סכום נטו: "+money(b.net_amount_agorot)
   ].join("  •  "),"statement-details");
  main.append(details);
  const action=el("button","מחיקת הפירוט","danger delete-statement");action.type="button";
  action.setAttribute("aria-label","מחיקת הפירוט "+b.filename);
  action.addEventListener("click",()=>openConfirm(b));
  card.append(main,action);target.append(card);
 }
}
function openConfirm(batch){
 if(!runtime?.getContext()?.household)return;
 selected=batch;
 $("delete-statement-filename").textContent=batch.filename;
 $("delete-statement-info").textContent=(batch.statement_month?"חודש פירוט "+labelMonth(batch.statement_month)+" • ":"")+period(batch)+" • "+batch.transaction_count+" עסקאות • "+money(batch.net_amount_agorot);
 $("delete-statement-warning").textContent="כל "+batch.transaction_count+" העסקאות ששויכו לייבוא הזה יימחקו לצמיתות ממאגר הנתונים, מהתקציב ומהגרפים. עסקאות ידניות, הכנסות, וייבואים אחרים לא יימחקו. לא ניתן לבטל את המחיקה.";
 $("delete-statement-error").textContent="";
 $("delete-statement-confirm").disabled=false;
 $("delete-statement-dialog").showModal();
}
async function deleteBatch(){
 const batch=selected,context=runtime?.getContext();
 if(!batch||!context?.household||loading)return;
 loading=true;
 $("delete-statement-confirm").disabled=true;
 $("delete-statement-error").textContent="מוחק את הפירוט ואת כל העסקאות השייכות אליו…";
 try{
  const {data,error}=await runtime.supabase.from("tevuna_import_batches")
    .delete().eq("id",batch.id).eq("household_id",context.household).select("id");
  if(error)throw error;
  if(!Array.isArray(data)||data.length!==1)throw Error("הרשומה לא נמחקה. ייתכן שהפירוט כבר הוסר או שאין הרשאה.");
  selected=null;
  $("delete-statement-dialog").close();
  status("הפירוט '"+batch.filename+"' נמחק לצמיתות. העסקאות ששויכו אליו לא יופיעו עוד בחישובים.");
  await runtime.reload();
  await refresh();
  document.dispatchEvent(new CustomEvent("tevuna:batches-changed"));
 }catch(err){
  $("delete-statement-error").textContent="לא ניתן להשלים את המחיקה: "+String(err?.message||err).slice(0,175);
  // If deletion succeeded but follow-up read failed, refresh the screen to confirm the actual state.
  if(!selected){$("delete-statement-dialog").close();status("בוצעה מחיקה, אך הרענון נכשל. רעננו את העמוד כדי לוודא את המצב.");}
 }finally{loading=false;$("delete-statement-confirm").disabled=false}
}
async function refresh(){
 const ctx=runtime?.getContext();
 if(!ctx?.household)return;
 const current=++seq;
 if(!$("statements").classList.contains("hidden"))status("טוען פירוטי אשראי…");
 const {data,error}=await runtime.supabase.from("tevuna_import_batch_summary")
  .select("id,filename,sheet_name,file_kind,imported_at,transaction_count,net_amount_agorot,first_transaction_date,last_transaction_date,statement_month")
  .eq("household_id",ctx.household).order("imported_at",{ascending:false}).limit(400);
 if(current!==seq)return;
 if(error){status("לא ניתן לטעון את פירוטי האשראי. "+String(error.message).slice(0,150));return}
 records=data||[];
 render();
 if(!$("statements").classList.contains("hidden"))status(records.length>=400?"מוצגים 400 הפירוטים האחרונים.":"");
}
export function setupBatches(context){
 runtime=context;
 $("statements-refresh").addEventListener("click",refresh);
 $("delete-statement-confirm").addEventListener("click",deleteBatch);
 $("delete-statement-cancel").addEventListener("click",()=>{$("delete-statement-dialog").close();selected=null});
 $("delete-statement-dialog").addEventListener("cancel",()=>{if(loading)return;selected=null});
 document.addEventListener("tevuna:screen-changed",e=>{if(e.detail?.screen==="statements")refresh()});
 document.addEventListener("tevuna:batches-changed",()=>{if(!$("statements").classList.contains("hidden"))refresh()});
}
