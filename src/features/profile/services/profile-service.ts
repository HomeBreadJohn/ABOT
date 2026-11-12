import "server-only";

import {
  preferredLanguageSchema,
  type PreferredLanguageInput,
} from "@/features/profile/schemas/preferred-language";
import type { PreferredLanguage } from "@/features/profile/types";
import { createClient } from "@/lib/supabase/server";

export const PROFILE_SERVICE_ERROR_CODES = {
  authenticationRequired: "AUTHENTICATION_REQUIRED",
  invalidPreferredLanguage: "INVALID_PREFERRED_LANGUAGE",
  profileMissing: "PROFILE_MISSING",
  profileReadFailed: "PROFILE_READ_FAILED",
  profileUpdateFailed: "PROFILE_UPDATE_FAILED",
} as const;

export type ProfileServiceErrorCode =
  (typeof PROFILE_SERVICE_ERROR_CODES)[keyof typeof PROFILE_SERVICE_ERROR_CODES];

const PROFILE_SERVICE_ERROR_MESSAGES: Record<ProfileServiceErrorCode, string> =
  {
    AUTHENTICATION_REQUIRED: "Authentication is required.",
    INVALID_PREFERRED_LANGUAGE: "Select English, Filipino, or Taglish.",
    PROFILE_MISSING: "Your profile is not available.",
    PROFILE_READ_FAILED: "We couldn't load your profile. Please try again.",
    PROFILE_UPDATE_FAILED:
      "We couldn't save your preferred language. Please try again.",
  };

export class ProfileServiceError extends Error {
  readonly code: ProfileServiceErrorCode;

  constructor(code: ProfileServiceErrorCode) {
    super(PROFILE_SERVICE_ERROR_MESSAGES[code]);
    this.name = "ProfileServiceError";
    this.code = code;
    Object.setPrototypeOf(this, ProfileServiceError.prototype);
  }
}

/** Only the preference needed by the profile settings flow crosses this boundary. */
export type CurrentProfile = {
  preferredLanguage: PreferredLanguage;
};

type AuthenticatedProfileContext = {
  supabase: Awaited<ReturnType<typeof createClient>>;
  userId: string;
};

function isProfileServiceError(error: unknown): error is ProfileServiceError {
  return error instanceof ProfileServiceError;
}

async function getAuthenticatedProfileContext(): Promise<AuthenticatedProfileContext> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.getClaims();
    const userId = data?.claims?.sub;

    if (error || typeof userId !== "string" || userId.length === 0) {
      throw new ProfileServiceError(
        PROFILE_SERVICE_ERROR_CODES.authenticationRequired,
      );
    }

    return { supabase, userId };
  } catch (error) {
    if (isProfileServiceError(error)) {
      throw error;
    }

    throw new ProfileServiceError(
      PROFILE_SERVICE_ERROR_CODES.authenticationRequired,
    );
  }
}

function parseStoredPreferredLanguage(value: unknown): PreferredLanguage {
  const result = preferredLanguageSchema.safeParse(value);

  if (!result.success) {
    throw new ProfileServiceError(
      PROFILE_SERVICE_ERROR_CODES.profileReadFailed,
    );
  }

  return result.data;
}

function toCurrentProfile(value: unknown): CurrentProfile {
  if (!value || typeof value !== "object") {
    throw new ProfileServiceError(
      PROFILE_SERVICE_ERROR_CODES.profileReadFailed,
    );
  }

  const preferredLanguage = (value as { preferred_language?: unknown })
    .preferred_language;

  return {
    preferredLanguage: parseStoredPreferredLanguage(preferredLanguage),
  };
}

/**
 * Reads the current user's profile without accepting a client-controlled owner
 * or profile identifier. A missing row is returned as null for controlled
 * setup-state handling by the caller.
 */
export async function getCurrentProfile(): Promise<CurrentProfile | null> {
  const { supabase, userId } = await getAuthenticatedProfileContext();

  try {
    const { data, error } = await supabase
      .from("profiles")
      .select("preferred_language")
      .eq("id", userId)
      .maybeSingle();

    if (error) {
      throw new ProfileServiceError(
        PROFILE_SERVICE_ERROR_CODES.profileReadFailed,
      );
    }

    return data ? toCurrentProfile(data) : null;
  } catch (error) {
    if (isProfileServiceError(error)) {
      throw error;
    }

    throw new ProfileServiceError(
      PROFILE_SERVICE_ERROR_CODES.profileReadFailed,
    );
  }
}

/**
 * Returns the current user's profile or a controlled missing-profile error.
 * This function never creates a profile and never accepts an owner identifier.
 */
export async function ensureCurrentProfile(): Promise<CurrentProfile> {
  const profile = await getCurrentProfile();

  if (!profile) {
    throw new ProfileServiceError(PROFILE_SERVICE_ERROR_CODES.profileMissing);
  }

  return profile;
}

/**
 * Updates only the current user's preferred language after validating it. The
 * session-derived user ID is the sole ownership selector.
 */
export async function updateCurrentPreferredLanguage(
  language: PreferredLanguageInput,
): Promise<CurrentProfile> {
  const result = preferredLanguageSchema.safeParse(language);

  if (!result.success) {
    throw new ProfileServiceError(
      PROFILE_SERVICE_ERROR_CODES.invalidPreferredLanguage,
    );
  }

  const { supabase, userId } = await getAuthenticatedProfileContext();

  try {
    const { data, error } = await supabase
      .from("profiles")
      .update({ preferred_language: result.data })
      .eq("id", userId)
      .select("preferred_language")
      .maybeSingle();

    if (error) {
      throw new ProfileServiceError(
        PROFILE_SERVICE_ERROR_CODES.profileUpdateFailed,
      );
    }

    if (!data) {
      throw new ProfileServiceError(PROFILE_SERVICE_ERROR_CODES.profileMissing);
    }

    return toCurrentProfile(data);
  } catch (error) {
    if (isProfileServiceError(error)) {
      throw error;
    }

    throw new ProfileServiceError(
      PROFILE_SERVICE_ERROR_CODES.profileUpdateFailed,
    );
  }
}
