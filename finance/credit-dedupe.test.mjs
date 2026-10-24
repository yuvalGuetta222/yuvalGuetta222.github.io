import test from "node:test";
import assert from "node:assert/strict";
import {cardChargeFingerprintInput,cardFingerprintInput,chooseBillingAwareFingerprint} from "./card-import.mjs";
import {resolveBillingAwareDuplicates} from "./credit-dedupe.mjs";
const card="00000000-0000-4000-8000-000000000001";
const template={importIdentity:"2025-10-19|university|179250|expense|",importSequence:1};
test("Same original purchase charged in August and October has different period-aware fingerprints",()=>{
 assert.notEqual(cardChargeFingerprintInput(card,template,"2026-08-01"),cardChargeFingerprintInput(card,template,"2026-10-01"));
 assert.equal(cardFingerprintInput(card,template),cardFingerprintInput(card,template));
});
test("A duplicate from the same billing month reuses legacy V3 fingerprint",()=>{
 const row={card_id:card,billing_month:"2026-08-01",source_fingerprint:"legacy"};
 assert.equal(chooseBillingAwareFingerprint(row,{card_id:card,billing_month:"2026-08-01"},"permonth"),"legacy");
});
test("An installment from another billing month retains separate identity",async()=>{
 const row={source_fingerprint:"legacy",dedupe_v4_input:"2026-10-specific",card_id:card,billing_month:"2026-10-01"};
 const mock={from:()=>({select(){return this},eq(){return this},in(){return Promise.resolve({data:[{source_fingerprint:"legacy",billing_month:"2026-08-01",card_id:card}],error:null})}})};
 const result=await resolveBillingAwareDuplicates({supabase:mock,household:"household",rows:[row],hash:async x=>"hashed-"+x});
 assert.equal(result[0].source_fingerprint,"hashed-2026-10-specific");
 assert.equal("dedupe_v4_input" in result[0],false);
});
test("Missing date in older import requires human verification rather than silently deduping",()=>{
 assert.throws(()=>chooseBillingAwareFingerprint({card_id:card,source_fingerprint:"old",billing_month:"2026-10-01"},{card_id:card,billing_month:null},"v4"),/lacks a verified billing/);
});
