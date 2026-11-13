"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseBrowserClient } from "./browser";
import type { OpportunityEvidenceItem } from "../evidence-ledger.mjs";
import type { PortableOpportunity } from "../opportunity-portability.mjs";
import {
  evidenceToRow,
  opportunitiesFromRows,
  opportunityToRow,
  type OpportunityEvidenceRow,
  type OpportunityRow,
} from "../opportunity-account.mjs";

// Opportunities in the signed-in person's account.
//
// Every call goes out with the person's own session, and the database decides
// what that session may touch: row level security limits each statement to the
// caller's own rows, and the owner column is filled from the session, never
// from here. Nothing in this file names a user.

const OPPORTUNITY_COLUMNS = "id,title,target,thesis,evidence_url,strategic_fit,potential_value,urgency,evidence_strength,effort,created_at_ms";
const EVIDENCE_COLUMNS = "opportunity_id,id,url,title,observation,stance,source_type,source_date,reliability,checked_at,added_at_ms";
// The API returns at most 1000 rows per request by default; evidence notes can
// outnumber that, so both reads page until a short page comes back.
const PAGE_SIZE = 1000;
const WRITE_BATCH = 500;

export class OpportunityStoreError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OpportunityStoreError";
  }
}

let client: SupabaseClient | null = null;
function supabase(): SupabaseClient {
  if (!client) client = createSupabaseBrowserClient();
  return client;
}

type Page = { data: unknown; error: { message: string } | null };

async function readAll<Row>(readPage: (from: number, to: number) => PromiseLike<Page>): Promise<Row[]> {
  const rows: Row[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await readPage(from, from + PAGE_SIZE - 1);
    if (error) throw new OpportunityStoreError(error.message);
    const page = (Array.isArray(data) ? data : []) as Row[];
    rows.push(...page);
    if (page.length < PAGE_SIZE) return rows;
  }
}

export async function listAccountOpportunities(): Promise<PortableOpportunity[]> {
  const [opportunityRows, evidenceRows] = await Promise.all([
    readAll<OpportunityRow>((from, to) => supabase().from("opportunities")
      .select(OPPORTUNITY_COLUMNS).order("id", { ascending: true }).range(from, to)),
    readAll<OpportunityEvidenceRow>((from, to) => supabase().from("opportunity_evidence_items")
      .select(EVIDENCE_COLUMNS).order("opportunity_id", { ascending: true }).order("id", { ascending: true }).range(from, to)),
  ]);
  const evidenceByOpportunity = new Map<string, OpportunityEvidenceRow[]>();
  for (const row of evidenceRows) {
    const list = evidenceByOpportunity.get(row.opportunity_id);
    if (list) list.push(row);
    else evidenceByOpportunity.set(row.opportunity_id, [row]);
  }
  return opportunitiesFromRows(opportunityRows.map((row) => ({
    ...row,
    opportunity_evidence_items: evidenceByOpportunity.get(row.id) ?? [],
  })));
}

/**
 * Add records the account does not hold yet. A row whose id is already there
 * is skipped, not replaced, so this can be repeated — by a retry, a second
 * tab, or the same backup file imported twice — without changing anything
 * that was already stored.
 */
export async function addAccountOpportunities(opportunityRows: OpportunityRow[], evidenceRows: OpportunityEvidenceRow[]): Promise<void> {
  // Opportunities first: an evidence note refers to its opportunity.
  for (let start = 0; start < opportunityRows.length; start += WRITE_BATCH) {
    const { error } = await supabase().from("opportunities")
      .upsert(opportunityRows.slice(start, start + WRITE_BATCH), { onConflict: "user_id,id", ignoreDuplicates: true });
    if (error) throw new OpportunityStoreError(error.message);
  }
  for (let start = 0; start < evidenceRows.length; start += WRITE_BATCH) {
    const { error } = await supabase().from("opportunity_evidence_items")
      .upsert(evidenceRows.slice(start, start + WRITE_BATCH), { onConflict: "user_id,opportunity_id,id", ignoreDuplicates: true });
    if (error) throw new OpportunityStoreError(error.message);
  }
}

export async function addAccountOpportunity(opportunity: PortableOpportunity): Promise<void> {
  await addAccountOpportunities(
    [opportunityToRow(opportunity)],
    opportunity.evidenceItems.map((item) => evidenceToRow(opportunity.id, item)),
  );
}

/** Removes the opportunity; its evidence notes go with it in the database. */
export async function removeAccountOpportunity(opportunityId: string): Promise<void> {
  const { error } = await supabase().from("opportunities").delete().eq("id", opportunityId);
  if (error) throw new OpportunityStoreError(error.message);
}

export async function addAccountEvidence(opportunityId: string, item: OpportunityEvidenceItem): Promise<void> {
  const { error } = await supabase().from("opportunity_evidence_items").insert(evidenceToRow(opportunityId, item));
  if (error) throw new OpportunityStoreError(error.message);
}

export async function removeAccountEvidence(opportunityId: string, evidenceId: string): Promise<void> {
  const { error } = await supabase().from("opportunity_evidence_items")
    .delete().eq("opportunity_id", opportunityId).eq("id", evidenceId);
  if (error) throw new OpportunityStoreError(error.message);
}
