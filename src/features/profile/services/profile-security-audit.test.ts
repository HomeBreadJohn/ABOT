import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  PROFILE_SERVICE_ERROR_CODES,
  getCurrentProfile,
  updateCurrentPreferredLanguage,
} from "@/features/profile/services/profile-service";
import type { PreferredLanguageInput } from "@/features/profile/schemas/preferred-language";
import { createClient } from "@/lib/supabase/server";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

const repoRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../..",
);
const initialMigrationPath = join(
  repoRoot,
  "supabase",
  "migrations",
  "20261112000000_initial_schema.sql",
);
const profileMigrationPath = join(
  repoRoot,
  "supabase",
  "migrations",
  "20261114000000_profile_preferred_language.sql",
);

type MockSupabase = {
  auth: {
    getClaims: ReturnType<typeof vi.fn>;
  };
  from: ReturnType<typeof vi.fn>;
  profileSelectEq: ReturnType<typeof vi.fn>;
  profileUpdateEq: ReturnType<typeof vi.fn>;
  profileUpdateSelect: ReturnType<typeof vi.fn>;
};

function configureSupabase({
  userId,
  profile = { preferred_language: "en" },
  updatedProfile = { preferred_language: "fil" },
  authError = null,
}: {
  userId?: string;
  profile?: { preferred_language: string } | null;
  updatedProfile?: { preferred_language: string } | null;
  authError?: Error | null;
} = {}): MockSupabase {
  const profileSelectMaybeSingle = vi
    .fn()
    .mockResolvedValue({ data: profile, error: null });
  const profileSelectEq = vi
    .fn()
    .mockReturnValue({ maybeSingle: profileSelectMaybeSingle });
  const profileSelect = vi.fn().mockReturnValue({ eq: profileSelectEq });

  const profileUpdateMaybeSingle = vi
    .fn()
    .mockResolvedValue({ data: updatedProfile, error: null });
  const profileUpdateSelect = vi
    .fn()
    .mockReturnValue({ maybeSingle: profileUpdateMaybeSingle });
  const profileUpdateEq = vi
    .fn()
    .mockReturnValue({ select: profileUpdateSelect });
  const profileUpdate = vi.fn().mockReturnValue({ eq: profileUpdateEq });

  const supabase: MockSupabase = {
    auth: {
      getClaims: vi.fn().mockResolvedValue({
        data: userId ? { claims: { sub: userId } } : { claims: null },
        error: authError,
      }),
    },
    from: vi.fn().mockReturnValue({
      select: profileSelect,
      update: profileUpdate,
    }),
    profileSelectEq,
    profileUpdateEq,
    profileUpdateSelect,
  };

  vi.mocked(createClient).mockResolvedValue(supabase as never);
  return supabase;
}

function migration(name: string) {
  return readFileSync(name, "utf8").replace(/\s+/g, " ").trim();
}

