import type { MetadataRoute } from "next";

// Lets browsers install Normie as an app ("Add to home screen") with the brand icon and colours.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Normie · database copilot",
    short_name: "Normie",
    description: "Design, normalise, query and operate PostgreSQL databases with a copilot that asks before it changes anything.",
    start_url: "/projects",
    display: "standalone",
    background_color: "#0a0c10",
    theme_color: "#0a0c10",
    icons: [
      { src: "/brand/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/brand/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
