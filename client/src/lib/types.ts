// these mirror what the API actually sends back

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

// a report that came back from retrieval, shown as a source under an answer
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

// AppNotification, not Notification. `Notification` is a DOM global, so a file
// that forgot the import would quietly type-check against the browser's one
export interface AppNotification {
  id: string;
  title: string;
  body: string;
  readAt: string | null;
  createdAt: string;
}

// feed and count come back together so the badge can't disagree with the list
export interface NotificationFeed {
  notifications: AppNotification[];
  unread: number;
}

// today's questions against the daily allowance. the UI only shows percentUsed,
// "18 of 30 left" turned the composer into a countdown clock. admins are
// unlimited, which comes back as null in everything except `used`
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

// every successful response from the API looks like this
export interface ApiEnvelope<T> {
  message?: string;
  data: T;
}
