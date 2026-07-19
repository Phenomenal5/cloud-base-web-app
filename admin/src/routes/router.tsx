import { createBrowserRouter, Navigate } from 'react-router-dom'
import { ProtectedRoute } from '@/components/ProtectedRoute'
import { Layout } from '@/components/Layout'
import { LoginPage } from '@/pages/LoginPage'
import { DashboardPage } from '@/pages/DashboardPage'
import { UsersPage } from '@/pages/UsersPage'
import { IngestionPage } from '@/pages/IngestionPage'
import { BroadcastsPage } from '@/pages/BroadcastsPage'

export const router = createBrowserRouter([
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
  { path: '*', element: <Navigate to='/' replace /> },
])
