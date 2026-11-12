"use client";

import { useEffect } from "react";
import { startWarmup } from "@/lib/services";

/** Mounted once in the root layout: wakes the hosted agents and Guard as soon as anyone opens any page (lib/services.ts). */
export function ServiceWarmup() {
  useEffect(() => startWarmup(), []);
  return null;
}
