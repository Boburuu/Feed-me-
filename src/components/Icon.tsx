import { iconPaths } from "./iconPaths";

export type IconName = keyof typeof iconPaths;

export default function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  return <svg aria-hidden="true" fill="currentColor" height={size} viewBox="0 0 256 256" width={size} dangerouslySetInnerHTML={{ __html: iconPaths[name] }} />;
}
