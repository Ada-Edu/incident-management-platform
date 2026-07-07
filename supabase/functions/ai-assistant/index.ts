// AI Knowledge Assistant edge function.
//
// Given a new incident's title/description, this:
//   1. Embeds the query text.
//   2. Finds semantically similar past incidents + KB articles (match_knowledge RPC).
//   3. Asks the LLM to synthesise: similar incidents, root cause, resolution steps,
//      known workaround, FAQ, and a confidence score.
//   4. Recommends self-resolution when confidence is high.
//
// Graceful degradation: if OPENAI_API_KEY is not set, it falls back to a
// keyword/trigram search over incidents + KB so the feature still returns
// useful matches in local dev.
// deno-lint-ignore-file no-explicit-any
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { adminClient, userClient, embed, chat, aiConfigured } from "../_shared/clients.ts";

const AUTO_SUGGEST_THRESHOLD = Number(Deno.env.get("AI_AUTOSUGGEST_THRESHOLD") ?? "0.82");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { title, description, incident_id } = await req.json();
    const query = [title, description].filter(Boolean).join("\n").trim();
    if (!query) return jsonResponse({ error: "title or description required" }, 400);

    const admin = adminClient();
    const authHeader = req.headers.get("Authorization");
    const user = userClient(authHeader);
    const { data: { user: authUser } } = await user.auth.getUser();

    let matches: any[] = [];

    if (aiConfigured()) {
      // Semantic path.
      const queryEmbedding = await embed(query);
      const { data, error } = await admin.rpc("match_knowledge", {
        query_embedding: queryEmbedding,
        match_count: 5,
        filter_source_type: null,
        similarity_threshold: 0.5,
      });
      if (error) throw error;
      matches = data ?? [];
    } else {
      // Fallback: trigram similarity over incidents + KB titles.
      const [{ data: inc }, { data: kb }] = await Promise.all([
        admin.from("incidents")
          .select("id,incident_number,title,root_cause,resolution_notes")
          .textSearch("title", query.split(/\s+/).slice(0, 5).join(" | "), { type: "websearch" })
          .limit(3),
        admin.from("kb_articles").select("id,title,body").limit(3),
      ]);
      matches = [
        ...(inc ?? []).map((r: any) => ({
          source_type: "incident", source_id: r.id, similarity: 0.6,
          content: `${r.title}\nRoot cause: ${r.root_cause ?? "n/a"}\nResolution: ${r.resolution_notes ?? "n/a"}`,
          metadata: { incident_number: r.incident_number },
        })),
        ...(kb ?? []).map((r: any) => ({
          source_type: "kb_article", source_id: r.id, similarity: 0.55,
          content: `${r.title}\n${r.body}`, metadata: {},
        })),
      ];
    }

    const topSimilarity = matches.length ? Math.max(...matches.map((m) => m.similarity ?? 0)) : 0;

    let answer = {
      summary: "",
      root_cause: "",
      resolution_steps: [] as string[],
      workaround: "",
      faqs: [] as string[],
      confidence: topSimilarity,
      similar: matches.map((m) => ({
        source_type: m.source_type,
        source_id: m.source_id,
        similarity: Number((m.similarity ?? 0).toFixed(3)),
        reference: m.metadata?.incident_number ?? null,
      })),
      suggest_self_resolution: topSimilarity >= AUTO_SUGGEST_THRESHOLD,
    };

    if (aiConfigured() && matches.length) {
      const context = matches.map((m, i) => `[${i + 1}] (${m.source_type}) ${m.content}`).join("\n\n");
      const raw = await chat([
        {
          role: "system",
          content:
            "You are an IT incident knowledge assistant. Using ONLY the provided context of similar past incidents and knowledge base articles, produce a concise JSON object with keys: summary (string, e.g. 'I found 3 similar incidents...'), root_cause (string), resolution_steps (string[]), workaround (string), faqs (string[]), confidence (0..1 number reflecting how well the context matches). If the context is not relevant, set confidence low. Respond with JSON only.",
        },
        { role: "user", content: `New incident:\n${query}\n\nContext:\n${context}` },
      ]);
      try {
        const parsed = JSON.parse(raw.replace(/```json|```/g, "").trim());
        answer = {
          ...answer,
          ...parsed,
          confidence: parsed.confidence ?? topSimilarity,
          suggest_self_resolution: (parsed.confidence ?? topSimilarity) >= AUTO_SUGGEST_THRESHOLD,
        };
      } catch {
        answer.summary = raw;
      }
    } else if (!matches.length) {
      answer.summary = "No similar incidents found. Please continue logging your incident.";
    }

    // Log the interaction for the learning loop + audit.
    await admin.from("ai_interactions").insert({
      user_id: authUser?.id ?? null,
      incident_id: incident_id ?? null,
      kind: "assistant",
      prompt: query,
      response: answer.summary,
      matched_ids: matches.map((m) => m.source_id),
      confidence: answer.confidence,
    });

    return jsonResponse(answer);
  } catch (err) {
    console.error("ai-assistant error:", err instanceof Error ? err.message : err);
    return jsonResponse({ error: "assistant_failed", detail: String(err) }, 500);
  }
});
