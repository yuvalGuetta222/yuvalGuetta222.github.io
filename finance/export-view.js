import {EXPORT_TABLES,exportPayload,transactionsToCsv} from "./export-core.mjs";
const $=id=>document.getElementById(id);
let runtime=null,working=false;
function status(s){$("backup-status").textContent=s}
async function allRows(table,select,household){
 const rows=[];
 for(let index=0;index<20000;index+=1000){
  let query=runtime.supabase.from(table).select(select).eq("household_id",household);
  if(table==="tevuna_import_batch_transactions")query=query.order("batch_id").order("transaction_id");
  else if(table==="tevuna_fixed_expense_card_coverage")query=query.order("fixed_expense_id").order("expense_month");
  else query=query.order("id");
  const {data,error}=await query.range(index,index+999);
  if(error)throw error;
  rows.push(...(data||[]));
  if(!data||data.length<1000)return rows;
 }
 throw Error("יש יותר מ-20,000 רשומות בטבלה. הייצוא הופסק כדי למנוע גיבוי חלקי.");
}
function downloadFile(content,filename,type){
 const blob=new Blob([content],{type});
 const link=document.createElement("a");
 const url=URL.createObjectURL(blob);link.href=url;link.download=filename;
 document.body.append(link);link.click();link.remove();
 setTimeout(()=>URL.revokeObjectURL(url),2000);
}
async function exportData(mode){
 if(working)return;
 const {household}=runtime.getContext();
 if(!household){status("יש להתחבר קודם לחשבון המאושר.");return}
 if(!confirm("הקובץ שיירד יכיל מידע פיננסי משפחתי. שמרו אותו רק במכשיר פרטי ומוגן. להמשיך?"))return;
 working=true;$("backup-json").disabled=true;$("backup-csv").disabled=true;
 try{
  const stamp=new Date().toISOString().slice(0,10);
  if(mode==="csv"){
   status("קורא את העסקאות…");
   const rows=await allRows("tevuna_transactions",EXPORT_TABLES.transactions[1],household);
   downloadFile(transactionsToCsv(rows),"Tevuna-transactions-"+stamp+".csv","text/csv;charset=utf-8");
   status("קובץ CSV הוכן. הוא מכיל עסקאות בלבד, ואינו מהווה גיבוי מלא.");
  }else{
   const record={};
   for(const [name,[table,columns]] of Object.entries(EXPORT_TABLES)){
    status("מכין גיבוי: "+name+"…");
    record[name]=await allRows(table,columns,household);
   }
   const json=JSON.stringify(exportPayload(household,record),null,2);
   downloadFile(json,"Tevuna-private-backup-"+stamp+".json","application/json;charset=utf-8");
   status("הגיבוי המלא הוכן. בדקו שהקובץ ירד למכשיר. המערכת אינה שומרת עותק של הגיבוי.");
  }
 }catch(err){status("ייצוא נכשל: "+String(err?.message||err).slice(0,220)+". אין להסתמך על קובץ חלקי.");}
 finally{working=false;$("backup-json").disabled=false;$("backup-csv").disabled=false;}
}
export function setupBackup(context){
 runtime=context;
 $("backup-json").addEventListener("click",()=>exportData("json"));
 $("backup-csv").addEventListener("click",()=>exportData("csv"));
}
