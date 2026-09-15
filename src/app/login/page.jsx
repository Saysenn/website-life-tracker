import { BrandMark } from "@/components/shell/brand";
import { LoginForm } from "./login-form";

export const metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }) {
  const { next } = await searchParams;

  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-[36rem] animate-rise">
        <div className="mb-7 flex flex-col items-center text-center">
          <BrandMark className="size-10 rounded-xl" />
          <h1 className="mt-4 text-xl font-semibold">Welcome back</h1>
          <p className="mt-1 text-sm text-ink-3">Sign in to keep every renewal on track</p>
        </div>
        <LoginForm next={typeof next === "string" ? next : ""} />
      </div>
    </main>
  );
}
