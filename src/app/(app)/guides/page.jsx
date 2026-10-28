import { GuideList } from "@/components/guides/guide-list";
import { GUIDES } from "@/lib/guides";

export const metadata = { title: "Guides" };

export default function GuidesPage() {
  return <GuideList guides={GUIDES} />;
}
