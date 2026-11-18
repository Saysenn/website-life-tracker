import { ArrowLeftRight, BookOpenText, Clapperboard, Eraser, FilePen, ImageUp, Wrench } from "lucide-react";

const ICONS = { transfer: ArrowLeftRight, eraser: Eraser, image: ImageUp, pdf: FilePen, video: Clapperboard, reader: BookOpenText };

export function ToolIcon({ name, ...props }) {
  const Icon = ICONS[name] ?? Wrench;
  return <Icon strokeWidth={1.75} {...props} />;
}
