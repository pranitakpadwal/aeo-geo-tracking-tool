"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import Link from "next/link";

const inputStyle: React.CSSProperties = {
  width: "100%",
  background: "var(--bg-elevated)",
  border: "1px solid var(--border)",
  borderRadius: 8,
  padding: "10px 12px",
  color: "var(--text)",
  fontSize: 15,
  fontFamily: "inherit",
};

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 13,
  color: "var(--text-muted)",
  marginBottom: 6,
};

/** Shared form for both /login and /register — same fields, different
 * endpoint/copy/redirect. */
export default function AuthForm({ mode }: { mode: "login" | "register" }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(`/api/auth/${mode === "login" ? "login" : "register"}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Something went wrong.");
        setLoading(false);
        return;
      }
      router.push("/universe");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} style={{ display: "grid", gap: 16, maxWidth: 360 }}>
      {error && (
        <div
          style={{
            border: "1px solid var(--danger)",
            color: "var(--danger)",
            borderRadius: 8,
            padding: "10px 12px",
            fontSize: 14,
          }}
        >
          {error}
        </div>
      )}
      <div>
        <label style={labelStyle}>Email</label>
        <input
          style={inputStyle}
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@company.com"
          required
          autoFocus
        />
      </div>
      <div>
        <label style={labelStyle}>Password{mode === "register" ? " (8+ characters)" : ""}</label>
        <input
          style={inputStyle}
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
          required
          minLength={mode === "register" ? 8 : undefined}
        />
      </div>
      <button
        type="submit"
        disabled={loading}
        style={{
          background: loading ? "var(--border)" : "var(--accent)",
          color: "#fff",
          border: "none",
          borderRadius: 8,
          padding: "12px 20px",
          fontSize: 15,
          fontWeight: 700,
          cursor: loading ? "default" : "pointer",
          fontFamily: "inherit",
        }}
      >
        {loading ? "Please wait…" : mode === "login" ? "Log in" : "Create account"}
      </button>
      <p style={{ fontSize: 13, color: "var(--text-muted)" }}>
        {mode === "login" ? (
          <>
            No account yet? <Link href="/register" style={{ color: "var(--accent)" }}>Register</Link>
          </>
        ) : (
          <>
            Already have an account? <Link href="/login" style={{ color: "var(--accent)" }}>Log in</Link>
          </>
        )}
      </p>
    </form>
  );
}
