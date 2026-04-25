import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { DashboardLayout } from './layouts/DashboardLayout';
import { LoginPage } from './modules/auth/presentation/pages/LoginPage';
import { AuthGuard } from './modules/auth/presentation/AuthGuard';
import { UserList } from './modules/users/presentation/pages/UserList';
import { UserCreate } from './modules/users/presentation/pages/UserCreate';
import { UserEdit } from './modules/users/presentation/pages/UserEdit';

function App() {
    return (
        <BrowserRouter>
            <Routes>
                <Route path="/login" element={<LoginPage />} />

                <Route path="/" element={
                    <AuthGuard>
                        <DashboardLayout />
                    </AuthGuard>
                }>
                    <Route index element={<div className="p-4"><h1>Welcome to Dashboard</h1></div>} />
                    <Route path="users">
                        <Route index element={<UserList />} />
                        <Route path="create" element={<UserCreate />} />
                        <Route path="edit/:id" element={<UserEdit />} />
                    </Route>
                </Route>

                <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
        </BrowserRouter>
    );
}

export default App;