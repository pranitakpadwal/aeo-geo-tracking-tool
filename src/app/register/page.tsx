import { redirect } from "next/navigation";
import AuthForm from "@/components/AuthForm";
import { getCurrentUser } from "@/lib/session";

export default async function RegisterPage() {
  const user = await getCurrentUser();
  if (user) redirect("/universe");

  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: "48px 24px" }}>
      <h1 style={{ fontSize: 28, margin: "0 0 8px" }}>Create your account</h1>
      <p style={{ color: "var(--text-muted)", fontSize: 15, maxWidth: 480, lineHeight: 1.6, marginBottom: 24 }}>
        Universes, topic lists, and run history are tied to your account — log back in from anywhere and
        it&rsquo;s all still there.
      </p>
      <AuthForm mode="register" />
    </div>
  );
}
