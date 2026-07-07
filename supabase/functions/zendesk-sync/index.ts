// Zendesk synchronisation edge function.
//
// Pulls tickets from the Zendesk REST API and upserts them into incidents,
// mapping Zendesk status/priority onto the platform's lookups. Designed to run:
//   * manually (from the Admin console),
//   * on a schedule (Supabase cron / pg_cron calling this function),
//   * or from a Zendesk webhook (single-ticket payload).
//
// Every run is recorded in zendesk_sync_log. API failures are caught per-ticket
// so one bad ticket doesn't abort the batch (graceful degradation).
// deno-lint-ignore-file no-explicit-any
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { adminClient } from "../_shared/clients.ts";

const ZENDESK_SUBDOMAIN = Deno.env.get("ZENDESK_SUBDOMAIN");
const ZENDESK_EMAIL = Deno.env.get("ZENDESK_EMAIL");
const ZENDESK_API_TOKEN = Deno.env.get("ZENDESK_API_TOKEN");

// Zendesk status -> platform status key.
const STATUS_MAP: Record<string, string> = {
  new: "new",
  open: "open",
  pending: "waiting_customer",
  hold: "waiting_third_party",
  solved: "resolved",
  closed: "closed",
};
const PRIORITY_MAP: Record<string, string> = {
  urgent: "critical",
  high: "high",
  normal: "medium",
  low: "low",
};

function zendeskAuthHeader(): string {
  return "Basic " + btoa(`${ZENDESK_EMAIL}/token:${ZENDESK_API_TOKEN}`);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const admin = adminClient();
  const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
  const triggerType = body.trigger_type ?? "manual";

  // Open a sync-log row.
  const { data: logRow } = await admin.from("zendesk_sync_log")
    .insert({ direction: "inbound", trigger_type: triggerType, status: "running" })
    .select().single();

  const result = { tickets_seen: 0, created: 0, updated: 0, errors: 0, details: [] as any[] };

  try {
    if (!ZENDESK_SUBDOMAIN || !ZENDESK_API_TOKEN || !ZENDESK_EMAIL) {
      throw new Error("Zendesk credentials not configured (ZENDESK_SUBDOMAIN / ZENDESK_EMAIL / ZENDESK_API_TOKEN)");
    }

    // Preload lookup id maps.
    const [{ data: statuses }, { data: priorities }] = await Promise.all([
      admin.from("statuses").select("id,key"),
      admin.from("priorities").select("id,key"),
    ]);
    const statusId = (k: string) => statuses?.find((s: any) => s.key === k)?.id;
    const priorityId = (k: string) => priorities?.find((p: any) => p.key === k)?.id;

    // Support either a webhook single-ticket payload or a full pull.
    let tickets: any[] = [];
    if (body.ticket) {
      tickets = [body.ticket];
    } else {
      const url = `https://${ZENDESK_SUBDOMAIN}.zendesk.com/api/v2/tickets.json?per_page=100`;
      const res = await fetch(url, { headers: { Authorization: zendeskAuthHeader() } });
      if (!res.ok) throw new Error(`Zendesk API ${res.status}: ${await res.text()}`);
      tickets = (await res.json()).tickets ?? [];
    }

    result.tickets_seen = tickets.length;

    for (const t of tickets) {
      try {
        const payload = {
          zendesk_ticket_id: String(t.id),
          title: t.subject ?? "(no subject)",
          description: t.description ?? null,
          status_id: statusId(STATUS_MAP[t.status] ?? "new"),
          priority_id: priorityId(PRIORITY_MAP[t.priority] ?? "medium"),
          updated_at: new Date().toISOString(),
        };
        // Upsert on the external id so re-syncs update rather than duplicate.
        const { data: existing } = await admin.from("incidents")
          .select("id").eq("zendesk_ticket_id", String(t.id)).maybeSingle();

        if (existing) {
          await admin.from("incidents").update(payload).eq("id", existing.id);
          result.updated++;
        } else {
          await admin.from("incidents").insert(payload);
          result.created++;
        }
      } catch (e) {
        result.errors++;
        result.details.push({ ticket: t.id, error: String(e) });
      }
    }

    await admin.from("zendesk_sync_log").update({
      status: result.errors > 0 ? "partial" : "success",
      tickets_seen: result.tickets_seen,
      created_count: result.created,
      updated_count: result.updated,
      error_count: result.errors,
      details: result.details,
      finished_at: new Date().toISOString(),
    }).eq("id", logRow!.id);

    return jsonResponse({ ok: true, ...result });
  } catch (err) {
    await admin.from("zendesk_sync_log").update({
      status: "failed",
      error_count: result.errors + 1,
      details: [...result.details, { fatal: String(err) }],
      finished_at: new Date().toISOString(),
    }).eq("id", logRow?.id);
    console.error("zendesk-sync error:", err instanceof Error ? err.message : err);
    return jsonResponse({ ok: false, error: String(err) }, 500);
  }
});
