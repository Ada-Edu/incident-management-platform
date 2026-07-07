/** Thin wrappers around the Supabase edge functions (AI + Zendesk). */
import { supabase } from './supabase';
import type { AiAssistantResponse } from './types';

async function invoke<T>(fn: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke(fn, { body });
  if (error) throw error;
  return data as T;
}

export const api = {
  aiAssistant: (input: { title: string; description?: string; incident_id?: string }) =>
    invoke<AiAssistantResponse>('ai-assistant', input),

  chatbot: (message: string) =>
    invoke<{ intent: string; answer: string; incidents: unknown[]; count?: number }>(
      'chatbot',
      { message },
    ),

  zendeskSync: (trigger_type: 'manual' | 'scheduled' = 'manual') =>
    invoke<{ ok: boolean; created: number; updated: number; errors: number }>(
      'zendesk-sync',
      { trigger_type },
    ),
};
