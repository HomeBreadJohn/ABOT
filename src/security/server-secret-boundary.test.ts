import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { beforeEach, describe, expect, it, vi } from "vitest";

const { createClientMock, getCurrentProfileMock } = vi.hoisted(() => ({
  createClientMock: vi.fn(),
  getCurrentProfileMock: vi.fn(),
}));

vi.mock("@/lib/supabase/client", () => ({
  createClient: createClientMock,
}));

vi.mock("@/features/profile/services/profile-service", () => ({
  PROFILE_SERVICE_ERROR_CODES: {
    authenticationRequired: "AUTHENTICATION_REQUIRED",
    invalidPreferredLanguage: "INVALID_PREFERRED_LANGUAGE",
    profileMissing: "PROFILE_MISSING",
    profileReadFailed: "PROFILE_READ_FAILED",
    profileUpdateFailed: "PROFILE_UPDATE_FAILED",
  },
  ProfileServiceError: class MockProfileServiceError extends Error {
    readonly code: string;

    constructor(code: string) {
      super("mock profile service error");
      this.code = code;
    }
  },
  getCurrentProfile: getCurrentProfileMock,
  updateCurrentPreferredLanguage: vi.fn(),
}));

import {
  AUTHENTICATION_MESSAGES,
  AuthenticationError,
  signIn,
} from "@/features/authentication/services/authenticate";
import { GET as getProfile } from "@/app/api/profile/route";

const sourceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourceExtensions = [".ts", ".tsx", ".js", ".jsx"];
const secretNames = [
  "SUPABASE_SERVICE_ROLE_KEY",
  "LUMEN_API_KEY",
  "LUMEN_API_BASE_URL",
  "LUMEN_MODEL",
];
const forbiddenClientImports = [
  "@/lib/env/server",
  "@/lib/supabase/admin",
  "@/lib/ai",
  "server-only",
];

function listSourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const filePath = join(directory, entry);
    const stats = statSync(filePath);

    if (stats.isDirectory()) {
      return listSourceFiles(filePath);
    }

    return sourceExtensions.includes(extname(filePath)) ? [filePath] : [];
  });
}

function readSource(filePath: string) {
  return readFileSync(filePath, "utf8");
}

function extractImports(source: string) {
  const imports = new Set<string>();
  const staticImportPattern =
    /\b(?:import|export)\s+(?:[\s\S]*?\sfrom\s+)?["']([^"']+)["']/g;
  const dynamicImportPattern = /\bimport\(\s*["']([^"']+)["']\s*\)/g;

  for (const match of source.matchAll(staticImportPattern)) {
    imports.add(match[1]);
  }

  for (const match of source.matchAll(dynamicImportPattern)) {
    imports.add(match[1]);
  }

  return [...imports];
}

function resolveLocalImport(fromFile: string, importPath: string) {
  if (!importPath.startsWith("@/") && !importPath.startsWith(".")) {
    return undefined;
  }

  const importBase = importPath.startsWith("@/")
    ? join(sourceRoot, importPath.slice(2))
    : resolve(dirname(fromFile), importPath);
  const candidates = [
    importBase,
    ...sourceExtensions.map((extension) => `${importBase}${extension}`),
    ...sourceExtensions.map((extension) =>
      join(importBase, `index${extension}`),
    ),
  ];

  return candidates.find((candidate) => {
    try {
      return statSync(candidate).isFile();
    } catch {
      return false;
    }
  });
}

