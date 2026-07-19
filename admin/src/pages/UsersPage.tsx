import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import {
  useListUsersQuery,
  useUpdateUserRoleMutation,
  useUpdateUserStatusMutation,
} from '@/store/api'
import { useAppSelector } from '@/store/hooks'
import { useDebounce } from '@/hooks/useDebounce'
import { getApiErrorMessage } from '@/lib/apiError'
import type { Role, UserStatus } from '@/lib/types'
import { cn } from '@/lib/cn'

const ROLES: Role[] = ['TRAINEE', 'ANALYST', 'ADMIN']

const SELECT_CLASS =
  'rounded-lg border border-border bg-surface px-2 py-1.5 text-sm outline-none focus:border-brand'

export function UsersPage() {
  const currentUser = useAppSelector((state) => state.auth.user)
  const [searchTerm, setSearchTerm] = useState('')
  const [roleFilter, setRoleFilter] = useState<Role | ''>('')
  const [statusFilter, setStatusFilter] = useState<UserStatus | ''>('')
  const [page, setPage] = useState(1)
  const debouncedSearch = useDebounce(searchTerm, 300)

  const { data, isLoading } = useListUsersQuery({
    search: debouncedSearch || undefined,
    role: roleFilter || undefined,
    status: statusFilter || undefined,
    page,
  })
  const [updateRole] = useUpdateUserRoleMutation()
  const [updateStatus] = useUpdateUserStatusMutation()

  async function handleRoleChange(id: string, role: Role) {
    try {
      await updateRole({ id, role }).unwrap()
      toast.success(`Role updated to ${role}`)
    } catch (roleError) {
      toast.error(getApiErrorMessage(roleError))
    }
  }

  async function handleStatusChange(id: string, status: UserStatus) {
    try {
      await updateStatus({ id, status }).unwrap()
      toast.success(status === 'BLOCKED' ? 'User blocked' : 'User unblocked')
    } catch (statusError) {
      toast.error(getApiErrorMessage(statusError))
    }
  }

  return (
    <div className='mx-auto w-full max-w-5xl px-6 py-8'>
      <h1 className='text-xl font-semibold'>Users</h1>
      <p className='mt-1 text-sm text-muted'>Manage roles and account access.</p>

      <div className='mt-5 flex flex-wrap gap-2'>
        <input
          value={searchTerm}
          onChange={(event) => {
            setSearchTerm(event.target.value)
            setPage(1)
          }}
          placeholder='Search name or email'
          className={cn(SELECT_CLASS, 'min-w-56 flex-1')}
        />
        <select
          value={roleFilter}
          onChange={(event) => {
            setRoleFilter(event.target.value as Role | '')
            setPage(1)
          }}
          className={SELECT_CLASS}
        >
          <option value=''>All roles</option>
          {ROLES.map((role) => (
            <option key={role} value={role}>
              {role}
            </option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(event) => {
            setStatusFilter(event.target.value as UserStatus | '')
            setPage(1)
          }}
          className={SELECT_CLASS}
        >
          <option value=''>All statuses</option>
          <option value='ACTIVE'>Active</option>
          <option value='BLOCKED'>Blocked</option>
        </select>
      </div>

      <div className='mt-4 overflow-hidden rounded-xl border border-border'>
        {isLoading ? (
          <div className='flex justify-center py-12'>
            <Loader2 className='h-6 w-6 animate-spin text-brand' />
          </div>
        ) : !data || data.users.length === 0 ? (
          <p className='py-12 text-center text-sm text-muted'>No users match.</p>
        ) : (
          <table className='w-full text-sm'>
            <thead className='bg-surface-2 text-left text-xs text-muted'>
              <tr>
                <th className='px-4 py-2 font-medium'>User</th>
                <th className='px-4 py-2 font-medium'>Role</th>
                <th className='px-4 py-2 font-medium'>Status</th>
                <th className='px-4 py-2' />
              </tr>
            </thead>
            <tbody className='divide-y divide-border'>
              {data.users.map((user) => {
                const isSelf = user.id === currentUser?.id
                return (
                  <tr key={user.id}>
                    <td className='px-4 py-2'>
                      <div className='font-medium'>
                        {user.displayName}
                        {isSelf && <span className='ml-1 text-xs text-muted'>(you)</span>}
                      </div>
                      <div className='text-xs text-muted'>
                        {user.email}
                        {!user.emailVerified && ' · unverified'}
                      </div>
                    </td>
                    <td className='px-4 py-2'>
                      <select
                        value={user.role}
                        disabled={isSelf}
                        onChange={(event) =>
                          handleRoleChange(user.id, event.target.value as Role)
                        }
                        className='rounded-md border border-border bg-surface px-2 py-1 text-xs disabled:opacity-50'
                      >
                        {ROLES.map((role) => (
                          <option key={role} value={role}>
                            {role}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className='px-4 py-2'>
                      <span
                        className={cn(
                          'rounded-md px-2 py-0.5 text-xs font-medium',
                          user.status === 'BLOCKED'
                            ? 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300'
                            : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
                        )}
                      >
                        {user.status}
                      </span>
                    </td>
                    <td className='px-4 py-2 text-right'>
                      {!isSelf && (
                        <button
                          type='button'
                          onClick={() =>
                            handleStatusChange(
                              user.id,
                              user.status === 'BLOCKED' ? 'ACTIVE' : 'BLOCKED',
                            )
                          }
                          className='text-xs text-brand hover:underline'
                        >
                          {user.status === 'BLOCKED' ? 'Unblock' : 'Block'}
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {data && data.pages > 1 && (
        <div className='mt-4 flex items-center justify-center gap-3 text-sm'>
          <button
            type='button'
            disabled={page <= 1}
            onClick={() => setPage((previous) => previous - 1)}
            className='rounded-lg border border-border px-3 py-1.5 transition hover:bg-surface-2 disabled:opacity-40'
          >
            Prev
          </button>
          <span className='text-muted'>
            Page {data.page} of {data.pages} · {data.total} users
          </span>
          <button
            type='button'
            disabled={page >= data.pages}
            onClick={() => setPage((previous) => previous + 1)}
            className='rounded-lg border border-border px-3 py-1.5 transition hover:bg-surface-2 disabled:opacity-40'
          >
            Next
          </button>
        </div>
      )}
    </div>
  )
}
