import { FileTransfer } from "@/components/tools/transfer/file-transfer";
import { requireSession } from "@/lib/session";
import { autoDeleteOn, getLinkKey } from "@/lib/transfer/store";

export const metadata = { title: "File transfer" };

export default async function FileTransferPage({ searchParams }) {
  const [{ chat }, linkKey, autoDelete, session] = await Promise.all([
    searchParams,
    getLinkKey(),
    autoDeleteOn(),
    requireSession(),
  ]);
  return (
    <FileTransfer
      linkKey={linkKey}
      autoDelete={autoDelete}
      initialChat={typeof chat === "string" ? chat : null}
      full={session.user.role !== "files"}
    />
  );
}
