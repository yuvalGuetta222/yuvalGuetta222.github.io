import test from "node:test";
import assert from "node:assert/strict";
import {cardLast4,cardCheck,cardFingerprintInput,potentialLegacyOverlap,spendingByCard} from "./card-import.mjs";
const one="00000000-0000-4000-8000-000000000001",two="00000000-0000-4000-8000-000000000002";
const row={importIdentity:"2026-10-20|wolt|10000|expense||",importSequence:1,rowCardLast4:null};
test("Same purchase on two cards must never deduplicate",()=>{
 assert.notEqual(cardFingerprintInput(one,row),cardFingerprintInput(two,row));
});
test("Reimport of same card and same row remains idempotent even with changed file name",()=>{
 assert.equal(cardFingerprintInput(one,row),cardFingerprintInput(one,{...row,filename:"other.xlsx"}));
});
test("Repeated identical transactions within a card remain distinct",()=>{
 assert.notEqual(cardFingerprintInput(one,row),cardFingerprintInput(one,{...row,importSequence:2}));
});
test("Card digits extracted without retaining full PAN",()=>{
 assert.equal(cardLast4("1234"),"1234");
 assert.equal(cardLast4("**** 7888"),"7888");
 assert.equal(cardLast4("Visa 7888"),"7888");
 assert.equal(cardLast4("1234 5678 9012 7888"),"7888");
 assert.equal(cardLast4(""),null);
});
test("Mixed or mismatched card columns are blocked",()=>{
 assert.equal(cardCheck([{rowCardLast4:"7888"},{rowCardLast4:"1234"}],"7888").ok,false);
 assert.equal(cardCheck([{rowCardLast4:"7888"}],"1234").ok,false);
 assert.equal(cardCheck([{rowCardLast4:"7888"}],"7888").ok,true);
 assert.equal(cardCheck([row],"7888").ok,true);
});

test("Legacy combined statement similarities are warnings, not silently merged",()=>{
 const incoming=[
  {occurred_on:"2026-10-20",merchant:"Wolt",amount_agorot:10000,entry_kind:"expense"},
  {occurred_on:"2026-10-20",merchant:"Wolt",amount_agorot:10000,entry_kind:"expense"}
 ];
 const legacy=[{occurred_on:"2026-10-20",merchant:"Wolt",amount_agorot:10000,entry_kind:"expense"}];
 assert.equal(potentialLegacyOverlap(incoming,legacy),1);
 assert.equal(potentialLegacyOverlap(incoming,[]),0);
});

test("Card totals sum all cards in same month without hiding identically priced charges",()=>{
 const transactions=[
  {card_id:one,source:"xlsx",amount_agorot:15000,entry_kind:"expense"},
  {card_id:two,source:"xlsx",amount_agorot:15000,entry_kind:"expense"},
  {card_id:two,source:"xlsx",amount_agorot:2000,entry_kind:"refund"},
  {card_id:null,source:"xlsx",amount_agorot:900,entry_kind:"expense"}
 ];
 const results=spendingByCard(transactions,[{id:one,nickname:"כרטיס ראשון",last4:"1234"},{id:two,nickname:"כרטיס שני",last4:"5678"}]);
 assert.equal(results.reduce((n,x)=>n+x.total,0),28900);
 assert.equal(results.length,3);
 assert.ok(results.find(x=>x.key===one)?.total===15000);
 assert.ok(results.find(x=>x.key===two)?.total===13000);
 assert.ok(results.find(x=>x.key==="legacy")?.total===900);
});
