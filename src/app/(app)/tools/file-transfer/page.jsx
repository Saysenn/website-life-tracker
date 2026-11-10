import { FileTransfer } from "@/components/tools/transfer/file-transfer";
import { requireSession } from "@/lib/session";
import { getLinkKey } from "@/lib/transfer/store";

export const metadata = { title: "File transfer" };

export default async function FileTransferPage({ searchParams }) {
  const [{ chat }, linkKey, session] = await Promise.all([searchParams, getLinkKey(), requireSession()]);
  return (
    <FileTransfer
      linkKey={linkKey}
      initialChat={typeof chat === "string" ? chat : null}
      full={session.user.role !== "files"}
    />
  );
}
