import { getCurrentDisplayName } from "@/features/profile/services/profile-service";

export function getManilaGreeting(hour: number): string {
  if (hour < 12) {
    return "Good morning";
  }

  if (hour < 18) {
    return "Good afternoon";
  }

  return "Good evening";
}

function getManilaHour(date: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    hour12: false,
    timeZone: "Asia/Manila",
  }).formatToParts(date);
  const hourPart = parts.find((part) => part.type === "hour")?.value;
  const hour = Number(hourPart);

  return Number.isFinite(hour) ? hour : 0;
}

export async function Greeting() {
  const displayName = await getCurrentDisplayName();
  const greeting = getManilaGreeting(getManilaHour(new Date()));
  const text = displayName ? `${greeting}, ${displayName}` : "Welcome back";

  return (
    <h1 className="text-display text-ink font-serif font-medium tracking-tight">
      {text}
    </h1>
  );
}
