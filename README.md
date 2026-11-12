# Document AI Foundation

A modular Next.js foundation for a secure, document-centric AI workspace. The display name, tagline, and other temporary identity details are centralized in `src/config/brand.ts` so the final product identity can change without editing individual UI components.

## Stack

- Next.js App Router and TypeScript strict mode
- Tailwind CSS v4 with a small shadcn/ui-style component layer
- Supabase Auth, PostgreSQL, SSR helpers, and private Storage
- Zod for request and AI-output validation
- Lucide React for icons
- Vercel-compatible server routes

The Lumen provider is intentionally a non-functional placeholder. No API endpoint, model name, SDK method, request shape, or response shape has been inferred. The provider will only be implemented after its official API documentation is supplied.

## Requirements

- Node.js 20.9 or newer
- npm
- A Supabase project for hosted use
- Docker and the Supabase CLI for local database development

## Local setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy `.env.example` to `.env.local` and fill in the Supabase values. Keep the service-role key server-only. Leave the Lumen variables blank until the official API contract is available.

3. Apply the database migration to a local Supabase instance:

   ```bash
   npm run db:start
   npm run db:reset
   ```

   For a hosted Supabase project, link the project with the Supabase CLI and run `supabase db push`.

4. Start the development server:

   ```bash
   npm run dev
   ```

5. Open the local URL and register an account. The protected dashboard requires a valid Supabase session.

## Environment variables

| Variable                        | Runtime            | Purpose                                                                                   |
| ------------------------------- | ------------------ | ----------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`      | Browser and server | Supabase project URL                                                                      |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Browser and server | Supabase public anonymous key                                                             |
| `SUPABASE_SERVICE_ROLE_KEY`     | Server only        | Creates authorized short-lived signed URLs after an explicit database authorization check |
| `LUMEN_API_KEY`                 | Server only        | Reserved for the official Lumen API integration                                           |
| `LUMEN_API_BASE_URL`            | Server only        | Reserved for the official Lumen API base URL                                              |
| `LUMEN_MODEL`                   | Server only        | Reserved for the official Lumen model identifier                                          |

Environment values are validated with Zod when their runtime client or service is created. Never add real credentials to committed files.

## Database and security

The initial migration at `supabase/migrations/20261112000000_initial_schema.sql` creates profiles, documents, analyses, tasks, shares, and processing jobs with UUID keys, foreign keys, timestamps, indexes, constraints, and update triggers.

It also:

- Enables Row Level Security on every application table.
- Restricts owner mutations to the authenticated owner.
- Allows shared reads only through explicit `document_shares` records.
- Creates a private `documents` Storage bucket.
- Restricts direct Storage object operations to paths whose first segment is the authenticated owner's UUID.
- Uses an authenticated server route to issue 60-second signed URLs after checking document ownership or an explicit share.

Use storage paths shaped like `<owner-user-id>/<document-id>/<safe-filename>`. Do not expose service-role credentials to client code.

## Checks

```bash
npm run typecheck
npm run lint
npm run format:check
npm run build
```

The build and type checks do not require making a Lumen request. Supabase credentials are required when running the application routes that access Supabase.

## Project structure

```text
src/
  app/                 App Router pages, layouts, and server route handlers
  components/          Shared layout and UI components
  config/              Centralized application configuration
  features/            Feature-owned UI, schemas, and services
  lib/                 Supabase, validation, AI, and utility modules
  types/               Database type contract
supabase/
  migrations/          Versioned database schema and RLS policies
  seed.sql             Intentionally empty of demo user data
```

Future background work can be attached to `processing_jobs` through Inngest or Supabase Queues. No queue runtime is introduced in this foundation.

## Manual configuration still required

- Create a Supabase project and set its URL and public anonymous key.
- Set the server-only service-role key in the Vercel project environment, never in browser-exposed variables.
- Apply the migration and confirm the `documents` bucket remains private.
- Configure Supabase Auth email settings and redirect URLs for the deployed app.
- Provide the official Lumen API documentation and credentials before implementing `src/lib/ai/providers/lumen-provider.ts`.
