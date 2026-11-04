import { ImageConverter } from "@/components/tools/image-converter";

export const metadata = { title: "Image converter" };

export default async function ImageConverterPage({ searchParams }) {
  const { from, to } = await searchParams;
  return <ImageConverter key={`${from}-${to}`} initialFrom={from} initialTo={to} />;
}
