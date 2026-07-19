import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { Plane, LayoutDashboard, Users, Upload, Megaphone, LogOut } from 'lucide-react'
import { useLogoutMutation } from '@/store/api'
import { useAppSelector } from '@/store/hooks'
import { ThemeToggle } from '@/components/ThemeToggle'
import { cn } from '@/lib/cn'

const NAV_ITEMS = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/users', label: 'Users', icon: Users, end: false },
  { to: '/ingestion', label: 'Ingestion', icon: Upload, end: false },
  { to: '/broadcasts', label: 'Broadcasts', icon: Megaphone, end: false },
]

export function Layout() {
  const navigate = useNavigate()
  const user = useAppSelector((state) => state.auth.user)
  const [logout] = useLogoutMutation()

  async function handleSignOut() {
    await logout().unwrap().catch(() => undefined)
    navigate('/login')
  }

  return (
    <div className='flex h-dvh'>
      <aside className='flex w-60 shrink-0 flex-col border-r border-border'>
        <div className='flex items-center gap-2 px-4 py-4 font-semibold'>
          <span className='flex h-7 w-7 items-center justify-center rounded-lg bg-brand/10 text-brand'>
            <Plane className='h-4 w-4' />
          </span>
          AeroLens Admin
        </div>

        <nav className='flex flex-1 flex-col gap-0.5 px-2'>
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition hover:bg-surface-2',
                  isActive && 'bg-surface-2 font-medium text-brand',
                )
              }
            >
              <item.icon className='h-4 w-4' /> {item.label}
            </NavLink>
          ))}
        </nav>

        <div className='flex items-center justify-between gap-2 border-t border-border px-3 py-3'>
          <div className='min-w-0'>
            <p className='truncate text-sm font-medium'>{user?.displayName}</p>
            <button
              type='button'
              onClick={handleSignOut}
              className='flex items-center gap-1 text-xs text-muted transition hover:text-rose-500'
            >
              <LogOut className='h-3 w-3' /> Sign out
            </button>
          </div>
          <ThemeToggle />
        </div>
      </aside>

      <main className='flex-1 overflow-y-auto'>
        <Outlet />
      </main>
    </div>
  )
}
