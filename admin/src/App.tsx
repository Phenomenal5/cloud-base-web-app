import { RouterProvider } from 'react-router-dom'
import { AuthProvider } from '@/components/AuthProvider'
import { AppToaster } from '@/components/AppToaster'
import { router } from '@/routes/router'

const App = () => (
  // AuthProvider wraps the router, so ProtectedRoute reads a settled session
  <AuthProvider>
    <RouterProvider router={router} />
    <AppToaster />
  </AuthProvider>
)

export default App
