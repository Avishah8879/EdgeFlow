export type PlatformSlug = "platform-a" | "platform-b";

export interface PlatformConfig {
  slug: PlatformSlug;
  name: string;
  url: string;
  description: string;
}

const PLATFORMS: PlatformConfig[] = [
  {
    slug: "platform-a",
    name: "OptionFlow",
    url: import.meta.env.VITE_PLATFORM_A_URL || "http://164.52.192.245:8088",
    description: "Options analytics and trading workspace",
  },
  {
    slug: "platform-b",
    name: "EquityPro AI",
    url: import.meta.env.VITE_PLATFORM_B_URL || "https://ai.equitypro.ai",
    description: "PineScript AI strategy lab",
  },
];

export function getPlatform(slug: string | undefined): PlatformConfig | null {
  if (!slug) return null;
  return PLATFORMS.find((platform) => platform.slug === slug) || null;
}

export function getPlatformOrigin(platform: PlatformConfig): string {
  return new URL(platform.url).origin;
}

export const embeddedPlatforms = PLATFORMS;
