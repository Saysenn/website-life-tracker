import "server-only";
import { redirect } from "next/navigation";
import { auth } from "@/auth";

export async function requireSession() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  return session;
}

/** Full admin only. The file transfer account fails this, so every other action stays closed to it. */
export async function isAdmin() {
  const user = (await auth())?.user;
  return Boolean(user && user.role !== "files");
}
