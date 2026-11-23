"use client";

import { AppWindow, Check } from "lucide-react";
import { useSyncExternalStore } from "react";
import { toast } from "sonner";
import { Group, Row } from "./screen/panels";

const noop = () => () => {};

// The browser offers installing once, early, while the page loads, so the offer is caught as soon as this loads.
let installOffer = null;
const installListeners = new Set();
const notify = () => installListeners.forEach((listener) => listener());
if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    installOffer = event;
    notify();
  });
  window.addEventListener("appinstalled", () => {
    installOffer = null;
    notify();
  });
}
const subscribeInstall = (listener) => {
  installListeners.add(listener);
  return () => installListeners.delete(listener);
};
const getInstallOffer = () => installOffer;
const getStandalone = () => window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;

/** Installs the page's tool as its own app (the page's metadata must point at its web manifest). */
export function InstallApp({ name, hint, isMac }) {
  const offer = useSyncExternalStore(subscribeInstall, getInstallOffer, () => null);
  const standalone = useSyncExternalStore(noop, getStandalone, () => false);
  const install = async () => {
    if (!offer) return;
    offer.prompt();
    const { outcome } = await offer.userChoice.catch(() => ({}));
    if (outcome === "accepted") {
      installOffer = null;
      notify();
      toast.success(`${name} installed`, { description: isMac ? "Find it in Launchpad or keep it in the Dock." : "Find it in the Start menu or pin it to the taskbar." });
    }
  };
  return (
    <Group title="Install as an app">
      <Row
        label="Its own app with a Dock / taskbar icon"
        hint={hint ?? "Opens in its own window, straight from Spotlight, Launchpad or the Start menu — no tabs to hunt for. Files and settings are shared with the browser."}
      >
        {standalone ? (
          <span className="flex h-8 shrink-0 items-center gap-1.5 rounded-lg bg-success-soft px-2.5 text-xs font-semibold text-success">
            <Check className="size-[1.3rem]" />
            You&apos;re in the app
          </span>
        ) : (
          offer && (
            <button type="button" onClick={install} className="flex h-10 shrink-0 items-center gap-2 rounded-xl bg-ink px-4 text-sm font-semibold text-ground hover:bg-ink/85">
              <AppWindow className="size-[1.5rem]" />
              Install app
            </button>
          )
        )}
      </Row>
      {!standalone && !offer && (
        <ul className="flex flex-col gap-1.5 pb-3 text-sm text-ink-2">
          <li>
            <b>Chrome:</b> ⋮ menu → Cast, save and share → <b>Install page as app…</b> (or the install icon at the right of the address bar)
          </li>
          <li>
            <b>Brave:</b> ≡ menu → Save and share → <b>Install page as app…</b>
          </li>
          <li>
            <b>Edge:</b> ⋯ menu → Apps → <b>Install this site as an app</b>
          </li>
          <li>
            <b>Safari on Mac:</b> File → <b>Add to Dock…</b>
          </li>
        </ul>
      )}
    </Group>
  );
}
