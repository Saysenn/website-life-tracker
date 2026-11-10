import { MetadataCleaner } from "@/components/tools/metadata-cleaner";
import { requireSession } from "@/lib/session";

export const metadata = { title: "Metadata cleaner" };

export default async function MetadataCleanerPage() {
  const session = await requireSession();
  return <MetadataCleaner full={session.user.role !== "files"} />;
}
