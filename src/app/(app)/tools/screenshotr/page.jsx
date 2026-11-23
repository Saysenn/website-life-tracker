import { Screenshotr } from "@/components/tools/shot/screenshotr";

// Lets the browser install Screenshotr as its own app (dock / taskbar icon, own window).
export const metadata = { title: "Screenshotr", manifest: "/apps/screenshotr.webmanifest" };

export default function ScreenshotrPage() {
  return <Screenshotr />;
}
