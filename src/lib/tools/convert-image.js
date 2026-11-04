import { baseName } from "./files";

export const OUTPUT_FORMATS = [
  { value: "webp", label: "WEBP", mime: "image/webp", lossy: true },
  { value: "png", label: "PNG", mime: "image/png", lossy: false },
  { value: "jpg", label: "JPG", mime: "image/jpeg", lossy: true },
];

export const INPUT_FORMATS = [
  { value: "image", label: "Image", accept: "image/*" },
  { value: "png", label: "PNG", accept: "image/png,.png" },
  { value: "jpg", label: "JPG", accept: "image/jpeg,.jpg,.jpeg" },
  { value: "webp", label: "WEBP", accept: "image/webp,.webp" },
  { value: "gif", label: "GIF", accept: "image/gif,.gif" },
  { value: "bmp", label: "BMP", accept: "image/bmp,.bmp" },
  { value: "svg", label: "SVG", accept: "image/svg+xml,.svg" },
  { value: "avif", label: "AVIF", accept: "image/avif,.avif" },
  { value: "heic", label: "HEIC", accept: "image/heic,.heic,.heif" },
];

export const outputFormat = (value) => OUTPUT_FORMATS.find((format) => format.value === value) ?? OUTPUT_FORMATS[0];
export const inputFormat = (value) => INPUT_FORMATS.find((format) => format.value === value) ?? INPUT_FORMATS[0];

function loadImageElement(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("This browser can't open this image type"));
    };
    image.src = url;
  });
}

async function decode(file) {
  try {
    return await createImageBitmap(file);
  } catch {
    return loadImageElement(file); // SVG and a few others only decode through <img>
  }
}

/** Queue processor: decodes any browser-readable image and re-encodes it. */
export async function convertImage(file, onProgress, { format = "webp", quality = 0.9 } = {}) {
  const target = outputFormat(format);
  onProgress(0.1);
  const source = await decode(file);
  onProgress(0.45);

  const width = source.width || source.naturalWidth || 1024;
  const height = source.height || source.naturalHeight || 1024;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (target.value === "jpg") {
    context.fillStyle = "#ffffff"; // JPG has no transparency
    context.fillRect(0, 0, width, height);
  }
  context.drawImage(source, 0, 0, width, height);
  source.close?.();
  onProgress(0.7);

  const blob = await new Promise((resolve) =>
    canvas.toBlob(resolve, target.mime, target.lossy ? quality : undefined),
  );
  canvas.width = canvas.height = 0;
  if (!blob || blob.type !== target.mime) throw new Error(`This browser can't save ${target.label} files`);

  return { blob, name: `${baseName(file.name)}.${target.value}`, width, height, format: target.value };
}
