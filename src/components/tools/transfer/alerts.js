let audio;

/** A soft two note chime, made with Web Audio so there is no sound file to load. */
export function chime() {
  try {
    audio ??= new AudioContext();
    const start = audio.currentTime;
    [660, 880].forEach((frequency, index) => {
      const oscillator = audio.createOscillator();
      const gain = audio.createGain();
      oscillator.frequency.value = frequency;
      oscillator.type = "sine";
      gain.gain.setValueAtTime(0, start + index * 0.12);
      gain.gain.linearRampToValueAtTime(0.08, start + index * 0.12 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + index * 0.12 + 0.35);
      oscillator.connect(gain).connect(audio.destination);
      oscillator.start(start + index * 0.12);
      oscillator.stop(start + index * 0.12 + 0.4);
    });
  } catch {}
}

export function desktopAlert(title, body, onClick) {
  if (typeof Notification === "undefined" || Notification.permission !== "granted" || !document.hidden) return;
  const notification = new Notification(title, { body, tag: "file-transfer", icon: "/icon.svg" });
  notification.onclick = () => {
    window.focus();
    onClick?.();
    notification.close();
  };
}

export function previewOf(message) {
  if (!message) return "";
  if (message.file) return `Sent ${message.file.name ?? "a file"}`;
  return message.body ?? "";
}
