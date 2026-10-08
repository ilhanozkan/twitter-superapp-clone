// SANITY_STUDIO_* variables are exposed to the Studio bundle by the Sanity CLI.
export const projectId = process.env.SANITY_STUDIO_PROJECT_ID || "am1ac7lm";
export const dataset = process.env.SANITY_STUDIO_DATASET || "production";

/** Keep in sync with SANITY_API_VERSION in the app (lib/config.ts). */
export const apiVersion = "2025-02-19";

// Mirrors lib/constants.ts in the app; the Studio is a separate package.
export const TWEET_MAX_LENGTH = 280;
export const USERNAME_PATTERN = /^[A-Za-z0-9_]{1,15}$/;
