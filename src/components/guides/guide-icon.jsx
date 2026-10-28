import { BookOpen, Server } from "lucide-react";

const ICONS = { server: Server };

export function GuideIcon({ name, ...props }) {
  const Icon = ICONS[name] ?? BookOpen;
  return <Icon strokeWidth={1.75} {...props} />;
}
