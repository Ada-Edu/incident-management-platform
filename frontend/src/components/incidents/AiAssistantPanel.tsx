import { Sparkles, Lightbulb, CheckCircle2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import type { AiAssistantResponse } from '@/lib/types';

/**
 * Renders the AI Knowledge Assistant result shown while a user logs a new
 * incident. Surfaces similar incidents, root cause, resolution steps, and a
 * self-resolution suggestion when confidence is high.
 */
export function AiAssistantPanel({
  loading,
  result,
  onSelfResolve,
}: {
  loading: boolean;
  result: AiAssistantResponse | null;
  onSelfResolve?: () => void;
}) {
  return (
    <Card className="border-primary/30 bg-primary/5">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Sparkles className="size-4 text-primary" />
          AI Knowledge Assistant
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        {loading && (
          <div className="space-y-2">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-2/3" />
          </div>
        )}

        {!loading && !result && (
          <p className="text-muted-foreground">
            Enter a title and description, then run the assistant to check for known solutions
            before creating a support assignment.
          </p>
        )}

        {!loading && result && (
          <>
            <div className="flex items-center justify-between">
              <p className="font-medium">{result.summary}</p>
              <Badge color={result.confidence >= 0.82 ? '#22c55e' : result.confidence >= 0.5 ? '#f59e0b' : '#64748b'}>
                {Math.round((result.confidence ?? 0) * 100)}% match
              </Badge>
            </div>

            {result.root_cause && (
              <div>
                <p className="font-medium">Likely root cause</p>
                <p className="text-muted-foreground">{result.root_cause}</p>
              </div>
            )}

            {result.resolution_steps?.length > 0 && (
              <div>
                <p className="mb-1 flex items-center gap-1 font-medium">
                  <Lightbulb className="size-4" /> Suggested resolution
                </p>
                <ol className="list-decimal space-y-1 pl-5 text-muted-foreground">
                  {result.resolution_steps.map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ol>
              </div>
            )}

            {result.workaround && (
              <div>
                <p className="font-medium">Known workaround</p>
                <p className="text-muted-foreground">{result.workaround}</p>
              </div>
            )}

            {result.similar?.length > 0 && (
              <p className="text-xs text-muted-foreground">
                Based on {result.similar.length} similar item(s)
                {result.similar[0]?.reference ? ` (e.g. ${result.similar[0].reference})` : ''}.
              </p>
            )}

            {result.suggest_self_resolution && (
              <div className="rounded-md border border-green-500/40 bg-green-500/10 p-3">
                <p className="flex items-center gap-1 font-medium text-green-700 dark:text-green-400">
                  <CheckCircle2 className="size-4" /> This looks self-resolvable
                </p>
                <p className="mt-1 text-muted-foreground">
                  A high-confidence solution exists. Try the steps above before creating a ticket.
                </p>
                {onSelfResolve && (
                  <button
                    onClick={onSelfResolve}
                    className="mt-2 text-sm font-medium text-primary underline-offset-4 hover:underline"
                  >
                    Mark as self-resolved
                  </button>
                )}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
