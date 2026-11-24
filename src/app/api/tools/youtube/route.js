import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { youtubeId, youtubeTranscript } from "@/lib/tools/video/youtube";

export const dynamic = "force-dynamic";

/** GET ?url=<youtube link>&track=<caption id>&translate=<language code> → video details + transcript. */
export async function GET(request) {
  // The proxy already requires a sign in; checked here too so the route never depends on it alone.
  if ((await auth())?.user?.role !== "admin") return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const params = request.nextUrl.searchParams;
  const videoId = youtubeId(params.get("url") ?? "");
  if (!videoId) return NextResponse.json({ error: "That isn't a YouTube video link." }, { status: 400 });

  try {
    const result = await youtubeTranscript(videoId, {
      track: params.get("track") || undefined,
      translateTo: params.get("translate") || undefined,
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error.message || "Couldn't get the transcript." }, { status: 502 });
  }
}
