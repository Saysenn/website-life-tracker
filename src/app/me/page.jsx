import { Send } from "lucide-react";
import { loginSelf } from "@/actions/auth";
import { GuestTransfer } from "@/components/tools/transfer/guest-transfer";
import { twoFactorEnabled } from "@/lib/login";
import { guestChat } from "@/lib/transfer/access";
import { SELF_IP, autoDeleteOn } from "@/lib/transfer/store";
import { LoginForm } from "../login/login-form";

export const dynamic = "force-dynamic";

export const metadata = {
  title: { absolute: "Send to admin" },
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

/**
 * Your own link. Sign in with your usual account on any device and whatever you send
 * lands in the admin's Me chat. The sign in only opens this chat, never the app.
 */
export default async function SelfPage() {
  const [chat, autoDelete] = await Promise.all([guestChat(), autoDeleteOn()]);

  if (chat?.ip === SELF_IP) return <GuestTransfer self started autoDelete={autoDelete} />;

  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-[36rem] animate-rise">
        <div className="mb-7 flex flex-col items-center text-center">
          <span className="flex size-10 items-center justify-center rounded-xl bg-ink text-ground">
            <Send className="size-[1.7rem]" strokeWidth={2} />
          </span>
          <h1 className="mt-4 text-xl font-semibold">Send to admin</h1>
          <p className="mt-1 text-sm text-ink-3">Sign in to send messages and files from this device</p>
        </div>
        <LoginForm action={loginSelf} twoFactor={twoFactorEnabled()} />
      </div>
    </main>
  );
}
