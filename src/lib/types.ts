export type StageKind = "intro" | "proposal" | "assignment" | "discussion" | "submit" | "presentation";
export type WorkshopStatus = "draft" | "live" | "paused" | "ended";
export type ItemKind = "opportunity" | "risk" | "recommendation";
export type ItemFlag = "innovative" | "disagreement" | "insight" | null;

export interface Workshop {
  id: string;
  title: string;
  subtitle: string | null;
  access_code: string;
  status: WorkshopStatus;
  current_stage: number;
  timer_running: boolean;
  timer_ends_at: string | null;
  timer_remaining: number | null;
  submissions_locked: boolean;
  ask_names: boolean;
  max_participants: number;
  spotlight_group_id: string | null;
  content: WorkshopContent;
  created_at: string;
  updated_at: string;
}

export interface WorkshopContent {
  challenge?: string;
  circular?: string;
  traffic?: string;
  cotraining?: string;
  green_examples?: string;
  amber_examples?: string;
  red_examples?: string;
}

export interface Stage {
  id: string;
  workshop_id: string;
  position: number;
  kind: StageKind;
  title: string;
  instructions: string;
  duration_minutes: number;
}

export interface StakeholderGroup {
  id: string;
  workshop_id: string;
  position: number;
  name: string;
  icon: string;
  color: string;
  who: string;
  interests: string;
  concerns: string;
  illustrative: boolean;
}

export interface Assignment { workshop_id: string; table_number: number; group_id: string }

export interface Question { id: string; group_id: string; position: number; text: string; level: "core" | "deeper" | "challenge" }

export interface Participant {
  id: string;
  workshop_id: string;
  user_id: string;
  display_name: string | null;
  table_number: number;
  group_id: string;
  joined_at: string;
  last_seen_at: string;
}

export interface GroupField {
  group_id: string;
  field: "notes" | "key_takeaway";
  workshop_id: string;
  content: string;
  version: number;
  updated_by: string | null;
  updated_at: string;
}

export interface ResponseItem {
  id: string;
  workshop_id: string;
  group_id: string;
  kind: ItemKind;
  text: string;
  author_id: string | null;
  author_label: string | null;
  featured: boolean;
  flag: ItemFlag;
  created_at: string;
  updated_at: string;
}

export interface Reflection {
  participant_id: string;
  workshop_id: string;
  group_id: string;
  author_label: string | null;
  text: string;
  updated_at: string;
}

export interface GroupProgress {
  group_id: string;
  workshop_id: string;
  status: "draft" | "submitted";
  submitted_at: string | null;
  submitted_by: string | null;
  submission_count: number;
  last_activity_at: string | null;
  edited_after_submit: boolean;
}

export interface Submission {
  id: string;
  workshop_id: string;
  group_id: string;
  snapshot: {
    key_takeaway: string;
    notes: string | null;
    opportunities: string[];
    risks: string[];
    recommendations: string[];
    reflections: { by: string; text: string }[];
  };
  submitted_by: string | null;
  submitted_at: string;
}

export interface Announcement { id: string; workshop_id: string; message: string; active: boolean; created_at: string }

export interface PresenceMeta { pid: string; gid: string; table: number; active_at: number }
