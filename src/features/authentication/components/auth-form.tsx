"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { brand } from "@/config/brand";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  register,
  signIn,
} from "@/features/authentication/services/authenticate";

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);
  const isRegister = mode === "register";

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setMessage(null);
    setIsPending(true);

    try {
      if (isRegister) {
        await register({ email, password });
        setMessage(
          "Check your email to confirm your account before signing in.",
        );
      } else {
        await signIn({ email, password });
        router.push("/dashboard");
        router.refresh();
      }
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Something went wrong. Please try again.",
      );
    } finally {
      setIsPending(false);
    }
  }

  return (
    <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
      <div className="mb-8">
        <Link href="/" className="text-sm font-semibold text-slate-950">
          {brand.name}
        </Link>
        <h1 className="mt-6 text-2xl font-semibold tracking-tight text-slate-950">
          {isRegister ? "Create your account" : "Welcome back"}
        </h1>
        <p className="mt-2 text-sm leading-6 text-slate-500">
          {isRegister
            ? "Create a secure workspace for your documents."
            : "Sign in to continue to your document workspace."}
        </p>
      </div>
      <form className="space-y-5" onSubmit={handleSubmit}>
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete={isRegister ? "new-password" : "current-password"}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
            minLength={8}
          />
        </div>
        {error ? (
          <p
            className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700"
            role="alert"
          >
            {error}
          </p>
        ) : null}
        {message ? (
          <p
            className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700"
            role="status"
          >
            {message}
          </p>
        ) : null}
        <Button type="submit" className="w-full" disabled={isPending}>
          {isPending
            ? "Please wait…"
            : isRegister
              ? "Create account"
              : "Sign in"}
        </Button>
      </form>
      <p className="mt-6 text-center text-sm text-slate-500">
        {isRegister ? "Already have an account?" : "Need an account?"}{" "}
        <Link
          className="font-medium text-slate-950 underline underline-offset-4"
          href={isRegister ? "/login" : "/register"}
        >
          {isRegister ? "Sign in" : "Register"}
        </Link>
      </p>
    </div>
  );
}
