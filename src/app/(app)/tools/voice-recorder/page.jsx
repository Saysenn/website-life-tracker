import { VoiceRecorder } from "@/components/tools/voice/voice-recorder";

// Lets the browser install the voice recorder as its own app (dock / taskbar icon, own window).
export const metadata = { title: "Voice recorder", manifest: "/apps/voice.webmanifest" };

export default function VoiceRecorderPage() {
  return <VoiceRecorder />;
}
