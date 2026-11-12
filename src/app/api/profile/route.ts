import { NextResponse } from "next/server";

import { preferredLanguageSchema } from "@/features/profile/schemas/preferred-language";
import {
  PROFILE_SERVICE_ERROR_CODES,
  ProfileServiceError,
  getCurrentProfile,
  updateCurrentPreferredLanguage,
} from "@/features/profile/services/profile-service";

const NO_STORE_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0",
};

function jsonResponse(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: NO_STORE_HEADERS,
  });
}

function getProfileServiceErrorCode(error: unknown) {
  return error instanceof ProfileServiceError ? error.code : undefined;
}

function getErrorResponse(error: unknown, operation: "read" | "update") {
  const code = getProfileServiceErrorCode(error);

  if (code === PROFILE_SERVICE_ERROR_CODES.authenticationRequired) {
    return jsonResponse({ error: "Authentication required." }, 401);
  }

  if (
    operation === "update" &&
    code === PROFILE_SERVICE_ERROR_CODES.invalidPreferredLanguage
  ) {
    return jsonResponse(
      { error: "Select English, Filipino, or Taglish." },
      400,
    );
  }

  return jsonResponse(
    {
      error:
        operation === "read"
          ? "Unable to load profile settings."
          : "Unable to save profile settings.",
    },
    500,
  );
}

function getPreferredLanguageInput(body: unknown): unknown {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return undefined;
  }

  return (body as Record<string, unknown>).preferredLanguage;
}

export async function GET() {
  try {
    const profile = await getCurrentProfile();

    if (!profile) {
      return jsonResponse({ error: "Unable to load profile settings." }, 500);
    }

    return jsonResponse({ preferredLanguage: profile.preferredLanguage });
  } catch (error) {
    return getErrorResponse(error, "read");
  }
}

export async function PATCH(request: Request) {
  try {
    let body: unknown;

    try {
      body = await request.json();
    } catch {
      return jsonResponse(
        { error: "Select English, Filipino, or Taglish." },
        400,
      );
    }

    const preferredLanguage = preferredLanguageSchema.safeParse(
      getPreferredLanguageInput(body),
    );

    if (!preferredLanguage.success) {
      return jsonResponse(
        { error: "Select English, Filipino, or Taglish." },
        400,
      );
    }

    const profile = await updateCurrentPreferredLanguage(
      preferredLanguage.data,
    );

    return jsonResponse({ preferredLanguage: profile.preferredLanguage });
  } catch (error) {
    return getErrorResponse(error, "update");
  }
}
