/* Built-in demo photos (public/demo/, credits in public/demo/credits.json). */
import type { DemoChatImage } from "../../api/cases.ts";

/** Sample photo a customer can "send" from the LINE test sender. */
export const chatImageUrl = (key: DemoChatImage) => `/demo/chat-${key}.webp`;

/** ~240px copy of a built-in unit photo (public/demo/unit-*-thumb.webp) for chips, cards and pickers. */
export const unitThumb = (url: string) => (/^\/demo\/unit-[a-z0-9]+\.webp$/.test(url) ? url.replace(/\.webp$/, "-thumb.webp") : url);

/** Only our own sample photos are shown straight from a URL; anything else goes through the API. */
export const isDemoPhoto = (url: unknown): url is string => typeof url === "string" && /^\/demo\/[a-z0-9-]+\.webp$/.test(url);

/** Login hero (same entry as credits.json). */
export const HERO_PHOTO = {
  src: "/demo/hero-port.webp",
  author: "H. Zell",
  license: "CC BY-SA 3.0",
  source: "https://commons.wikimedia.org/wiki/File:Container-Terminal_Bremerhaven_01.jpg",
} as const;

export type PhotoCredit = {
  file: string;
  title: string;
  author: string;
  license: string;
  licenseUrl: string;
  source: string;
  changes: string;
};
