import { Check } from 'lucide-react';
import { WORKFLOW_STAGES } from '@/lib/constants';
import { cn, formatDate } from '@/lib/utils';

interface HistoryEntry {
  to_status_id: string;
  status_key?: string;
  status_name?: string;
  entered_at: string;
  exited_at: string | null;
  changed_by_name?: string | null;
}

/**
 * Vertical workflow timeline. Highlights the current stage and, where history is
 * available, shows who moved it and how long it spent in each stage.
 */
export function WorkflowTimeline({
  currentKey,
  history = [],
}: {
  currentKey: string;
  history?: HistoryEntry[];
}) {
  const currentIndex = WORKFLOW_STAGES.findIndex((s) => s.key === currentKey);

  return (
    <ol className="relative space-y-6 border-l border-border pl-6">
      {WORKFLOW_STAGES.map((stage, i) => {
        const done = i < currentIndex;
        const active = i === currentIndex;
        const entry = history.find((h) => h.status_key === stage.key);
        return (
          <li key={stage.key} className="relative">
            <span
              className={cn(
                'absolute -left-[31px] flex size-5 items-center justify-center rounded-full border-2',
                done && 'border-green-500 bg-green-500 text-white',
                active && 'border-primary bg-primary text-primary-foreground',
                !done && !active && 'border-border bg-background',
              )}
            >
              {done && <Check className="size-3" />}
            </span>
            <div className="flex flex-col">
              <span className={cn('text-sm font-medium', active && 'text-primary', !done && !active && 'text-muted-foreground')}>
                {stage.name}
              </span>
              {entry && (
                <span className="text-xs text-muted-foreground">
                  {formatDate(entry.entered_at)}
                  {entry.changed_by_name ? ` · ${entry.changed_by_name}` : ''}
                </span>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
