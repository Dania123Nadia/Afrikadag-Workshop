import {
  Briefcase, Building2, Flag, Globe2, GraduationCap, HandHeart, Handshake, Landmark, Scale, UserRound, Users, type LucideIcon,
} from "lucide-react";

export const GROUP_ICONS: Record<string, LucideIcon> = {
  landmark: Landmark, flag: Flag, briefcase: Briefcase, "user-round": UserRound, "graduation-cap": GraduationCap,
  users: Users, building: Building2, handshake: Handshake, globe: Globe2, scale: Scale, "hand-heart": HandHeart,
};

export function GroupIcon({ name, className, style }: { name: string; className?: string; style?: React.CSSProperties }) {
  const I = GROUP_ICONS[name] ?? Users;
  return <I className={className} style={style} aria-hidden />;
}

export function GroupBadge({ name, color, icon, size = "md" }: { name: string; color: string; icon: string; size?: "sm" | "md" | "lg" }) {
  const box = size === "lg" ? "h-14 w-14 rounded-2xl" : size === "sm" ? "h-7 w-7 rounded-lg" : "h-10 w-10 rounded-xl";
  const ic = size === "lg" ? "h-7 w-7" : size === "sm" ? "h-3.5 w-3.5" : "h-5 w-5";
  return (
    <span className={`inline-flex shrink-0 items-center justify-center ${box}`} style={{ background: `${color}18`, color }} title={name}>
      <GroupIcon name={icon} className={ic} />
    </span>
  );
}
