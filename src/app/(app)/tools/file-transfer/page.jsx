import { FileTransfer } from "@/components/tools/transfer/file-transfer";
import { getLinkKey } from "@/lib/transfer/store";

export const metadata = { title: "File transfer" };

export default async function FileTransferPage({ searchParams }) {
  const [{ chat }, linkKey] = await Promise.all([searchParams, getLinkKey()]);
  return <FileTransfer linkKey={linkKey} initialChat={typeof chat === "string" ? chat : null} />;
}
