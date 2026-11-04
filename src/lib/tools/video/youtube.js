import "server-only";

// YouTube's own app API. The Android client returns caption tracks without the extra checks the web player now needs.
const PLAYER_URL = "https://www.youtube.com/youtubei/v1/player?prettyPrint=false";
const CLIENT = { clientName: "ANDROID", clientVersion: "20.10.38", androidSdkVersion: 30, hl: "en" };
const ID = /^[\w-]{11}$/;

/** Finds the 11-character video ID in any YouTube link (watch, youtu.be, shorts, live, embed), or null. */
export function youtubeId(input) {
  let url;
  try {
    url = new URL(input);
  } catch {
    return ID.test(input) ? input : null;
  }
  const host = url.hostname.toLowerCase().replace(/^(www|m|music)\./, "");
  const parts = url.pathname.split("/").filter(Boolean);
  let id = null;
  if (host === "youtu.be") id = parts[0];
  else if (/^youtube(-nocookie)?\.com$/.test(host)) {
    id = url.searchParams.get("v") ?? (["shorts", "live", "embed", "v"].includes(parts[0]) ? parts[1] : null);
  }
  return id && ID.test(id) ? id : null;
}

const trackLabel = (track) => track.name?.runs?.map((run) => run.text).join("") ?? track.name?.simpleText ?? track.languageCode;

async function player(videoId) {
  let response;
  try {
    response = await fetch(PLAYER_URL, {
      method: "POST",
      headers: { "content-type": "application/json", "user-agent": "com.google.android.youtube/20.10.38 (Linux; U; Android 11) gzip" },
      body: JSON.stringify({ context: { client: CLIENT }, videoId }),
      cache: "no-store",
    });
  } catch {
    throw new Error("Couldn't reach YouTube. Try again in a moment.");
  }
  if (!response.ok) throw new Error(`YouTube didn't answer (error ${response.status}). Try again in a moment.`);
  const data = await response.json();

  const status = data.playabilityStatus?.status;
  if (status && status !== "OK") {
    const reason = data.playabilityStatus?.reason;
    throw new Error(status === "LOGIN_REQUIRED" ? "This video is private or age-restricted, so its captions can't be read." : reason || "This video isn't available.");
  }

  const list = data.captions?.playerCaptionsTracklistRenderer ?? {};
  const tracks = list.captionTracks ?? [];
  // The caption that matches the original audio is listed first for the default audio track.
  const original = list.audioTracks?.[list.defaultAudioTrackIndex ?? 0]?.captionTrackIndices?.[0] ?? list.defaultCaptionTrackIndex;
  const preferred = tracks[original] ?? tracks.find((track) => track.kind !== "asr") ?? tracks[0];

  return {
    video: {
      id: videoId,
      title: data.videoDetails?.title ?? "YouTube video",
      author: data.videoDetails?.author ?? "",
      duration: Number(data.videoDetails?.lengthSeconds) || 0,
    },
    tracks: tracks.map((track) => ({
      id: track.vssId,
      label: trackLabel(track),
      language: track.languageCode,
      auto: track.kind === "asr",
      baseUrl: track.baseUrl,
    })),
    defaultTrack: preferred?.vssId ?? null,
  };
}

/** Turns YouTube's word-by-word caption events into readable chunks of roughly a sentence. */
function toSegments(events) {
  const segments = [];
  let current = null;
  const flush = () => {
    if (current?.text.trim()) segments.push({ ...current, text: current.text.replace(/\s+/g, " ").trim() });
    current = null;
  };

  for (const event of events ?? []) {
    const text = (event.segs ?? []).map((seg) => seg.utf8 ?? "").join("");
    if (!text.trim()) continue;
    const start = event.tStartMs / 1000;
    const end = (event.tStartMs + (event.dDurationMs ?? 0)) / 1000;

    if (current && start - current.end > 2) flush();
    if (!current) current = { start, end, text: "" };
    current.text += ` ${text}`;
    current.end = Math.max(current.end, end);

    const length = current.text.trim().length;
    if ((/[.!?…]["')\]]?$/.test(text.trim()) && length > 60) || length > 280) flush();
  }
  flush();

  // Auto captions overlap in time; keep each chunk ending where the next one starts.
  for (let index = 0; index < segments.length - 1; index++) {
    segments[index].end = Math.min(segments[index].end, segments[index + 1].start);
  }
  return segments;
}

/** Video details, the caption languages it has, and the transcript in the chosen (or original) language. */
export async function youtubeTranscript(videoId, { track, translateTo } = {}) {
  const { video, tracks, defaultTrack } = await player(videoId);
  const publicTracks = tracks.map(({ baseUrl, ...rest }) => rest);
  if (!tracks.length) return { video, tracks: publicTracks, track: null, segments: [] };

  const chosen = tracks.find((item) => item.id === track) ?? tracks.find((item) => item.id === defaultTrack);
  const url = new URL(chosen.baseUrl);
  url.searchParams.set("fmt", "json3");
  if (translateTo && translateTo !== chosen.language) url.searchParams.set("tlang", translateTo);

  const response = await fetch(url, { cache: "no-store" });
  const body = response.ok ? await response.text() : "";
  if (!body) throw new Error("YouTube didn't send the captions. Try again in a moment.");

  return { video, tracks: publicTracks, track: chosen.id, segments: toSegments(JSON.parse(body).events) };
}
