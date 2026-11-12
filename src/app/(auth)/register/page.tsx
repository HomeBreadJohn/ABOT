import { AuthForm } from "@/features/authentication/components/auth-form";

export default function RegisterPage() {
  return (
    <main className="w-full min-w-0">
      <AuthForm mode="register" />
    </main>
  );
}
