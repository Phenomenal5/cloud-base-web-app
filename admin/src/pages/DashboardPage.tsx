import {
  Users as UsersIcon,
  FileText,
  MessageSquare,
  Cpu,
  Loader2,
  type LucideIcon,
} from 'lucide-react'
import { useMetricsQuery } from '@/store/api'
import type { AiOperation, JobStatus } from '@/lib/types'
import { cn } from '@/lib/cn'

const JOB_STATUS_TEXT: Record<JobStatus, string> = {
  QUEUED: 'text-slate-600 dark:text-slate-300',
  PROCESSING: 'text-sky-600 dark:text-sky-400',
  COMPLETED: 'text-emerald-600 dark:text-emerald-400',
  FAILED: 'text-rose-600 dark:text-rose-400',
}

const CARD_CLASS = 'rounded-xl border border-border bg-surface p-4'

const formatNumber = (value: number): string => value.toLocaleString()

// EMBEDDING -> "Embedding"
const formatOperation = (operation: AiOperation): string => {
  const word = operation.toLowerCase()
  return word.charAt(0).toUpperCase() + word.slice(1)
}

interface StatCardProps {
  label: string
  value: string
  hint?: string
  icon: LucideIcon
}

const StatCard = ({ label, value, hint, icon: Icon }: StatCardProps) => (
  <div className={CARD_CLASS}>
    <div className='flex items-center gap-2 text-muted'>
      <Icon className='h-4 w-4' />
      <p className='text-xs font-medium'>{label}</p>
    </div>
    <p className='mt-2 text-2xl font-semibold'>{value}</p>
    {hint && <p className='mt-0.5 text-xs text-muted'>{hint}</p>}
  </div>
)

export const DashboardPage = () => {
  const { data: metrics, isLoading } = useMetricsQuery()

  if (isLoading || !metrics) {
    return (
      <div className='flex h-full items-center justify-center'>
        <Loader2 className='h-6 w-6 animate-spin text-brand' />
      </div>
    )
  }

  return (
    <div className='mx-auto w-full max-w-5xl px-6 py-8'>
      <h1 className='text-xl font-semibold'>Dashboard</h1>

      <div className='mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4'>
        <StatCard
          icon={UsersIcon}
          label='Users'
          value={formatNumber(metrics.users.total)}
          hint={`+${metrics.users.today} today · ${metrics.users.blocked} blocked`}
        />
        <StatCard
          icon={FileText}
          label='Reports'
          value={formatNumber(metrics.corpus.reports)}
          hint={`${formatNumber(metrics.corpus.chunks)} chunks`}
        />
        <StatCard
          icon={MessageSquare}
          label='Queries'
          value={formatNumber(metrics.queries.total)}
          hint={`${metrics.queries.byKind.ASK} ask · ${metrics.queries.byKind.SEARCH} search`}
        />
        <StatCard
          icon={Cpu}
          label='Tokens used'
          value={formatNumber(metrics.tokens.total)}
          // Zero almost always means the dev fallbacks are running, not that
          // nobody has asked anything.
          hint={
            metrics.tokens.total === 0
              ? 'set an OpenAI key to track'
              : `${formatNumber(metrics.tokens.prompt)} in · ${formatNumber(metrics.tokens.completion)} out`
          }
        />
      </div>

      <div className='mt-6 grid gap-6 lg:grid-cols-2'>
        <section className={CARD_CLASS}>
          <h2 className='text-sm font-semibold'>Ingestion jobs</h2>
          <p className='mt-0.5 text-xs text-muted'>
            {metrics.jobs.total} total · {formatNumber(metrics.jobs.reportsIngested)} reports
            ingested
          </p>
          <ul className='mt-3 flex flex-col gap-1.5 text-sm'>
            {(Object.keys(metrics.jobs.byStatus) as JobStatus[]).map((status) => (
              <li key={status} className='flex items-center justify-between'>
                <span className={cn('font-medium', JOB_STATUS_TEXT[status])}>{status}</span>
                <span className='text-muted'>{metrics.jobs.byStatus[status]}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className={CARD_CLASS}>
          <h2 className='text-sm font-semibold'>Token usage by operation</h2>
          <ul className='mt-3 flex flex-col gap-1.5 text-sm'>
            {(Object.keys(metrics.tokens.byOperation) as AiOperation[]).map((operation) => (
              <li key={operation} className='flex items-center justify-between'>
                <span>{formatOperation(operation)}</span>
                <span className='text-muted'>
                  {formatNumber(metrics.tokens.byOperation[operation])}
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section className={cn(CARD_CLASS, 'mt-6')}>
        <h2 className='text-sm font-semibold'>Recent signups</h2>
        {metrics.recentSignups.length === 0 ? (
          <p className='mt-2 text-sm text-muted'>No users yet.</p>
        ) : (
          <ul className='mt-3 divide-y divide-border'>
            {metrics.recentSignups.map((signup) => (
              <li key={signup.id} className='flex items-center justify-between py-2 text-sm'>
                <div className='min-w-0'>
                  <span className='font-medium'>{signup.displayName}</span>
                  <span className='ml-2 text-xs text-muted'>{signup.email}</span>
                </div>
                <div className='flex shrink-0 items-center gap-3 text-xs text-muted'>
                  <span>{signup.role}</span>
                  <span>{new Date(signup.createdAt).toLocaleDateString()}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
