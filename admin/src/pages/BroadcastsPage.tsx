import { useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { useBroadcastMutation } from '@/store/api'
import { getApiErrorMessage } from '@/lib/apiError'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'

// Kept in step with broadcastSchema on the server.
const MAX_TITLE_LENGTH = 120
const MAX_BODY_LENGTH = 1000

export const BroadcastsPage = () => {
  const [broadcast, { isLoading }] = useBroadcastMutation()
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    try {
      const result = await broadcast({ title: title.trim(), body: body.trim() }).unwrap()
      toast.success(`Sent to ${result.recipients} user(s)`)
      setTitle('')
      setBody('')
    } catch (error) {
      toast.error(getApiErrorMessage(error))
    }
  }

  return (
    <div className='mx-auto w-full max-w-lg px-6 py-8'>
      <h1 className='text-xl font-semibold'>Broadcast a notification</h1>
      <p className='mt-1 text-sm text-muted'>Send an in-app notification to every user.</p>

      <form onSubmit={handleSubmit} className='mt-4 flex flex-col gap-4'>
        <Input
          label='Title'
          name='title'
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          maxLength={MAX_TITLE_LENGTH}
          required
        />
        <div className='flex flex-col gap-1.5'>
          <label htmlFor='broadcast-body' className='text-sm font-medium'>
            Message
          </label>
          <textarea
            id='broadcast-body'
            value={body}
            onChange={(event) => setBody(event.target.value)}
            maxLength={MAX_BODY_LENGTH}
            rows={4}
            required
            className='w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand'
          />
        </div>
        {/* Whitespace-only passes `required`, so check the trimmed values too. */}
        <Button
          type='submit'
          loading={isLoading}
          disabled={!title.trim() || !body.trim()}
          className='self-start'
        >
          Send broadcast
        </Button>
      </form>
    </div>
  )
}
