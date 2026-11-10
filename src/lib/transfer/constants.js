export const RETENTION_DAYS = 7;
export const RETENTION_MS = RETENTION_DAYS * 24 * 60 * 60 * 1000;
export const CHUNK_SIZE = 3 * 1024 * 1024;
export const MAX_FILE_BYTES = 2 * 1024 ** 3;
export const GUEST_QUOTA_BYTES = 3 * 1024 ** 3;
export const MAX_MESSAGE = 4000;
/** Grok sends long answers as plain text, so its messages get a much higher cap. */
export const MAX_AGENT_MESSAGE = 200_000;
export const MAX_NAME = 60;
export const ONLINE_MS = 20_000;
export const TYPING_MS = 6_000;
export const HOST_NAME = "Admin";
export const INLINE_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp", "image/avif"];
export const PREVIEW_MAX_BYTES = 12 * 1024 * 1024;
