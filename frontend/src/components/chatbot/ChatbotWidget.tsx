import { useState, useRef, useEffect } from 'react';
import { MessageCircle, X, Send, Bot } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { api } from '@/lib/api';

interface Msg {
  role: 'user' | 'assistant';
  text: string;
}

const SUGGESTIONS = [
  'How many incidents are currently open?',
  'Which incidents breached SLA?',
  'Show high-priority incidents',
  'How do I reset my VPN password?',
];

/**
 * Global AI chatbot. Available on every page via the fixed launcher button.
 * Sends questions to the `chatbot` edge function, which runs RLS-scoped live
 * queries and returns a natural-language answer.
 */
export function ChatbotWidget() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([
    { role: 'assistant', text: 'Hi! Ask me about incidents, SLAs, or how to resolve common issues.' },
  ]);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, open]);

  async function send(text: string) {
    if (!text.trim() || busy) return;
    setMessages((m) => [...m, { role: 'user', text }]);
    setInput('');
    setBusy(true);
    try {
      const res = await api.chatbot(text);
      setMessages((m) => [...m, { role: 'assistant', text: res.answer }]);
    } catch {
      setMessages((m) => [
        ...m,
        { role: 'assistant', text: 'Sorry, I could not reach the assistant. Please try again.' },
      ]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen((o) => !o)}
        className="fixed bottom-5 right-5 z-50 flex size-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform hover:scale-105"
        aria-label="Open assistant"
      >
        {open ? <X className="size-6" /> : <MessageCircle className="size-6" />}
      </button>

      {open && (
        <div className="fixed bottom-24 right-5 z-50 flex h-[32rem] w-[22rem] flex-col overflow-hidden rounded-xl border bg-card shadow-2xl">
          <div className="flex items-center gap-2 border-b bg-primary px-4 py-3 text-primary-foreground">
            <Bot className="size-5" />
            <span className="font-medium">Incident Assistant</span>
          </div>

          <div className="flex-1 space-y-3 overflow-y-auto p-4">
            {messages.map((m, i) => (
              <div
                key={i}
                className={cn('flex', m.role === 'user' ? 'justify-end' : 'justify-start')}
              >
                <div
                  className={cn(
                    'max-w-[85%] whitespace-pre-wrap rounded-lg px-3 py-2 text-sm',
                    m.role === 'user'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-foreground',
                  )}
                >
                  {m.text}
                </div>
              </div>
            ))}
            {busy && <div className="text-xs text-muted-foreground">Assistant is typing…</div>}
            {messages.length === 1 && (
              <div className="space-y-1.5 pt-2">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => send(s)}
                    className="block w-full rounded-md border px-3 py-1.5 text-left text-xs text-muted-foreground hover:bg-accent"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
            <div ref={endRef} />
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              send(input);
            }}
            className="flex items-center gap-2 border-t p-3"
          >
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask a question…"
              disabled={busy}
            />
            <Button type="submit" size="icon" disabled={busy}>
              <Send className="size-4" />
            </Button>
          </form>
        </div>
      )}
    </>
  );
}
