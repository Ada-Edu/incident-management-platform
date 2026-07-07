# Document Field Extraction — Feature Specification

## Overview
When a user attaches a document to an incident, the system automatically reads it and
extracts three groups of information — **Parties**, **Key Dates**, and **Key Terms** — and
displays them beside the source document. Users verify a document's key contents at a
glance instead of reading it end to end; the original attachment is never altered.

## Metadata
- **Feature Name:** Document Field Extraction
- **Status:** Draft
- **Priority:** High
- **Owner:** sifiso.gumede@adaptit.com
- **Created:** 2026-07-07
- **Last Updated:** 2026-07-07

## Problem Statement

**User Problem:** Support agents and clients attach documents (contracts, agreements,
SOWs, vendor letters) to incidents and must read each one manually to find who is
involved, which dates matter, and the notable terms — slow and error-prone.

**Current State:** Users open each attached document and read it in full; identifying
parties, dates, and terms is entirely manual.

**Desired State:** On attaching a supported document, users see the extracted Parties,
Key Dates, and Key Terms beside the source, so they can confirm the key contents quickly
and reliably.

## Goals / Non-Goals

**Goals**
- Automatically extract Parties, Key Dates, and Key Terms from supported attached documents.
- Present extracted information beside the source document for at-a-glance verification.
- Give clear, specific feedback when extraction cannot run.

**Non-Goals**
- Editing or altering the source document.
- Providing legal interpretation, advice, or risk scoring.
- Automatically acting on extracted information (e.g., assigning the incident, sending notices).
- Translating documents into other languages.

## Scope & Definitions
- **Supported formats at launch:** PDF (`.pdf`) and Word (`.docx`). Any other file type
  shows "Unsupported file type — extraction not available"; the attachment is kept.
- **Definition of "Key Term":** notable business or operational terms **explicitly present**
  in the document — monetary amounts, obligations/commitments, service levels (SLAs),
  durations/notice periods, and reference numbers. Key Terms are never inferred beyond the text.
- **Size limit:** documents of **20 pages or fewer** are supported. A document of **more than
  20 pages** is not extracted; the user is told it is too large; the attachment is kept.
- **Field groups (fixed label set):** `{Parties, Key Dates, Key Terms}`. Each group is shown
  under its exact heading from this set.

## User Stories

### Story 1 — Verify a document's key contents at a glance
As a support agent, I want extracted Parties, Key Dates, and Key Terms shown beside a
document I attach, so I can confirm its contents without reading it in full.

**Acceptance Criteria**
- [ ] When a supported document (PDF or DOCX, 20 pages or fewer) is attached, extraction
      runs automatically without a separate user action.
- [ ] The extracted fields appear within 30 seconds for a document of 20 pages or fewer.
- [ ] Results are displayed under three visible headings using the exact labels
      **Parties**, **Key Dates**, and **Key Terms**.
- [ ] Each extracted field is displayed beside the source document, both visible together
      without navigating away from the incident.
- [ ] The original attachment is unchanged and remains downloadable in its original form.

### Story 2 — Trust what I see (nothing invented)
As a support agent, I want the system to show only what is actually in the document, and to
tell me clearly when it cannot extract, so I never act on invented or empty information.

**Acceptance Criteria**
- [ ] Only values explicitly present in the document are shown; no field is inferred or guessed.
- [ ] If a field group has no qualifying content, that group's heading is shown with an
      explicit "None found" state (never left blank or omitted).
- [ ] When extraction cannot run, no partial or guessed fields are shown for any group.
- [ ] When extraction cannot run, the user sees a message that names the reason and states
      that the attachment has been kept.

### Story 3 — See everyone involved and their roles
As a support agent handling a multi-party document, I want every named party listed with
its role, so I understand who is involved.

**Acceptance Criteria**
- [ ] Every distinct party explicitly named in the document is listed under **Parties**.
- [ ] Where the document states a party's role (e.g., buyer, seller, supplier, client),
      that role is shown next to the party's name.
- [ ] Where the document does not state a role for a named party, the party is still listed
      with no role invented.

## Edge Cases
Each case is independently testable. In every failure case: a specific message states that
extraction could not run **and** names the reason, the attachment is retained, and **no**
partial or guessed fields are shown.

- [ ] **Corrupt / unopenable file:** message states the document could not be opened; attachment kept; no fields.
- [ ] **Password-protected file:** message states the document is protected/locked; attachment kept; no fields.
- [ ] **Scanned image with no readable text:** message states no readable text was found; attachment kept; no fields.
- [ ] **Unsupported file type:** message "Unsupported file type — extraction not available"; attachment kept; no fields.
- [ ] **Document larger than 20 pages:** message states the document is too large to extract; attachment kept; no fields.
- [ ] **Supported document, a group with nothing:** all three headings shown; any empty group shows "None found"; nothing invented.

## Success Metrics
- [ ] **Accuracy:** ≥80% of extracted fields are confirmed correct by users, measured across
      user confirmations over a rolling 30-day window.
- [ ] **Speed of identification:** median time to identify parties/dates/terms reduced by
      ≥50% versus a manual baseline captured over the two weeks before launch.
- [ ] **Adoption:** ≥60% of attached supported documents have their extracted fields viewed.
- [ ] **Latency:** ≥95% of documents of 20 pages or fewer return extracted fields within 30 seconds.

## Open Questions (non-gating)
- Should users be able to flag or correct an individual extracted field, and should those
  corrections feed back into accuracy measurement?
- Should a page count be shown to the user before extraction begins?
- Which additional file formats (if any) are prioritized after launch? (Launch scope is fixed
  to PDF and DOCX.)
