import "server-only";
import { HttpError, guestChat, isAdminRequest } from "./access";

async function guestOwns(file) {
  const chat = await guestChat();
  return Boolean(chat && chat.id === file.chatId && !chat.blocked);
}

const deny = () => {
  throw new HttpError(403, "You do not have access to this file.");
};

export async function canUpload(file) {
  const allowed = file.sender === "admin" ? await isAdminRequest() : await guestOwns(file);
  if (!allowed) deny();
}

export async function canRead(file) {
  if (await isAdminRequest()) return;
  const chat = await guestChat();
  if (!chat || chat.id !== file.chatId || file.status !== "ready") deny();
}

/** Admins can remove any file. Guests can only cancel their own unfinished upload. */
export async function canDelete(file) {
  if (await isAdminRequest()) return;
  if (file.sender !== "guest" || file.status !== "uploading" || !(await guestOwns(file))) deny();
}
