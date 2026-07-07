import { useRef } from 'react';
import { FileText, Loader2, Sparkles, Upload, AlertTriangle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useLatestExtraction, useStartExtraction } from '@/hooks/useExtraction';
import type { DocumentExtraction } from '@/lib/types';

// Failure reason → customer-language message (mirrors the spec's edge cases).
const FAILURE_MESSAGES: Record<string, string> = {
  unsupported_type: 'Unsupported file type — extraction not available. The attachment has been kept.',
  too_large: 'This document is too large to extract (over 20 pages). The attachment has been kept.',
  password_protected: "This document is password-protected, so it couldn't be read. The attachment has been kept.",
  corrupt: "This document couldn't be opened, so extraction couldn't run. The attachment has been kept.",
  no_text: 'No readable text was found (it may be a scanned image), so extraction couldn\'t run. The attachment has been kept.',
  model_error: "We couldn't extract fields from this document. The attachment has been kept.",
  internal: 'Something went wrong during extraction. The attachment has been kept.',
};

function Group({ title, empty, children }: { title: string; empty: boolean; children?: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1 text-sm font-medium">{title}</p>
      {empty ? (
        <p className="text-sm text-muted-foreground">None found</p>
      ) : (
        <ul className="space-y-1 text-sm">{children}</ul>
      )}
    </div>
  );
}

function Results({ ext }: { ext: DocumentExtraction }) {
  const { parties, key_dates, key_terms } = ext.result;
  return (
    <div className="grid gap-4">
      <Group title="Parties" empty={!parties?.length}>
        {parties?.map((p, i) => (
          <li key={i}>{p.name}{p.role ? <span className="text-muted-foreground"> — {p.role}</span> : null}</li>
        ))}
      </Group>
      <Group title="Key Dates" empty={!key_dates?.length}>
        {key_dates?.map((d, i) => (
          <li key={i}><span className="text-muted-foreground">{d.label}:</span> {d.date}</li>
        ))}
      </Group>
      <Group title="Key Terms" empty={!key_terms?.length}>
        {key_terms?.map((t, i) => (
          <li key={i}><span className="text-muted-foreground">{t.label}:</span> {t.value}</li>
        ))}
      </Group>
    </div>
  );
}

/**
 * Shows extracted fields BESIDE the source document. Left = the source
 * (filename + upload control); right = Parties / Key Dates / Key Terms.
 */
export function ExtractionPanel({ incidentId }: { incidentId: string }) {
  const { data: ext } = useLatestExtraction(incidentId);
  const start = useStartExtraction(incidentId);
  const fileRef = useRef<HTMLInputElement>(null);

  const busy = start.isPending || ext?.status === 'pending' || ext?.status === 'running';

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Sparkles className="size-4 text-primary" /> Document Field Extraction
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid gap-6 md:grid-cols-2">
          {/* Left: source document */}
          <div className="space-y-3">
            <p className="text-sm font-medium text-muted-foreground">Source document</p>
            {ext ? (
              <div className="flex items-center gap-2 rounded-md border p-3 text-sm">
                <FileText className="size-4 shrink-0 text-muted-foreground" />
                <span className="truncate">{ext.file_name ?? ext.storage_path}</span>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No document extracted yet.</p>
            )}
            <input
              ref={fileRef}
              type="file"
              accept=".pdf,.docx"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) start.mutate(f);
                e.target.value = '';
              }}
            />
            <Button variant="outline" size="sm" disabled={busy} onClick={() => fileRef.current?.click()}>
              <Upload className="size-4" /> {ext ? 'Replace & re-extract' : 'Attach & extract'}
            </Button>
            <p className="text-xs text-muted-foreground">PDF or DOCX, up to 20 pages.</p>
          </div>

          {/* Right: extracted fields */}
          <div className="space-y-3 md:border-l md:pl-6">
            <p className="text-sm font-medium text-muted-foreground">Extracted fields</p>

            {!ext && <p className="text-sm text-muted-foreground">Attach a document to see extracted parties, dates, and terms.</p>}

            {ext && (ext.status === 'pending' || ext.status === 'running') && (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" /> Extracting… (up to 30s)
              </p>
            )}

            {ext?.status === 'failed' && (
              <p className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                {FAILURE_MESSAGES[ext.failure_reason ?? 'internal'] ?? FAILURE_MESSAGES.internal}
              </p>
            )}

            {ext?.status === 'succeeded' && <Results ext={ext} />}
          </div>
        </div>
        {start.isError && (
          <p className="mt-3 text-sm text-destructive">Couldn't start extraction. Please try again.</p>
        )}
      </CardContent>
    </Card>
  );
}
