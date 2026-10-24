import test from "node:test";
import assert from "node:assert/strict";
import {cardLast4,cardCheck,cardFingerprintInput} from "./card-import.mjs";
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
