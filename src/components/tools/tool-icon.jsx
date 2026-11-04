import { Eraser, FilePen, ImageUp, Wrench } from "lucide-react";

const ICONS = { eraser: Eraser, image: ImageUp, pdf: FilePen };

export function ToolIcon({ name, ...props }) {
  const Icon = ICONS[name] ?? Wrench;
  return <Icon strokeWidth={1.75} {...props} />;
}
