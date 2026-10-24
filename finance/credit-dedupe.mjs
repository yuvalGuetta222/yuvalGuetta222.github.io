import {chooseBillingAwareFingerprint} from "./card-import.mjs";
/** Keep V3 IDs for already imported statements. When the same original purchase
 * has a charge in a different billing month, use a V4 per-period ID instead.
 * Never silently overwrite the original bank charge or its billing period. */
export async function resolveBillingAwareDuplicates({supabase,household,rows,hash}){
 const oldByHash=new Map();
 for(let n=0;n<rows.length;n+=75){
  const part=rows.slice(n,n+75);
  const {data,error}=await supabase.from("tevuna_transactions")
   .select("source_fingerprint,billing_month,card_id")
   .eq("household_id",household).in("source_fingerprint",part.map(x=>x.source_fingerprint));
  if(error)throw error;
  for(const item of data||[])oldByHash.set(item.source_fingerprint,item);
 }
 for(const item of rows){
  if(!item.dedupe_v4_input)throw Error("Missing per-month identity for imported charge");
  const old=oldByHash.get(item.source_fingerprint);
  if(old){
   const v4=await hash(item.dedupe_v4_input);
   item.source_fingerprint=chooseBillingAwareFingerprint(item,old,v4);
  }
  delete item.dedupe_v4_input;
 }
 if(new Set(rows.map(x=>x.source_fingerprint)).size!==rows.length)
  throw Error("Two independent import lines have the same identity; please review the source file");
 return rows;
}
