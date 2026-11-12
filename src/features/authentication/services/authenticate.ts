import { z } from "zod";

import { createClient } from "@/lib/supabase/client";

const credentialsSchema = z.object({
  email: z.string().email("Enter a valid email address."),
  password: z.string().min(8, "Password must be at least 8 characters."),
});

export type Credentials = z.infer<typeof credentialsSchema>;

export const AUTHENTICATION_MESSAGES = {
  invalid_input: "Enter a valid email address and password.",
  invalid_credentials:
    "We couldn't verify those credentials. Check your email and password and try again.",
  confirmation_required:
    "Confirm your email address before signing in, then try again.",
  account_exists:
    "An account with this email already exists. Try signing in instead.",
  temporary_failure: "We couldn't complete that request. Please try again.",
  sign_out_failed: "We couldn't sign you out. Please try again.",
} as const;

export type AuthenticationErrorCategory = keyof typeof AUTHENTICATION_MESSAGES;

export class AuthenticationError extends Error {
  readonly category: AuthenticationErrorCategory;
  readonly retryable = true;

  constructor(category: AuthenticationErrorCategory, message?: string) {
    super(message ?? AUTHENTICATION_MESSAGES[category]);
    this.name = "AuthenticationError";
    this.category = category;
    Object.setPrototypeOf(this, AuthenticationError.prototype);
  }
}

type AuthenticationOperation = "signIn" | "register" | "signOut";

type ProviderFailureDetails = {
  code?: string;
  message?: string;
  status?: number;
};

function getValidationError(result: z.ZodSafeParseError<unknown>) {
  const field = result.error.issues[0]?.path[0];

  if (field === "email") {
    return new AuthenticationError(
      "invalid_input",
      "Enter a valid email address.",
    );
  }

  if (field === "password") {
    return new AuthenticationError(
      "invalid_input",
      "Password must be at least 8 characters.",
    );
  }

  return new AuthenticationError("invalid_input");
}

function validateCredentials(credentials: Credentials) {
  const result = credentialsSchema.safeParse(credentials);

  if (!result.success) {
    throw getValidationError(result);
  }

  return result.data;
}

function getProviderFailureDetails(error: unknown): ProviderFailureDetails {
  if (!error || typeof error !== "object") {
    return {};
  }

  const providerError = error as Record<string, unknown>;
  const details: ProviderFailureDetails = {};

  try {
    if (typeof providerError.code === "string") {
      details.code = providerError.code.slice(0, 128).toLowerCase();
    }

    if (typeof providerError.message === "string") {
      details.message = providerError.message.slice(0, 256).toLowerCase();
    }

    if (typeof providerError.status === "number") {
      details.status = providerError.status;
    }
  } catch {
    return {};
  }

  return details;
}

function hasProviderMarker(
  details: ProviderFailureDetails,
  markers: readonly string[],
) {
  return markers.some(
    (marker) =>
      details.code?.includes(marker) || details.message?.includes(marker),
  );
}

function mapProviderFailure(
  operation: AuthenticationOperation,
  error: unknown,
): AuthenticationError {
  const details = getProviderFailureDetails(error);

  if (
    operation === "signIn" &&
    hasProviderMarker(details, [
      "email_not_confirmed",
      "email not confirmed",
      "confirm your email",
    ])
  ) {
    return new AuthenticationError("confirmation_required");
  }

  if (
    operation === "signIn" &&
    hasProviderMarker(details, [
      "invalid_credentials",
      "invalid login credentials",
      "invalid email or password",
    ])
  ) {
    return new AuthenticationError("invalid_credentials");
  }

  if (
    operation === "register" &&
    hasProviderMarker(details, [
      "user_already_exists",
      "user already registered",
      "already been registered",
      "already exists",
    ])
  ) {
    return new AuthenticationError("account_exists");
  }

  if (
    hasProviderMarker(details, [
      "weak_password",
      "password should be at least",
      "password is too weak",
    ])
  ) {
    return new AuthenticationError(
      "invalid_input",
      "Choose a stronger password and try again.",
    );
  }

  if (operation === "signOut") {
    return new AuthenticationError("sign_out_failed");
  }

  return new AuthenticationError("temporary_failure");
}

async function runAuthenticationOperation(
  operation: AuthenticationOperation,
  action: () => Promise<{ error: unknown | null }>,
) {
  try {
    const result = await action();

    if (result.error) {
      throw mapProviderFailure(operation, result.error);
    }
  } catch (error) {
    if (error instanceof AuthenticationError) {
      throw error;
    }

    throw mapProviderFailure(operation, error);
  }
}

export async function signIn(credentials: Credentials) {
  const values = validateCredentials(credentials);

  await runAuthenticationOperation("signIn", () =>
    createClient().auth.signInWithPassword(values),
  );
}

export async function register(credentials: Credentials) {
  const values = validateCredentials(credentials);

  await runAuthenticationOperation("register", () =>
    createClient().auth.signUp({
      ...values,
      options: {
        emailRedirectTo: `${window.location.origin}/login`,
      },
    }),
  );
}

export async function signOut() {
  await runAuthenticationOperation("signOut", () =>
    createClient().auth.signOut(),
  );
}
