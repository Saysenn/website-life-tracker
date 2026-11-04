import { Eraser, ImageUp, Wrench } from "lucide-react";

const ICONS = { eraser: Eraser, image: ImageUp };

export function ToolIcon({ name, ...props }) {
  const Icon = ICONS[name] ?? Wrench;
  return <Icon strokeWidth={1.75} {...props} />;
}
