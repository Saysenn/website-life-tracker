import { ScreenRecorder } from "@/components/tools/screen/screen-recorder";

// Lets the browser install the recorders as their own app (dock / taskbar icon, own window).
export const metadata = { title: "Screen recorder", manifest: "/recorder.webmanifest" };

export default function ScreenRecorderPage() {
  return <ScreenRecorder />;
}
