# Generator Surat Pesanan PBJ

A private, single-user application for preparing, generating, and archiving procurement order documents.

## Project boundaries

- Dedicated Supabase project: `generator-dokumen-pbj` (`cqjlauziuceqbxcarsvs`, Singapore).
- Dedicated GitHub repository: `bpbjlabuhanbatuselatan/generator-surat-pesanan`.
- No dependency on, migration from, or modification of previous Supabase projects.
- One PPBJ login. No OPD accounts and no additional admin roles.
- Main application areas: **Buat Surat** and **Data Surat**.

## Current implementation

- [x] Dedicated Supabase project created and verified healthy.
- [x] Ten core database tables created with RLS enabled.
- [x] Five private storage buckets created: kop-surat, tanda-tangan, foto-produk, dokumen-pendukung, arsip-pdf.
- [x] Owner-scoped row policies and same-owner relational constraints.
- [x] Vite + React application foundation.
- [x] Supabase email/password login screen.
- [x] Initial dashboard, package identity form, draft saving, and searchable archive list.
- [ ] Add item rows, providers, price references, review form, and document uploads.
- [ ] Implement Word-template-faithful PDF generation and pagination.
- [ ] Configure the first PPBJ login and application environment.
- [ ] Run build, integration, and end-to-end tests.

## Local development

1. Install Node.js (LTS).
2. Run `npm install`.
3. Copy `.env.example` to `.env.local`.
4. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` using the new project's API settings. Use only the publishable/anon key in browser code; never use `service_role`.
5. Run `npm run dev`; create a production bundle with `npm run build`.

## Security

- Public sign-up should remain disabled; create/invite the single PPBJ user from Supabase Authentication.
- Browser access uses only the publishable/anon key and relies on RLS.
- Storage buckets are private. Upload paths must begin with the authenticated user's UUID.
- Never commit passwords, service-role keys, or other secrets.
- Keep this application isolated from all unrelated projects.
