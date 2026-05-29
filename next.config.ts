import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        // /welcome is gated on a single-shot cookie. After the user clicks
        // Join → Telegram opens → cookie is cleared, the page goes into the
        // browser's back-forward cache with the button still visible. On
        // back-navigation, bfcache restores the stale page without contacting
        // the server, so the user sees a Join button that's no longer wired
        // to a valid cookie.
        //
        // Cache-Control: no-store opts the page out of bfcache. Back-nav now
        // triggers a fresh server render, which reads the (now-empty) cookie
        // and 307s to /.
        source: "/welcome",
        headers: [{ key: "Cache-Control", value: "no-store" }],
      },
    ];
  },
};

export default nextConfig;
