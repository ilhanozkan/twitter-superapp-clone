export const CHANNELS_PATH = "/channels";

export const channelPath = (handle: string) =>
  `${CHANNELS_PATH}/${encodeURIComponent(handle)}`;

/** /channels with its tab: "Your channels" is the default. */
export const channelsTabPath = (tab: "mine" | "discover") =>
  tab === "discover" ? `${CHANNELS_PATH}?tab=discover` : CHANNELS_PATH;
