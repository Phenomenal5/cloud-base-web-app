import { RouterProvider } from 'react-router-dom'
import { AuthProvider } from '@/components/AuthProvider'
import { AppToaster } from '@/components/AppToaster'
import { router } from '@/routes/router'

export default function App() {
  return (
    <AuthProvider>
      <RouterProvider router={router} />
      <AppToaster />
    </AuthProvider>
  )
}
