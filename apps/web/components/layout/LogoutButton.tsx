"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { apiPost } from "@/lib/api-client";

export function LogoutButton({ className }: { className?: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleLogout() {
    setLoading(true);
    try {
      await apiPost("/api/auth/logout");
    } finally {
      router.push("/login");
      router.refresh();
    }
  }

  return (
    <button onClick={handleLogout} disabled={loading} className={className ?? "btn-ghost"}>
      <LogOut className="h-4 w-4" />
      Log out
    </button>
  );
}
