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
import { DashboardPage } from './modules/dashboard/presentation/pages/DashboardPage';
import { SpecialtyList } from './modules/specialties/presentation/pages/SpecialtyList';
import { SpecialtyCreate } from './modules/specialties/presentation/pages/SpecialtyCreate';
import { SpecialtyEdit } from './modules/specialties/presentation/pages/SpecialtyEdit';
import { PatientList } from './modules/patients/presentation/pages/PatientList';
import { PatientCreate } from './modules/patients/presentation/pages/PatientCreate';
import { PatientEdit } from './modules/patients/presentation/pages/PatientEdit';
import { DoctorList } from './modules/doctors/presentation/pages/DoctorList';
import { DoctorCreate } from './modules/doctors/presentation/pages/DoctorCreate';
import { DoctorEdit } from './modules/doctors/presentation/pages/DoctorEdit';
import { CareCenterList } from './modules/care-centers/presentation/pages/CareCenterList';
import { CareCenterCreate } from './modules/care-centers/presentation/pages/CareCenterCreate';
import { CareCenterEdit } from './modules/care-centers/presentation/pages/CareCenterEdit';

function App() {
  return (
    <BrowserRouter>
      <Toaster
        closeButton
        position="top-right"
        offset={20}
        toastOptions={{
          className: 'afmi-toast',
        }}
      />
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
          <Route index element={<DashboardPage />} />
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
          <Route path="specialties">
            <Route index element={<SpecialtyList />} />
            <Route path="create" element={<SpecialtyCreate />} />
            <Route path="edit/:id" element={<SpecialtyEdit />} />
          </Route>
          <Route path="patients">
            <Route index element={<PatientList />} />
            <Route path="create" element={<PatientCreate />} />
            <Route path="edit/:id" element={<PatientEdit />} />
          </Route>
          <Route path="doctors">
            <Route index element={<DoctorList />} />
            <Route path="create" element={<DoctorCreate />} />
            <Route path="edit/:id" element={<DoctorEdit />} />
          </Route>
          <Route path="care-centers">
            <Route index element={<CareCenterList />} />
            <Route path="create" element={<CareCenterCreate />} />
            <Route path="edit/:id" element={<CareCenterEdit />} />
          </Route>
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
