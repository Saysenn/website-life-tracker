import { ScreenRecorder } from "@/components/tools/screen/screen-recorder";

// Lets the browser install the screen recorder as its own app (dock / taskbar icon, own window).
export const metadata = { title: "Screen recorder", manifest: "/recorder.webmanifest" };

export default function ScreenRecorderPage() {
  return <ScreenRecorder />;
}
