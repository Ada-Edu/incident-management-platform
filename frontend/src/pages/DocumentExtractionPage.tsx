import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ScanText } from 'lucide-react';
import { useIncidents } from '@/hooks/useIncidents';
import { Card, CardContent } from '@/components/ui/card';
import { Select } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { ExtractionPanel } from '@/components/incidents/ExtractionPanel';

/**
 * Standalone entry point for Document Field Extraction. A document is always
 * attached to an incident (that's the record it belongs to), so the user first
 * picks the incident, then uploads a PDF/DOCX. The upload + results UI is the
 * same ExtractionPanel used on the incident detail page.
 */
export function DocumentExtractionPage() {
  const { data, isLoading } = useIncidents({ pageSize: 100 });
  const incidents = data?.rows ?? [];
  const [incidentId, setIncidentId] = useState('');

  // Default to the most recent incident once the list loads.
  useEffect(() => {
    if (!incidentId && incidents.length) setIncidentId(incidents[0].id);
  }, [incidents, incidentId]);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold">
          <ScanText className="size-6 text-primary" /> Document Field Extraction
        </h1>
        <p className="text-sm text-muted-foreground">
          Upload a PDF or DOCX and the assistant extracts the parties, key dates, and key terms,
          shown beside the source. The document is attached to the incident you choose below.
        </p>
      </div>

      <Card>
        <CardContent className="flex flex-wrap items-end gap-4 p-4">
          <div className="min-w-[280px] flex-1 space-y-1.5">
            <Label htmlFor="incident">Attach to incident</Label>
            <Select
              id="incident"
              value={incidentId}
              onChange={(e) => setIncidentId(e.target.value)}
              disabled={isLoading || !incidents.length}
            >
              {!incidents.length && <option value="">No incidents available</option>}
              {incidents.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.incident_number} — {i.title}
                </option>
              ))}
            </Select>
          </div>
          {incidentId && (
            <Link to={`/incidents/${incidentId}`} className="text-sm text-primary hover:underline">
              Open incident →
            </Link>
          )}
        </CardContent>
      </Card>

      {incidentId ? (
        <ExtractionPanel incidentId={incidentId} />
      ) : (
        <p className="text-sm text-muted-foreground">
          {isLoading ? 'Loading incidents…' : 'Select an incident above to upload a document.'}
        </p>
      )}
    </div>
  );
}
