/* Local browser-only export. No raw file or user passwords leave the browser. */
export const BACKUP_VERSION=1;
export const EXPORT_TABLES={
 cards:["tevuna_cards","id,household_id,created_by,nickname,last4,created_at"],
 transactions:["tevuna_transactions","id,household_id,created_by,occurred_on,billing_month,merchant,category,amount_agorot,entry_kind,source,source_fingerprint,import_batch_id,installment_number,installment_total,source_snapshot,edited_at,created_at"],
 incomes:["tevuna_incomes","*"],recurring_incomes:["tevuna_recurring_incomes","*"],
 fixed_expenses:["tevuna_fixed_expenses","*"],fixed_card_coverage:["tevuna_fixed_expense_card_coverage","*"],
 budgets:["tevuna_budgets","*"],imports:["tevuna_import_batches","*"],
 import_links:["tevuna_import_batch_transactions","*"]
};
export function exportPayload(householdId,records,exportedAt=new Date().toISOString()){
 return {format:"tevuna-finance-backup",version:BACKUP_VERSION,exported_at:exportedAt,
 household_id:householdId,files_are_not_included:true,records};
}
export function csvSafe(value){
 let s=String(value??"");
 if(/^[\t\r\n ]*[=+@\uFF1D\uFF0B\uFF20]/.test(s)||/^[\t\r\n ]*-[^0-9]/.test(s))s="'"+s;
 return '"'+s.replace(/"/g,'""')+'"';
}
export function transactionsToCsv(transactions){
 const headers=["תאריך עסקה","חודש חיוב","בית עסק","קטגוריה","סכום ₪","סוג","מקור","נערך לאחר ייבוא"];
 const rows=(transactions||[]).map(t=>[t.occurred_on,t.billing_month?.slice(0,7)||"",t.merchant,t.category,
 (Number(t.amount_agorot)/100).toFixed(2),t.entry_kind==="refund"?"זיכוי":"חיוב",t.source||"",t.edited_at?"כן":"לא"]);
 return "\uFEFF"+[headers,...rows].map(row=>row.map(csvSafe).join(",")).join("\r\n");
}