describe("profile ownership security audit: profile-service.ts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("derives profile reads from the authenticated session identifier", async () => {
    const sessionUserId = "session-user-id";
    const supabase = configureSupabase({ userId: sessionUserId });

    await expect(getCurrentProfile()).resolves.toEqual({
      preferredLanguage: "en",
    });

    expect(supabase.from).toHaveBeenCalledWith("profiles");
    expect(supabase.profileSelectEq).toHaveBeenCalledWith("id", sessionUserId);
  });

  it("derives profile writes from the authenticated session identifier", async () => {
    const sessionUserId = "session-user-id";
    const supabase = configureSupabase({ userId: sessionUserId });

    await expect(updateCurrentPreferredLanguage("fil")).resolves.toEqual({
      preferredLanguage: "fil",
    });

    expect(supabase.profileUpdateEq).toHaveBeenCalledWith("id", sessionUserId);
    expect(supabase.profileUpdateSelect).toHaveBeenCalledWith(
      "preferred_language",
    );
  });

  it("rejects unauthenticated profile reads before any profile query", async () => {
    const supabase = configureSupabase();

    await expect(getCurrentProfile()).rejects.toMatchObject({
      code: PROFILE_SERVICE_ERROR_CODES.authenticationRequired,
    });

    expect(supabase.from).not.toHaveBeenCalled();
  });

  it("rejects unauthenticated profile writes before any profile mutation", async () => {
    const supabase = configureSupabase();

    await expect(updateCurrentPreferredLanguage("fil")).rejects.toMatchObject({
      code: PROFILE_SERVICE_ERROR_CODES.authenticationRequired,
    });

    expect(supabase.from).not.toHaveBeenCalled();
  });

  it("ignores a mismatched client owner argument and keeps the session owner", async () => {
    const sessionUserId = "session-user-id";
    const clientOwnerId = "different-client-owner-id";
    const supabase = configureSupabase({
      userId: sessionUserId,
      updatedProfile: { preferred_language: "taglish" },
    });
    const updateWithClientOwner = updateCurrentPreferredLanguage as unknown as (
      language: PreferredLanguageInput,
      ownerId?: string,
    ) => Promise<unknown>;

    await expect(
      updateWithClientOwner("taglish", clientOwnerId),
    ).resolves.toEqual({ preferredLanguage: "taglish" });

    expect(supabase.profileUpdateEq).toHaveBeenCalledWith("id", sessionUserId);
    expect(supabase.profileUpdateEq).not.toHaveBeenCalledWith(
      "id",
      clientOwnerId,
    );
  });

  it("rejects a client owner field instead of selecting another profile", async () => {
    const supabase = configureSupabase({ userId: "session-user-id" });
    const maliciousRequest = {
      preferred_language: "fil",
      owner_id: "different-client-owner-id",
    } as unknown as PreferredLanguageInput;
    const storedLanguage = "en";

    await expect(
      updateCurrentPreferredLanguage(maliciousRequest),
    ).rejects.toMatchObject({
      code: PROFILE_SERVICE_ERROR_CODES.invalidPreferredLanguage,
    });

    expect(supabase.from).not.toHaveBeenCalled();
    expect(storedLanguage).toBe("en");
  });

  it("preserves the previous profile value when the language request is invalid", async () => {
    const supabase = configureSupabase({ userId: "session-user-id" });
    const previousLanguage = "en";
    let persistedLanguage = previousLanguage;

    await expect(
      updateCurrentPreferredLanguage("spanish" as PreferredLanguageInput),
    ).rejects.toMatchObject({
      code: PROFILE_SERVICE_ERROR_CODES.invalidPreferredLanguage,
    });

    persistedLanguage = previousLanguage;
    expect(persistedLanguage).toBe("en");
    expect(supabase.from).not.toHaveBeenCalled();
  });
});

