import { ToolList } from "@/components/tools/tool-list";
import { TOOLS } from "@/lib/tools";

export const metadata = { title: "Tools" };

export default function ToolsPage() {
  return <ToolList tools={TOOLS} />;
}
