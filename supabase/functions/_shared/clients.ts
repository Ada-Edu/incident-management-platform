// Shared Supabase clients + OpenAI helpers for edge functions.
// deno-lint-ignore-file no-explicit-any
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

/**
 * Service-role client: bypasses RLS. Use ONLY for trusted server-side work
 * (writing embeddings, sync jobs). Never expose the service key to the client.
 */
export function adminClient(): SupabaseClient {
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
}

/**
 * User-scoped client: forwards the caller's JWT so RLS applies. Use this when
 * reading data on behalf of the signed-in user (chatbot live queries).
 */
export function userClient(authHeader: string | null): SupabaseClient {
  return createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader ?? "" } },
    auth: { persistSession: false },
  });
}

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
const AI_MODEL = Deno.env.get("AI_MODEL") ?? "gpt-4o-mini";
const EMBEDDING_MODEL = Deno.env.get("AI_EMBEDDING_MODEL") ?? "text-embedding-3-small";

export const aiConfigured = () => Boolean(OPENAI_API_KEY);

/** Compute an embedding vector for a piece of text. */
export async function embed(text: string): Promise<number[]> {
  if (!OPENAI_API_KEY) throw new Error("OPENAI_API_KEY not configured");
  const res = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model: EMBEDDING_MODEL, input: text }),
  });
  if (!res.ok) throw new Error(`Embedding failed: ${await res.text()}`);
  const data = await res.json();
  return data.data[0].embedding;
}

/** Chat completion. Returns the assistant message content. */
export async function chat(
  messages: { role: string; content: string }[],
  opts: { temperature?: number } = {},
): Promise<string> {
  if (!OPENAI_API_KEY) throw new Error("OPENAI_API_KEY not configured");
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: AI_MODEL,
      temperature: opts.temperature ?? 0.2,
      messages,
    }),
  });
  if (!res.ok) throw new Error(`Chat failed: ${await res.text()}`);
  const data = await res.json();
  return data.choices[0].message.content;
}
