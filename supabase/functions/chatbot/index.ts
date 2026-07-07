// AI Chatbot edge function.
//
// Answers natural-language questions about live incident data ("What is the
// status of INC-1042?", "Which incidents breached SLA?", "How many are open?").
//
// Approach: a lightweight intent/tool layer. The function runs safe, RLS-scoped
// read queries against v_incidents on behalf of the caller, then (if an LLM is
// configured) uses the retrieved rows as grounding to phrase a natural answer.
// This keeps answers live and prevents the model from inventing data.
// deno-lint-ignore-file no-explicit-any
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { userClient, chat, aiConfigured } from "../_shared/clients.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { message } = await req.json();
    if (!message) return jsonResponse({ error: "message required" }, 400);

    // RLS-scoped client: the bot only sees what the user is allowed to see.
    const db = userClient(req.headers.get("Authorization"));
    const q = String(message).toLowerCase();

    let rows: any[] = [];
    let intent = "search";

    // --- Intent routing (deterministic, safe reads) -------------------------
    const incMatch = q.match(/inc[-\s]?(\d+)/i);
    if (incMatch) {
      intent = "lookup";
      const num = `INC-${incMatch[1].padStart(6, "0")}`;
      const { data } = await db.from("v_incidents").select("*")
        .or(`incident_number.ilike.%${incMatch[1]}%,incident_number.eq.${num}`).limit(3);
      rows = data ?? [];
    } else if (q.includes("overdue") || q.includes("breach")) {
      intent = "breached";
      const { data } = await db.from("v_incidents").select("*")
        .eq("resolve_breached", true).order("created_at", { ascending: false }).limit(20);
      rows = data ?? [];
    } else if (q.includes("high priority") || q.includes("critical")) {
      intent = "high_priority";
      const { data } = await db.from("v_incidents").select("*")
        .lte("priority_rank", 2).eq("is_open", true).order("priority_rank").limit(20);
      rows = data ?? [];
    } else if (q.includes("waiting for customer")) {
      intent = "waiting_customer";
      const { data } = await db.from("v_incidents").select("*")
        .eq("status_key", "waiting_customer").limit(20);
      rows = data ?? [];
    } else if (q.includes("how many") && q.includes("open")) {
      intent = "count_open";
      const { count } = await db.from("v_incidents").select("*", { count: "exact", head: true })
        .eq("is_open", true);
      return jsonResponse({ intent, answer: `There are currently ${count ?? 0} open incidents.`, count });
    } else if (q.includes("assigned to")) {
      intent = "by_assignee";
      const name = q.split("assigned to")[1]?.trim().replace(/[?.]/g, "");
      const { data } = await db.from("v_incidents").select("*")
        .ilike("assignee_name", `%${name}%`).limit(20);
      rows = data ?? [];
    } else {
      // Generic: fuzzy search title.
      const { data } = await db.from("v_incidents").select("*")
        .ilike("title", `%${message}%`).limit(10);
      rows = data ?? [];
    }

    // --- Phrase the answer ---------------------------------------------------
    const compact = rows.map((r) => ({
      number: r.incident_number, title: r.title, status: r.status,
      priority: r.priority, assignee: r.assignee_name, customer: r.customer,
      sla_seconds_remaining: r.sla_seconds_remaining, updated: r.updated_at,
    }));

    let answer: string;
    if (aiConfigured()) {
      answer = await chat([
        {
          role: "system",
          content:
            "You are an incident management assistant. Answer the user's question using ONLY the provided JSON rows (live data the user is authorised to see). Be concise and specific; cite incident numbers. If rows are empty, say no matching incidents were found. Never invent data.",
        },
        { role: "user", content: `Question: ${message}\n\nData: ${JSON.stringify(compact)}` },
      ]);
    } else {
      // Deterministic fallback phrasing.
      if (!compact.length) answer = "I couldn't find any incidents matching that.";
      else if (intent === "lookup") {
        const r = compact[0];
        answer = `${r.number}: "${r.title}" is currently ${r.status}` +
          (r.assignee ? `, assigned to ${r.assignee}.` : ".");
      } else {
        answer = `I found ${compact.length} matching incident(s):\n` +
          compact.map((r) => `• ${r.number} — ${r.title} (${r.status})`).join("\n");
      }
    }

    return jsonResponse({ intent, answer, incidents: compact });
  } catch (err) {
    console.error("chatbot error:", err instanceof Error ? err.message : err);
    return jsonResponse({ error: "chatbot_failed", detail: String(err) }, 500);
  }
});
