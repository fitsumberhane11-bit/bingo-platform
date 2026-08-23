"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { BrandMark } from "@/components/BrandMark";
import { Alert } from "@/components/ui/Alert";
import { apiPost, ApiClientError } from "@/lib/api-client";

export default function VerifyEmailPage() {
  return (
    <Suspense>
      <VerifyEmailInner />
    </Suspense>
  );
}

function VerifyEmailInner() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const [state, setState] = useState<"loading" | "success" | "error">("loading");
  const [message, setMessage] = useState("Verifying your email…");

  useEffect(() => {
    if (!token) {
      setState("error");
      setMessage("This verification link is missing a token.");
      return;
    }
    apiPost("/api/auth/verify-email", { token })
      .then(() => {
        setState("success");
        setMessage("Your email has been verified. You can now log in.");
      })
      .catch((err) => {
        setState("error");
        setMessage(err instanceof ApiClientError ? err.message : "Verification failed.");
      });
  }, [token]);

  return (
    <div className="mx-auto flex min-h-[calc(100vh-140px)] max-w-md flex-col justify-center px-4 py-10 sm:px-6">
      <div className="mb-6 flex justify-center">
        <BrandMark size="lg" />
      </div>
      <div className="card text-center">
        <Alert variant={state === "success" ? "success" : state === "error" ? "error" : "info"}>{message}</Alert>
        <Link href="/login" className="btn-primary mt-6 inline-flex">
          Go to login
        </Link>
      </div>
    </div>
  );
}
