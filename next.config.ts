import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Standalone output produces .next/standalone, a minimal self-contained
  // server bundle — this is what the Dockerfile copies into the final image,
  // and keeps the production image small for the 1 vCPU / 1 GB target.
  output: "standalone",
  // pdfkit/fontkit ship font-metric data files (e.g. Helvetica.afm) that they
  // read from disk at runtime via relative paths. Webpack bundling breaks
  // those paths, causing "ENOENT ... Helvetica.afm" when generating the
  // booking PDF. Marking them external makes Next call require() on the
  // real installed package instead, so the data files resolve correctly.
  serverExternalPackages: ["pdfkit", "fontkit"],
};

export default nextConfig;
