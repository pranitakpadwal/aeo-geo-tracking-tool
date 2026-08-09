"use client";

import { useRouter } from "next/navigation";

export default function LogoutButton() {
  const router = useRouter();

  async function onClick() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <button
      onClick={onClick}
      style={{
        background: "none",
        border: "none",
        color: "var(--text-muted)",
        fontSize: 13.5,
        cursor: "pointer",
        fontFamily: "inherit",
        padding: 0,
      }}
    >
      Log out
    </button>
  );
}
