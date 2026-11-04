"use client";
import { createClient, SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Two separate clients with separate sessions, so a facilitator can test the
// participant view in the same browser without logging themselves out.
let participantClient: SupabaseClient | null = null;
let adminClient: SupabaseClient | null = null;

function make(storageKey: string) {
  return createClient(url, anonKey, {
    auth: { storageKey, persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
    realtime: { params: { eventsPerSecond: 20 } },
  });
}

export function participantDb() {
  if (!participantClient) participantClient = make("afrikadag-participant");
  return participantClient;
}
export function adminDb() {
  if (!adminClient) adminClient = make("afrikadag-admin");
  return adminClient;
}

export const isConfigured = Boolean(url && anonKey);

/** Turn database error codes into human sentences. */
export function friendlyError(err: unknown): string {
  const msg = (err as { message?: string })?.message ?? String(err);
  const map: Record<string, string> = {
    WORKSHOP_NOT_FOUND: "We couldn't find a workshop with that code. Please check the code on the screen.",
    TABLE_NOT_FOUND: "That table number isn't part of this workshop. Please check the number on your table.",
    WORKSHOP_FULL: "This workshop is full. Please ask a facilitator for help.",
    WORKSHOP_ENDED: "This workshop has ended. Thank you for taking part!",
    LOCKED: "Submissions are locked by the facilitator right now.",
    KEY_TAKEAWAY_REQUIRED: "Please fill in your group's key takeaway before submitting.",
    NOT_IN_GROUP: "You're not part of this group.",
    ADMIN_ONLY: "Only facilitators can do this.",
    NOT_JOINED: "Please join the workshop first.",
  };
  for (const k of Object.keys(map)) if (msg.includes(k)) return map[k];
  if (/fetch|network|Failed to fetch/i.test(msg)) return "Connection problem. We'll keep trying, your work is stored on this device.";
  return msg;
}
