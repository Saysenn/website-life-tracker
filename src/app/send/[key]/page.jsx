import { Link2Off } from "lucide-react";
import { GuestTransfer } from "@/components/tools/transfer/guest-transfer";
import { guestChat } from "@/lib/transfer/access";
import { linkMatches } from "@/lib/transfer/store";

export const dynamic = "force-dynamic";

export const metadata = {
  title: { absolute: "Send files" },
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default async function SendPage({ params }) {
  const { key } = await params;
  const [valid, chat] = await Promise.all([linkMatches(key), guestChat()]);

  if (!valid && !chat) {
    return (
      <main className="flex min-h-dvh items-center justify-center px-4">
        <div className="max-w-[36rem] animate-rise text-center">
          <span className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-surface text-ink-3 shadow-card">
            <Link2Off className="size-[2rem]" strokeWidth={1.5} />
          </span>
          <h1 className="mt-4 text-xl font-semibold">This link is not active</h1>
          <p className="mt-1 text-sm text-ink-3">It may have been replaced. Ask the person who sent it for a new one.</p>
        </div>
      </main>
    );
  }

  return <GuestTransfer linkKey={key} started={Boolean(chat)} />;
}
