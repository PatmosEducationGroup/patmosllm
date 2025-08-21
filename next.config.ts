import type { NextConfig } from "next";
import { logEnvironmentStatus } from "./src/lib/env-validator.js";

// Validate environment variables at build time
logEnvironmentStatus();

const nextConfig: NextConfig = {
  /* config options here */
};

export default nextConfig;