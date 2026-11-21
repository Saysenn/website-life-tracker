import { ArrowLeftRight, BookOpenText, Clapperboard, Eraser, FilePen, ImageUp, MicVocal, ScreenShare, Wrench } from "lucide-react";

const ICONS = { transfer: ArrowLeftRight, eraser: Eraser, image: ImageUp, pdf: FilePen, video: Clapperboard, reader: BookOpenText, screen: ScreenShare, mic: MicVocal };

export function ToolIcon({ name, ...props }) {
  const Icon = ICONS[name] ?? Wrench;
  return <Icon strokeWidth={1.75} {...props} />;
}
