// start-extraction — browser-facing trigger for Document Field Extraction.
//
// The frontend uploads a document to Storage + inserts a `document_extractions`
// row (status=pending), then calls this JWT-verified function with the row id.
// This function forwards to the internal Temporal gateway (server-side only), so
// the browser never touches Temporal directly. Starting the same extraction twice
// is idempotent (the workflow id dedups it).
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";

const GATEWAY_URL = Deno.env.get("EXTRACTION_GATEWAY_URL") ?? "http://host.docker.internal:8088";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { extraction_id } = await req.json();
    if (!extraction_id) return jsonResponse({ error: "extraction_id required" }, 400);

    const res = await fetch(`${GATEWAY_URL}/extractions/${extraction_id}/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    if (!res.ok) {
      return jsonResponse({ error: "gateway_error", detail: await res.text() }, 502);
    }
    return jsonResponse(await res.json());
  } catch (err) {
    console.error("start-extraction error:", err instanceof Error ? err.message : err);
    return jsonResponse({ error: "start_failed", detail: String(err) }, 500);
  }
});
