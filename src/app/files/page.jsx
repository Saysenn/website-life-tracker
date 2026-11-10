import { ArrowLeftRight } from "lucide-react";
import { loginFiles } from "@/actions/auth";
import { LoginForm } from "../login/login-form";

export const metadata = { title: { absolute: "File transfer" }, robots: { index: false, follow: false } };

export default function FilesLoginPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-[36rem] animate-rise">
        <div className="mb-7 flex flex-col items-center text-center">
          <span className="flex size-10 items-center justify-center rounded-xl bg-ink text-ground">
            <ArrowLeftRight className="size-[1.8rem]" strokeWidth={2} />
          </span>
          <h1 className="mt-4 text-xl font-semibold">File transfer</h1>
          <p className="mt-1 text-sm text-ink-3">Sign in to send and receive files</p>
        </div>
        <LoginForm action={loginFiles} />
      </div>
    </main>
  );
}
