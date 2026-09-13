import { createBrowserRouter, Navigate } from 'react-router-dom'
import { ProtectedRoute } from '@/components/ProtectedRoute'
import { Layout } from '@/components/Layout'
import { LoginPage } from '@/pages/LoginPage'
import { DashboardPage } from '@/pages/DashboardPage'
import { UsersPage } from '@/pages/UsersPage'
import { IngestionPage } from '@/pages/IngestionPage'
import { BroadcastsPage } from '@/pages/BroadcastsPage'

export const router = createBrowserRouter([
  // outside the protected branch, or signing in would be impossible
  { path: '/login', element: <LoginPage /> },
  {
    path: '/',
    element: (
      <ProtectedRoute>
        <Layout />
      </ProtectedRoute>
    ),
    children: [
      { index: true, element: <DashboardPage /> },
      { path: 'users', element: <UsersPage /> },
      { path: 'ingestion', element: <IngestionPage /> },
      { path: 'broadcasts', element: <BroadcastsPage /> },
    ],
  },
  // anything unknown falls through to the dashboard, which sends them to /login
  // if they aren't signed in
  { path: '*', element: <Navigate to='/' replace /> },
])
