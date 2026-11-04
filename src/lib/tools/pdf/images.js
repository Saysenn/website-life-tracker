/** Image helpers for the PDF editor: loading, background removal and trimming. */

export function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("This image couldn't be opened"));
    image.src = src;
  });
}

export const blobToDataUrl = (blob) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });

/** Draws an image (or canvas) onto a fresh canvas, scaled down to `max` px on its long side. */
export function toCanvas(source, max = 2000) {
  const width = source.naturalWidth || source.width;
  const height = source.naturalHeight || source.height;
  const ratio = Math.min(1, max / Math.max(width, height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width * ratio));
  canvas.height = Math.max(1, Math.round(height * ratio));
  canvas.getContext("2d", { willReadFrequently: true }).drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas;
}

/** Median colour of the image border — usually the paper / background. */
function borderColour(data, width, height) {
  const samples = [[], [], []];
  const step = Math.max(1, Math.floor((width + height) / 400));
  const take = (x, y) => {
    const i = (y * width + x) * 4;
    if (data[i + 3] < 128) return;
    samples[0].push(data[i]);
    samples[1].push(data[i + 1]);
    samples[2].push(data[i + 2]);
  };
  for (let x = 0; x < width; x += step) {
    take(x, 0);
    take(x, height - 1);
  }
  for (let y = 0; y < height; y += step) {
    take(0, y);
    take(width - 1, y);
  }
  return samples.map((channel) => {
    if (!channel.length) return 255;
    channel.sort((a, b) => a - b);
    return channel[Math.floor(channel.length / 2)];
  });
}

const hexToRgb = (hex) => [1, 3, 5].map((offset) => parseInt(hex.slice(offset, offset + 2), 16));

/**
 * Makes the background transparent. `tolerance` 0–100 controls how different a
 * pixel must be from the background to be kept; `ink` optionally recolours
 * what's left (great for signatures). Returns a trimmed PNG canvas.
 */
export function removeBackground(source, { tolerance = 30, ink = null, trim = true } = {}) {
  const canvas = toCanvas(source);
  const context = canvas.getContext("2d", { willReadFrequently: true });
  const { width, height } = canvas;
  const image = context.getImageData(0, 0, width, height);
  const { data } = image;
  const [br, bg, bb] = borderColour(data, width, height);
  const cut = (tolerance / 100) * 200;
  const feather = 40;
  const recolour = ink ? hexToRgb(ink) : null;

  for (let i = 0; i < data.length; i += 4) {
    const distance = Math.sqrt((data[i] - br) ** 2 + (data[i + 1] - bg) ** 2 + (data[i + 2] - bb) ** 2);
    const keep = Math.max(0, Math.min(1, (distance - cut) / feather));
    data[i + 3] = Math.round(data[i + 3] * keep);
    if (recolour && data[i + 3] > 0) {
      data[i] = recolour[0];
      data[i + 1] = recolour[1];
      data[i + 2] = recolour[2];
    }
  }
  context.putImageData(image, 0, 0);
  return trim ? trimTransparent(canvas) : canvas;
}

/** Crops away fully transparent margins. */
export function trimTransparent(canvas, padding = 4) {
  const context = canvas.getContext("2d", { willReadFrequently: true });
  const { width, height } = canvas;
  const { data } = context.getImageData(0, 0, width, height);
  let top = height;
  let left = width;
  let right = -1;
  let bottom = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] > 8) {
        if (x < left) left = x;
        if (x > right) right = x;
        if (y < top) top = y;
        if (y > bottom) bottom = y;
      }
    }
  }
  if (right < 0) return canvas;
  left = Math.max(0, left - padding);
  top = Math.max(0, top - padding);
  right = Math.min(width - 1, right + padding);
  bottom = Math.min(height - 1, bottom + padding);
  const out = document.createElement("canvas");
  out.width = right - left + 1;
  out.height = bottom - top + 1;
  out.getContext("2d").drawImage(canvas, left, top, out.width, out.height, 0, 0, out.width, out.height);
  return out;
}

/** Turns a file into an editor asset: { src (data URL), width, height }. */
export async function fileToAsset(file) {
  const src = await blobToDataUrl(file);
  const image = await loadImage(src);
  // Normalise everything except plain JPEG/PNG to PNG so it can be embedded in the PDF.
  if (/^data:image\/(png|jpeg)/.test(src) && Math.max(image.naturalWidth, image.naturalHeight) <= 3000) {
    return { src, width: image.naturalWidth, height: image.naturalHeight };
  }
  const canvas = toCanvas(image, 3000);
  return { src: canvas.toDataURL("image/png"), width: canvas.width, height: canvas.height };
}

/** Samples the page canvas under a box: returns the background colour and the text colour. */
export function sampleColours(canvas, box, scale) {
  const context = canvas.getContext("2d", { willReadFrequently: true });
  const x = Math.max(0, Math.floor(box.x * scale) - 2);
  const y = Math.max(0, Math.floor(box.y * scale) - 2);
  const width = Math.min(canvas.width - x, Math.ceil(box.width * scale) + 4);
  const height = Math.min(canvas.height - y, Math.ceil(box.height * scale) + 4);
  if (width <= 0 || height <= 0) return { background: "#ffffff", text: "#000000" };
  const { data } = context.getImageData(x, y, width, height);
  const background = borderColour(data, width, height);
  let best = 0;
  let text = [0, 0, 0];
  for (let i = 0; i < data.length; i += 4) {
    const distance = Math.abs(data[i] - background[0]) + Math.abs(data[i + 1] - background[1]) + Math.abs(data[i + 2] - background[2]);
    if (distance > best) {
      best = distance;
      text = [data[i], data[i + 1], data[i + 2]];
    }
  }
  const hex = (rgb) => `#${rgb.map((value) => value.toString(16).padStart(2, "0")).join("")}`;
  // Anti-aliasing lightens strokes; snap near-black to black.
  if (text.every((value) => value < 70)) text = [0, 0, 0];
  return { background: hex(background), text: hex(text) };
}
