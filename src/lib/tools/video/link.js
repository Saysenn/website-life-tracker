// Sites that only show videos inside their own player and block other sites from downloading them.
const PLATFORMS = [
  [/(^|\.)(youtube\.com|youtu\.be|youtube-nocookie\.com)$/, "YouTube"],
  [/(^|\.)tiktok\.com$/, "TikTok"],
  [/(^|\.)(instagram\.com|instagr\.am)$/, "Instagram"],
  [/(^|\.)(facebook\.com|fb\.watch|fb\.com)$/, "Facebook"],
  [/(^|\.)(x\.com|twitter\.com)$/, "X"],
  [/(^|\.)vimeo\.com$/, "Vimeo"],
  [/(^|\.)(reddit\.com|redd\.it)$/, "Reddit"],
  [/(^|\.)(twitch\.tv)$/, "Twitch"],
  [/(^|\.)(dailymotion\.com|dai\.ly)$/, "Dailymotion"],
  [/(^|\.)(snapchat\.com)$/, "Snapchat"],
  [/(^|\.)(pinterest\.[a-z.]+|pin\.it)$/, "Pinterest"],
  [/(^|\.)(linkedin\.com)$/, "LinkedIn"],
];

/** Pulls the first http(s) URL out of pasted or dropped text, or null. */
export function findUrl(text) {
  const line = String(text ?? "")
    .split(/\r?\n/)
    .map((item) => item.trim())
    .find((item) => item && !item.startsWith("#"));
  if (!line) return null;
  const candidate = /^[\w-]+(\.[\w-]+)+\//.test(line) ? `https://${line}` : line;
  try {
    const url = new URL(candidate);
    return url.protocol === "http:" || url.protocol === "https:" ? url : null;
  } catch {
    return null;
  }
}

export function platformOf(url) {
  const host = url.hostname.toLowerCase();
  return PLATFORMS.find(([pattern]) => pattern.test(host))?.[1] ?? null;
}

/**
 * Downloads a direct video link (one that ends in .mp4 etc. and allows other sites to fetch it).
 * Reports progress 0–1 when the size is known.
 */
export async function fetchVideo(url, { onProgress, signal }) {
  let response;
  try {
    response = await fetch(url, { signal });
  } catch (error) {
    if (error?.name === "AbortError") throw error;
    throw new Error("That site doesn't let other sites download its videos. Save the video to your device, then drop the file here.");
  }
  if (!response.ok) throw new Error(`The link didn't work (error ${response.status}). Check it opens in a new tab.`);

  const type = (response.headers.get("content-type") ?? "").split(";")[0].trim();
  if (type && !type.startsWith("video/") && type !== "application/octet-stream") {
    throw new Error(
      type.startsWith("text/html")
        ? "That link opens a web page, not a video file. Save the video to your device, then drop the file here."
        : "That link isn't a video file.",
    );
  }

  const total = Number(response.headers.get("content-length")) || 0;
  const reader = response.body.getReader();
  const chunks = [];
  let loaded = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.length;
    onProgress?.(total ? loaded / total : 0, loaded);
  }

  const last = decodeURIComponent(url.pathname.split("/").filter(Boolean).at(-1) ?? "");
  const name = /\.\w{2,4}$/.test(last) ? last : `${last || "video"}.${type.split("/")[1] || "mp4"}`;
  return new File(chunks, name, { type: type.startsWith("video/") ? type : "video/mp4" });
}
