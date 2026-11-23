import { VoiceRecorder } from "@/components/tools/voice/voice-recorder";

// Lets the browser install the recorders as their own app (dock / taskbar icon, own window).
export const metadata = { title: "Voice recorder", manifest: "/recorder.webmanifest" };

export default function VoiceRecorderPage() {
  return <VoiceRecorder />;
}
