import { notFound } from "next/navigation";
import { GuideViewer } from "@/components/guides/guide-viewer";
import { getGuide } from "@/lib/guides";


export async function generateMetadata({ params }) {
  const guide = getGuide((await params).slug);
  return { title: guide?.title ?? "Guide" };
}

export default async function GuidePage({ params }) {
  const guide = getGuide((await params).slug);
  if (!guide) notFound();
  return <GuideViewer guide={guide} />;
}
