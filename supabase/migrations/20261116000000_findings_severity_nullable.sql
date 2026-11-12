-- Fix: allow NULL findings.severity to match the analysis contract.
-- src/contracts/analysis.ts makes `severity` optional on findingSchema (only
-- watchouts/consequences normally carry it), but the column was defined NOT NULL
-- in 20261113000000. persist_analysis then threw 23502 on severity-less findings
-- and the mock pipeline never produced a report.
--
-- The existing CHECK (severity in ('CRITICAL','HIGH','MEDIUM','LOW')) already
-- permits NULL (a CHECK passes when its expression is UNKNOWN), so only the
-- NOT NULL is dropped; non-null values stay constrained to the four literals.
alter table public.findings alter column severity drop not null;
