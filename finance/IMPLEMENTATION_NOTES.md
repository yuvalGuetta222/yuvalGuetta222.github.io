# Tevuna | Data integrity & operational notes

## Core accounting conventions
- All monetary values in Supabase are integer agorot. A displayed amount never defines an account balance.
- `occurred_on` = original event/card date. `billing_month` = monthly statement period, and can be NULL. Only file names with an unambiguous year and month were backfilled for legacy imports.
- In "billing month" mode, imported credit rows use `billing_month`; manual entries remain grouped by their own date. Exclude imported rows with unknown billing month and explain the limitation.
- Confirmed income is distinct from projected recurring income. Fixed commitments are provisioned, not automatically asserted as paid.
- Effective `start_month`/`end_month` govern fixed expense applicability. Existing templates with unknown start must not produce a verified historical balance.

## Imported-file deletion
- `tevuna_import_batch_transactions` is many-to-many: a shared canonical transaction may appear in multiple imported statements.
- `tevuna_delete_import_batch` is the only supported file-delete pathway. It removes a statement and only transaction records that are not referenced by any other statement. Never directly DELETE an import batch from the frontend.
- A DB AFTER INSERT trigger links new imported transactions to their origin batch to protect against incomplete imports; the client also attaches duplicate rows to the new batch.
- `source_fingerprint` prevents known duplicate lines, but the v2 heuristic may not perfectly identify all real-world duplicates. Imported rows can have an ambiguous month in overlapping exports; do not silently rewrite an existing billing month.
- `expected_count`/`expected_net_agorot` are user-provided checks when source files supply totals. No source totals => verification unavailable; never claim that the whole statement was reconciled.
- The raw XLSX/CSV bytes stay in the browser, not in Supabase.

## Editing and backups
- Corrected transactions get `source_snapshot` of the record before the first edit and an updated `edited_at`. Keep source identity fingerprints and associations unchanged during manual edits.
- JSON exports contain financial records and reference IDs from the household; they are private and should not be shared. A JSON export is **not** a supported automated restore operation.
- UTF-8 CSV is for opening transactions in a spreadsheet. Spreadsheet-formula-looking strings are escaped as literals.

## QA checks
1. Run `node --check finance/app.js` and `node --test finance/*.test.mjs`.
2. In a rollback-only database transaction, verify an overlapping imported row survives deletion of one statement and disappears only when its final file is removed.
3. Confirm unauthorized authenticated users cannot read import links or other households' financial records.
4. Test both month selector modes with a purchase dated in September and billed in October.
5. Edit a category and then the amount; verify the original snapshot survives both changes.
6. Set fixed start/end months; verify older months without evidence show "not verified," rather than fabricated balances.
7. Export JSON and CSV locally; confirm no credential, service_role key or raw statement file bytes are exported.
8. Manually smoke-test dialogs and downloads in desktop and mobile browsers before relying on financial figures.

## Limitations
- No connected-bank reconciliation, automated return from backup, or AI model in this version.
- Historical transactions imported before the original-snapshot feature might have earlier edits that cannot be reconstructed.
- Statistics and heuristics are informational; full accuracy depends on the completeness and consistency of imported statements.
