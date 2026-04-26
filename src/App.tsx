import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'sonner';
import { DashboardLayout } from './layouts/DashboardLayout';
import { LoginPage } from './modules/auth/presentation/pages/LoginPage';
import { LogoutPage } from './modules/auth/presentation/pages/LogoutPage';
import { ProfilePage } from './modules/auth/presentation/pages/ProfilePage';
import { AuthGuard } from './modules/auth/presentation/AuthGuard';
import { UserList } from './modules/users/presentation/pages/UserList';
import { UserCreate } from './modules/users/presentation/pages/UserCreate';
import { UserEdit } from './modules/users/presentation/pages/UserEdit';
import { UserChangePassword } from './modules/users/presentation/pages/UserChangePassword';
import { RoleList } from './modules/roles/presentation/pages/RoleList';
import { RoleCreate } from './modules/roles/presentation/pages/RoleCreate';
import { RoleEdit } from './modules/roles/presentation/pages/RoleEdit';

function App() {
  return (
    <BrowserRouter>
      <Toaster richColors closeButton position="top-right" />
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/logout" element={<LogoutPage />} />

        <Route
          path="/"
          element={
            <AuthGuard>
              <DashboardLayout />
            </AuthGuard>
          }
        >
          <Route
            index
            element={
              <div className="p-4">
                <h1>Bienvenido al panel</h1>
              </div>
            }
          />
          <Route path="profile" element={<ProfilePage />} />
          <Route path="users">
            <Route index element={<UserList />} />
            <Route path="create" element={<UserCreate />} />
            <Route path="edit/:id" element={<UserEdit />} />
            <Route path=":id/change-password" element={<UserChangePassword />} />
          </Route>
          <Route path="roles">
            <Route index element={<RoleList />} />
            <Route path="create" element={<RoleCreate />} />
            <Route path="edit/:id" element={<RoleEdit />} />
          </Route>
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
