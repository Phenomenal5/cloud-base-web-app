// These mirror the backend's response shapes.

export type Role = "TRAINEE" | "ANALYST" | "ADMIN";
export type UserStatus = "ACTIVE" | "BLOCKED";

export interface User {
  id: string;
  email: string;
  displayName: string;
  role: Role;
  status: UserStatus;
  emailVerified: boolean;
  avatarUrl: string | null;
  createdAt: string;
}

export interface ConversationSummary {
  id: string;
  title: string;
  pinned: boolean;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
  _count: { messages: number };
}

export type MessageRole = "USER" | "ASSISTANT";

export interface Citation {
  acn: string;
  reportId: string;
}

export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  citations: Citation[] | null;
  createdAt: string;
}

// A retrieved report shown as a source alongside an answer.
export interface Source {
  acn: string;
  reportId: string;
  synopsis: string | null;
  similarity: number;
}

export type Category =
  | "HUMAN_FACTORS"
  | "AIRCRAFT_SYSTEMS"
  | "WEATHER"
  | "ATC_COMMUNICATION"
  | "RUNWAY_SAFETY"
  | "WILDLIFE"
  | "PROCEDURAL"
  | "OTHER";
export type Severity = "LOW" | "MEDIUM" | "HIGH";

export interface Report {
  id: string;
  acn: string;
  synopsis: string | null;
  narrative: string;
  reportDate: string | null;
  category: Category | null;
  severity: Severity | null;
  severityJustification: string | null;
  summary: string | null;
}

export interface ReportListItem {
  id: string;
  acn: string;
  synopsis: string | null;
  reportDate: string | null;
  category: Category | null;
  severity: Severity | null;
}

export interface ReportPage {
  reports: ReportListItem[];
  page: number;
  limit: number;
  total: number;
  pages: number;
}

export interface ReportFilters {
  category?: Category;
  severity?: Severity;
  from?: string;
  to?: string;
  page?: number;
}

// NOTE: AppNotification, not Notification. `Notification` is a DOM global (the
// Web Notifications API), so a file that forgot the import would quietly
// type-check against the browser's one instead of failing.
export interface AppNotification {
  id: string;
  title: string;
  body: string;
  readAt: string | null;
  createdAt: string;
}

// The feed and the count come back together, so the bell badge and the list can
// never disagree.
export interface NotificationFeed {
  notifications: AppNotification[];
  unread: number;
}

// Today's queries against the daily allowance. The UI shows `percentUsed` only —
// a raw "18 of 30 left" turned the composer into a countdown clock. Admins are
// unlimited, which comes back as nulls in every field but `used`.
export interface UsageInfo {
  limit: number | null;
  used: number;
  remaining: number | null;
  percentUsed: number | null;
  resetsAt: string | null;
}

export interface Tokens {
  accessToken: string;
  refreshToken: string;
}

// Every successful API response has this shape.
export interface ApiEnvelope<T> {
  message?: string;
  data: T;
}