describe("migration and policy security audit: Supabase SQL sources", () => {
  const initialSql = migration(initialMigrationPath);
  const profileSql = migration(profileMigrationPath);

  it("keeps profiles RLS, owner-only policies, and the auth-user profile trigger", () => {
    expect(initialSql).toContain(
      "alter table public.profiles enable row level security",
    );
    expect(initialSql).toContain(
      'create policy "Users can view their profile" on public.profiles for select to authenticated using (id = (select auth.uid()));',
    );
    expect(initialSql).toContain(
      'create policy "Users can update their profile" on public.profiles for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));',
    );
    expect(initialSql).toContain(
      "create or replace function public.handle_new_user()",
    );
    expect(initialSql).toContain(
      "insert into public.profiles (id, full_name) values (new.id, nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''));",
    );
    expect(initialSql).toContain(
      "create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();",
    );
  });

  it("keeps the preferred-language normalization and database check", () => {
    expect(profileSql).toContain(
      "update public.profiles set preferred_language = 'en' where preferred_language not in ('en', 'fil', 'taglish');",
    );
    expect(profileSql).toContain(
      "alter table public.profiles add constraint profiles_preferred_language_values_check check (preferred_language in ('en', 'fil', 'taglish'));",
    );
  });

  it.each([
    [
      "documents",
      'create policy "Owners and explicit recipients can view documents" on public.documents for select to authenticated',
      "user_id = (select auth.uid())",
      "shares.shared_with_user_id = (select auth.uid())",
      'create policy "Users can create their own documents" on public.documents for insert to authenticated with check (user_id = (select auth.uid()))',
      'create policy "Owners can update documents" on public.documents for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))',
      'create policy "Owners can delete documents" on public.documents for delete to authenticated using (user_id = (select auth.uid()))',
    ],
    [
      "analyses",
      'create policy "Owners and explicit recipients can view analyses" on public.document_analyses for select to authenticated',
      "user_id = (select auth.uid())",
      "shares.shared_with_user_id = (select auth.uid())",
      'create policy "Document owners can create analyses" on public.document_analyses for insert to authenticated with check (user_id = (select auth.uid()) and exists (select 1 from public.documents where id = document_id and user_id = (select auth.uid())))',
      'create policy "Document owners can update analyses" on public.document_analyses for update to authenticated using (user_id = (select auth.uid()) and exists (select 1 from public.documents where id = document_id and user_id = (select auth.uid()))) with check (user_id = (select auth.uid()) and exists (select 1 from public.documents where id = document_id and user_id = (select auth.uid())))',
      'create policy "Document owners can delete analyses" on public.document_analyses for delete to authenticated using (user_id = (select auth.uid()))',
    ],
    [
      "tasks",
      'create policy "Owners and explicit recipients can view tasks" on public.document_tasks for select to authenticated',
      "user_id = (select auth.uid())",
      "shares.shared_with_user_id = (select auth.uid())",
      'create policy "Document owners can create tasks" on public.document_tasks for insert to authenticated with check (user_id = (select auth.uid()) and exists (select 1 from public.documents where id = document_id and user_id = (select auth.uid())))',
      'create policy "Document owners can update tasks" on public.document_tasks for update to authenticated using (user_id = (select auth.uid()) and exists (select 1 from public.documents where id = document_id and user_id = (select auth.uid()))) with check (user_id = (select auth.uid()) and exists (select 1 from public.documents where id = document_id and user_id = (select auth.uid())))',
      'create policy "Document owners can delete tasks" on public.document_tasks for delete to authenticated using (user_id = (select auth.uid()))',
    ],
    [
      "shares",
      'create policy "Owners and recipients can view shares" on public.document_shares for select to authenticated',
      "owner_id = (select auth.uid())",
      "shared_with_user_id = (select auth.uid())",
      'create policy "Owners can create shares" on public.document_shares for insert to authenticated with check (owner_id = (select auth.uid()) and exists (select 1 from public.documents where id = document_id and user_id = (select auth.uid())))',
      'create policy "Owners can update shares" on public.document_shares for update to authenticated using (owner_id = (select auth.uid()) and exists (select 1 from public.documents where id = document_id and user_id = (select auth.uid()))) with check (owner_id = (select auth.uid()) and exists (select 1 from public.documents where id = document_id and user_id = (select auth.uid())))',
      'create policy "Owners can delete shares" on public.document_shares for delete to authenticated using (owner_id = (select auth.uid()))',
    ],
    [
      "processing jobs",
      'create policy "Owners can view processing jobs" on public.processing_jobs for select to authenticated using (user_id = (select auth.uid()))',
      "user_id = (select auth.uid())",
      'create policy "Owners can create processing jobs" on public.processing_jobs for insert to authenticated with check (user_id = (select auth.uid()) and exists (select 1 from public.documents where id = document_id and user_id = (select auth.uid())))',
      'create policy "Owners can update processing jobs" on public.processing_jobs for update to authenticated using (user_id = (select auth.uid()) and exists (select 1 from public.documents where id = document_id and user_id = (select auth.uid()))) with check (user_id = (select auth.uid()) and exists (select 1 from public.documents where id = document_id and user_id = (select auth.uid())))',
    ],
  ])(
    "preserves owner or explicit-share restrictions for %s in 20261112000000_initial_schema.sql",
    (_resource, ...policyShapes: string[]) => {
      for (const policyShape of policyShapes) {
        expect(initialSql).toContain(policyShape);
      }
    },
  );

  it("keeps private Storage ownership and documents-bucket restrictions", () => {
    expect(initialSql).toContain(
      "values ( 'documents', 'documents', false, 10485760",
    );
    expect(initialSql).toContain(
      "create policy \"Document owners can upload files\" on storage.objects for insert to authenticated with check (bucket_id = 'documents' and (storage.foldername(name))[1] = (select auth.uid()::text));",
    );
    expect(initialSql).toContain(
      "create policy \"Document owners can read files\" on storage.objects for select to authenticated using ( bucket_id = 'documents' and exists (select 1 from public.documents where storage_path = name and user_id = (select auth.uid())) );",
    );
    expect(initialSql).toContain(
      "create policy \"Document owners can update files\" on storage.objects for update to authenticated using (bucket_id = 'documents' and (storage.foldername(name))[1] = (select auth.uid()::text));",
    );
    expect(initialSql).toContain(
      "create policy \"Document owners can delete files\" on storage.objects for delete to authenticated using (bucket_id = 'documents' and (storage.foldername(name))[1] = (select auth.uid()::text));",
    );
  });
});