function collectClientModuleGraph() {
  const sourceFiles = listSourceFiles(sourceRoot).filter(
    (filePath) =>
      !filePath.endsWith(".test.ts") && !filePath.endsWith(".test.tsx"),
  );
  const clientEntries = sourceFiles.filter((filePath) =>
    /^\s*["']use client["'];?/m.test(readSource(filePath)),
  );
  const graph = new Set<string>();
  const pending = [...clientEntries];

  while (pending.length > 0) {
    const filePath = pending.pop();
    if (!filePath || graph.has(filePath)) {
      continue;
    }

    graph.add(filePath);
    for (const importPath of extractImports(readSource(filePath))) {
      const resolvedImport = resolveLocalImport(filePath, importPath);
      if (resolvedImport && !graph.has(resolvedImport)) {
        pending.push(resolvedImport);
      }
    }
  }

  return { clientEntries, graph: [...graph] };
}

function escapedSecretPattern() {
  return new RegExp(secretNames.join("|"));
}

function sourceLabel(filePath: string) {
  return relative(resolve(sourceRoot, ".."), filePath);
}

describe("server-only secret boundary", () => {
  beforeEach(() => {
    createClientMock.mockReset();
    getCurrentProfileMock.mockReset();
  });

  it("keeps service-role and future Lumen configuration behind server-only modules", () => {
    const serverEnvSource = readSource(join(sourceRoot, "lib/env/server.ts"));
    const adminClientSource = readSource(
      join(sourceRoot, "lib/supabase/admin.ts"),
    );
    const profileServiceSource = readSource(
      join(sourceRoot, "features/profile/services/profile-service.ts"),
    );
    const lumenProviderSource = readSource(
      join(sourceRoot, "lib/ai/providers/lumen-provider.ts"),
    );

    expect(serverEnvSource).toContain('import "server-only"');
    expect(adminClientSource).toContain('import "server-only"');
    expect(lumenProviderSource).toContain('import "server-only"');
    expect(profileServiceSource).toContain('import "server-only"');
    expect(profileServiceSource).not.toContain("createAdminClient");
    expect(profileServiceSource).not.toContain("getServerEnv");
    expect(profileServiceSource).not.toMatch(escapedSecretPattern());
  });

  it("does not place server secrets, provider endpoints, or server-only modules in client graphs", () => {
    const { clientEntries, graph } = collectClientModuleGraph();
    const clientSources = graph.map((filePath) => ({
      filePath,
      source: readSource(filePath),
    }));

    expect(clientEntries.length).toBeGreaterThan(0);

    for (const { filePath, source } of clientSources) {
      expect(
        source,
        `${sourceLabel(filePath)} must not contain server secret names`,
      ).not.toMatch(escapedSecretPattern());

      for (const forbiddenImport of forbiddenClientImports) {
        expect(
          source,
          `${sourceLabel(filePath)} must not import ${forbiddenImport}`,
        ).not.toContain(forbiddenImport);
      }

      expect(
        source,
        `${sourceLabel(filePath)} must not contain Lumen endpoint configuration`,
      ).not.toMatch(/(?:LUMEN|lumen-provider|\/api\/lumen)/i);
    }
  });

  it("keeps secret values and raw errors out of rendered UI and application logs", () => {
    const applicationFiles = listSourceFiles(sourceRoot).filter(
      (filePath) =>
        !filePath.endsWith(".test.ts") && !filePath.endsWith(".test.tsx"),
    );
    const renderedFiles = applicationFiles.filter((filePath) =>
      [".tsx", ".jsx"].includes(extname(filePath)),
    );
    const routeFiles = applicationFiles.filter((filePath) =>
      /app\\api\\/.test(relative(sourceRoot, filePath)),
    );

    for (const filePath of renderedFiles) {
      const source = readSource(filePath);
      expect(
        source,
        `${sourceLabel(filePath)} must not render server configuration`,
      ).not.toMatch(escapedSecretPattern());
    }

    for (const filePath of renderedFiles) {
      const source = readSource(filePath);
      expect(
        source,
        `${sourceLabel(filePath)} must not render raw error messages`,
      ).not.toMatch(/(?:error|caughtError|providerError)\??\.message/);
      expect(
        source,
        `${sourceLabel(filePath)} must not expose raw error causes`,
      ).not.toMatch(/(?:error|caughtError|providerError)\??\.cause/);
      expect(
        source,
        `${sourceLabel(filePath)} must not log application errors`,
      ).not.toMatch(/\bconsole\.(?:debug|info|log|warn|error)\s*\(/);
    }

    for (const filePath of routeFiles) {
      const source = readSource(filePath);
      expect(
        source,
        `${sourceLabel(filePath)} must not return raw error objects`,
      ).not.toMatch(/(?:NextResponse|Response)\.json\(\s*error\b/);
      expect(
        source,
        `${sourceLabel(filePath)} must not return raw error messages`,
      ).not.toMatch(/(?:error|message)\s*:\s*error(?:\??\.message)?/);
      expect(
        source,
        `${sourceLabel(filePath)} must not serialize raw errors`,
      ).not.toMatch(/JSON\.stringify\(\s*error\b/);
    }

    expect(
      applicationFiles.some((filePath) =>
        /\bconsole\./.test(readSource(filePath)),
      ),
    ).toBe(false);
  });

  it("maps raw provider failures to safe authentication messages before UI use", async () => {
    const rawProviderResponse =
      "provider response: access_token=provider-secret refresh_token=refresh-secret";
    const signInWithPassword = vi.fn().mockResolvedValue({
      error: {
        code: "unexpected_provider_failure",
        message: rawProviderResponse,
        status: 503,
      },
    });
    createClientMock.mockReturnValue({
      auth: { signInWithPassword },
    });

    let caughtError: unknown;
    try {
      await signIn({ email: "user@example.com", password: "password123" });
    } catch (error) {
      caughtError = error;
    }

    expect(caughtError).toBeInstanceOf(AuthenticationError);
    expect((caughtError as Error).message).toBe(
      AUTHENTICATION_MESSAGES.temporary_failure,
    );
    expect((caughtError as Error).message).not.toContain(rawProviderResponse);
    expect((caughtError as Error).message).not.toMatch(
      /access_token|refresh_token/,
    );
  });

  it("returns generic profile errors without database details", async () => {
    const rawDatabaseError =
      "Postgres policy error: relation profiles leaked secret-column-value";
    getCurrentProfileMock.mockRejectedValue(new Error(rawDatabaseError));

    const response = await getProfile();
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toEqual({ error: "Unable to load profile settings." });
    expect(JSON.stringify(body)).not.toContain(rawDatabaseError);
    expect(JSON.stringify(body)).not.toMatch(
      /profiles|secret-column-value|policy/i,
    );
  });
});
