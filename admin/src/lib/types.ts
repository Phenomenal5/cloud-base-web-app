// These mirror the backend's response shapes.

export type Role = 'TRAINEE' | 'ANALYST' | 'ADMIN'
export type UserStatus = 'ACTIVE' | 'BLOCKED'
export type JobStatus = 'QUEUED' | 'PROCESSING' | 'COMPLETED' | 'FAILED'

export interface User {
  id: string
  email: string
  displayName: string
  role: Role
  status: UserStatus
  emailVerified: boolean
  avatarUrl: string | null
  createdAt: string
}

// A row in /admin/users. Narrower than User: no avatar, since the table doesn't
// show one.
export interface AdminUser {
  id: string
  email: string
  displayName: string
  role: Role
  status: UserStatus
  emailVerified: boolean
  createdAt: string
}

export interface UserPage {
  users: AdminUser[]
  page: number
  limit: number
  total: number
  pages: number
}

export interface IngestionJob {
  id: string
  filename: string
  status: JobStatus
  totalRows: number
  reportsIngested: number
  chunksCreated: number
  error: string | null
  startedAt: string | null
  completedAt: string | null
  createdAt: string
}

export type AiOperation = 'EMBEDDING' | 'CHAT' | 'REWRITE' | 'CLASSIFICATION' | 'SUMMARIZATION'

export interface Metrics {
  users: {
    total: number
    blocked: number
    today: number
    byRole: Record<Role, number>
  }
  corpus: { reports: number; chunks: number }
  jobs: {
    total: number
    reportsIngested: number
    chunksCreated: number
    byStatus: Record<JobStatus, number>
  }
  queries: {
    total: number
    byKind: Record<'SEARCH' | 'ASK', number>
  }
  tokens: {
    total: number
    prompt: number
    completion: number
    byOperation: Record<AiOperation, number>
  }
  recentSignups: Array<{
    id: string
    displayName: string
    email: string
    role: Role
    createdAt: string
  }>
}

export interface ApiEnvelope<T> {
  message?: string
  data: T
}
