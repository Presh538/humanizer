"use client";

import { DialRoot } from "dialkit";
import { Paraphraser } from "./Paraphraser";

export function AppShell() {
  return (
    <>
      <Paraphraser />
      <DialRoot position="top-right" />
    </>
  );
}
