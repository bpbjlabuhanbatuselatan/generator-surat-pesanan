# Generator Surat Pesanan PBJ

A dedicated application for preparing, reviewing, generating, and archiving procurement order documents (Surat Pesanan PBJ).

## Project boundaries

- This is a standalone project.
- Supabase project: `generator-dokumen-pbj` (`cqjlauziuceqbxcarsvs`, Singapore).
- No dependency on, migration from, or modification of any previous Supabase project.
- Do not reuse credentials, database objects, storage buckets, RPCs, or application code from unrelated projects without explicit approval.

## Intended workflow

1. OPD submits a procurement document request through a dedicated form link.
2. PPBJ reviews the submission and supporting documents.
3. PPBJ completes procurement data, product details, supplier/price comparison, and review information.
4. The application assembles the agreed document sections into a single PDF.
5. Final PDFs are archived and searchable.

## Initial implementation status

- [x] Dedicated Supabase project created and verified healthy.
- [x] Dedicated GitHub repository connected and verified.
- [x] Confirmed the new Supabase project's `public` schema has no tables yet.
- [x] Confirmed the new Supabase project has no Edge Functions yet.
- [ ] Confirm final form fields and document-generation rules.
- [ ] Design database schema and Row Level Security policies.
- [ ] Implement authentication and OPD submission workflow.
- [ ] Implement document assembly and PDF export.
- [ ] Test the complete workflow before production use.

## Security rules

- Never commit Supabase secret/service-role keys, passwords, or private credentials.
- Browser code may use only the project's publishable key (or legacy anon key where applicable), protected by appropriate RLS policies.
- All exposed database tables must have reviewed RLS policies.
- Keep this application isolated from other projects.

## Status

Planning and foundation setup. No database tables or application features have been deployed yet.
