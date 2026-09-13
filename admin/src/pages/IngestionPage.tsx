import { useRef, type ChangeEvent } from 'react'
import { Upload, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { api, useListIngestionsQuery, useUploadIngestionMutation } from '@/store/api'
import { getApiErrorMessage } from '@/lib/apiError'
import type { JobStatus } from '@/lib/types'
import { cn } from '@/lib/cn'

const STATUS_STYLES: Record<JobStatus, string> = {
  QUEUED: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  PROCESSING: 'bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300',
  COMPLETED: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
  FAILED: 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300',
}

const POLL_INTERVAL_MS = 4000

const isActive = (status: JobStatus) => status === 'QUEUED' || status === 'PROCESSING'

export const IngestionPage = () => {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploadIngestion, { isLoading }] = useUploadIngestionMutation()

  // only poll while something is actually running. once every job has settled the
  // list can't change on its own, so polling would just be wasted requests.
  // uploading invalidates the list tag, which brings the new job in and starts
  // the polling again.
  //
  // useQueryState reads the cache without firing its own request, which is what
  // lets the interval below depend on the data it controls
  const { data: cachedJobs = [] } = api.endpoints.listIngestions.useQueryState()
  const hasActiveJob = cachedJobs.some((job) => isActive(job.status))

  const { data: jobs = [] } = useListIngestionsQuery(undefined, {
    pollingInterval: hasActiveJob ? POLL_INTERVAL_MS : 0,
    skipPollingIfUnfocused: true,
  })

  const activeCount = jobs.filter((job) => isActive(job.status)).length

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    const formData = new FormData()
    formData.append('file', file)

    try {
      const job = await uploadIngestion(formData).unwrap()
      toast.success(`Queued ${job.totalRows} report(s) from ${job.filename}`)
    } catch (error) {
      toast.error(getApiErrorMessage(error))
    } finally {
      // clear the input, or picking the same file twice fires no change event
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  return (
    <div className='mx-auto w-full max-w-4xl px-6 py-8'>
      <h1 className='text-xl font-semibold'>Corpus ingestion</h1>
      <p className='mt-1 text-sm text-muted'>
        Upload an ASRS CSV. It&apos;s processed in the background, no need to wait.
      </p>

      <div className='mt-4'>
        <button
          type='button'
          onClick={() => fileInputRef.current?.click()}
          disabled={isLoading}
          className='inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-brand-contrast transition hover:bg-brand-hover disabled:opacity-60'
        >
          {isLoading ? (
            <Loader2 className='h-4 w-4 animate-spin' />
          ) : (
            <Upload className='h-4 w-4' />
          )}
          Upload CSV
        </button>
        {/* the real input is hidden, the styled button above clicks it */}
        <input
          ref={fileInputRef}
          type='file'
          accept='.csv,text/csv'
          className='hidden'
          onChange={handleFileChange}
        />
      </div>

      <h2 className='mt-8 flex items-center gap-2 text-sm font-semibold'>
        Recent jobs
        {activeCount > 0 && (
          <span className='inline-flex items-center gap-1 text-xs font-normal text-muted'>
            <Loader2 className='h-3 w-3 animate-spin' /> {activeCount} active
          </span>
        )}
      </h2>

      <div className='mt-3 overflow-hidden rounded-xl border border-border'>
        {jobs.length === 0 ? (
          <p className='py-10 text-center text-sm text-muted'>No ingestion jobs yet.</p>
        ) : (
          <table className='w-full text-sm'>
            <thead className='bg-surface-2 text-left text-xs text-muted'>
              <tr>
                <th className='px-4 py-2 font-medium'>File</th>
                <th className='px-4 py-2 font-medium'>Status</th>
                <th className='px-4 py-2 font-medium'>Result</th>
              </tr>
            </thead>
            <tbody className='divide-y divide-border'>
              {jobs.map((job) => (
                <tr key={job.id}>
                  <td className='px-4 py-2'>
                    <div className='truncate font-medium'>{job.filename}</div>
                    <div className='text-xs text-muted'>{job.totalRows} rows</div>
                  </td>
                  <td className='px-4 py-2'>
                    <span
                      className={cn(
                        'rounded-md px-2 py-0.5 text-xs font-medium',
                        STATUS_STYLES[job.status],
                      )}
                    >
                      {job.status}
                    </span>
                  </td>
                  <td className='px-4 py-2 text-xs text-muted'>
                    {job.status === 'COMPLETED'
                      ? `${job.reportsIngested} reports · ${job.chunksCreated} chunks`
                      : job.status === 'FAILED'
                        ? (job.error ?? 'Failed')
                        : ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
