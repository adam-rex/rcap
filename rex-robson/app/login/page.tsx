import { Suspense } from "react";
import { LoginForm } from "@/components/auth/login-form";

export default function LoginPage() {
  return (
    <div
      className="flex min-h-dvh flex-col items-center justify-center px-4 py-12"
      style={{ backgroundColor: "#f5f5f0" }}
    >
      <Suspense
        fallback={
          <div className="h-64 w-full max-w-sm animate-pulse rounded-xl bg-charcoal/[0.06]" />
        }
      >
        <LoginForm />
      </Suspense>
    </div>
  );
}
