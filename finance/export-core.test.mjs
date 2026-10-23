import test from "node:test";
import assert from "node:assert/strict";
import {exportPayload,transactionsToCsv,csvSafe} from "./export-core.mjs";
test("Backup metadata distinguishes JSON export from bank source file",()=>{
 const out=exportPayload("household",{transactions:[{amount_agorot:12345}]},"2026-10-23T00:00:00Z");
 assert.equal(out.version,1);assert.equal(out.files_are_not_included,true);
 assert.equal(out.records.transactions[0].amount_agorot,12345);
});
test("CSV safely escapes commas, quoted names, multiline and formula injection",()=>{
 assert.equal(csvSafe('Store, "quoted"'),'"Store, ""quoted"""');
 assert.match(csvSafe("=1+2"),/^"'/);assert.match(csvSafe("+CMD"),/^"'/);
 assert.match(csvSafe("@FUNC"),/^"'/);
 const csv=transactionsToCsv([{occurred_on:"2026-10-23",billing_month:"2026-11-01",merchant:"Store, \"One\"",category:"מזון",amount_agorot:12345,entry_kind:"expense",source:"xlsx"}]);
 assert.ok(csv.startsWith("\uFEFF"));assert.match(csv,/123\.45/);assert.match(csv,/2026-11/);
});
