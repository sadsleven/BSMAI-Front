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
import { PatientDetailPage } from './modules/patients/presentation/pages/PatientDetailPage';
import { DoctorList } from './modules/doctors/presentation/pages/DoctorList';
import { DoctorCreate } from './modules/doctors/presentation/pages/DoctorCreate';
import { DoctorEdit } from './modules/doctors/presentation/pages/DoctorEdit';
import { DoctorDetailPage } from './modules/doctors/presentation/pages/DoctorDetailPage';
import { CareCenterList } from './modules/care-centers/presentation/pages/CareCenterList';
import { CareCenterCreate } from './modules/care-centers/presentation/pages/CareCenterCreate';
import { CareCenterEdit } from './modules/care-centers/presentation/pages/CareCenterEdit';
import { CareCenterDetailPage } from './modules/care-centers/presentation/pages/CareCenterDetailPage';
import { InsuranceList } from './modules/insurances/presentation/pages/InsuranceList';
import { InsuranceCreate } from './modules/insurances/presentation/pages/InsuranceCreate';
import { InsuranceEdit } from './modules/insurances/presentation/pages/InsuranceEdit';
import { InsuranceDetailPage } from './modules/insurances/presentation/pages/InsuranceDetailPage';
import { PathologyList } from './modules/pathologies/presentation/pages/PathologyList';
import { PathologyCreate } from './modules/pathologies/presentation/pages/PathologyCreate';
import { PathologyEdit } from './modules/pathologies/presentation/pages/PathologyEdit';
import { ServiceTypeList } from './modules/service-types/presentation/pages/ServiceTypeList';
import { ServiceTypeCreate } from './modules/service-types/presentation/pages/ServiceTypeCreate';
import { ServiceTypeEdit } from './modules/service-types/presentation/pages/ServiceTypeEdit';
import { ContractorList } from './modules/contractors/presentation/pages/ContractorList';
import { ContractorCreate } from './modules/contractors/presentation/pages/ContractorCreate';
import { ContractorEdit } from './modules/contractors/presentation/pages/ContractorEdit';
import { ExchangeRateList } from './modules/exchange-rates/presentation/pages/ExchangeRateList';
import { ExchangeRateCreate } from './modules/exchange-rates/presentation/pages/ExchangeRateCreate';
import { ExchangeRateEdit } from './modules/exchange-rates/presentation/pages/ExchangeRateEdit';
import { TaxUnitList } from './modules/tax-units/presentation/pages/TaxUnitList';
import { TaxUnitCreate } from './modules/tax-units/presentation/pages/TaxUnitCreate';
import { TaxUnitEdit } from './modules/tax-units/presentation/pages/TaxUnitEdit';
import { BranchList } from './modules/branches/presentation/pages/BranchList';
import { BranchCreate } from './modules/branches/presentation/pages/BranchCreate';
import { BranchEdit } from './modules/branches/presentation/pages/BranchEdit';
import { PaymentAccountList } from './modules/payment-accounts/presentation/pages/PaymentAccountList';
import { PaymentAccountCreate } from './modules/payment-accounts/presentation/pages/PaymentAccountCreate';
import { PaymentAccountEdit } from './modules/payment-accounts/presentation/pages/PaymentAccountEdit';
import { OrderList } from './modules/orders/presentation/pages/OrderList';
import { OrderCreate } from './modules/orders/presentation/pages/OrderCreate';
import { OrderDraftsPage } from './modules/orders/presentation/pages/OrderDraftsPage';
import { OrderEdit } from './modules/orders/presentation/pages/OrderEdit';
import { OrderDetailPage } from './modules/orders/presentation/pages/OrderDetailPage';
import { AccountsPayableList } from './modules/accounts-payable/presentation/pages/AccountsPayableList';
import { AccountsPayableBatchPage } from './modules/accounts-payable/presentation/pages/AccountsPayableBatchPage';
import { AccountsReceivableList } from './modules/accounts-receivable/presentation/pages/AccountsReceivableList';
import { AccountsReceivableBatchPage } from './modules/accounts-receivable/presentation/pages/AccountsReceivableBatchPage';
import { TaxesPayableList } from './modules/taxes-payable/presentation/pages/TaxesPayableList';
import { TaxesPayableBatchPage } from './modules/taxes-payable/presentation/pages/TaxesPayableBatchPage';
import { ReportReceivablesList } from './modules/reports/presentation/pages/ReportReceivablesList';
import { ReportPayablesList } from './modules/reports/presentation/pages/ReportPayablesList';
import { ReportFinancialSummary } from './modules/reports/presentation/pages/ReportFinancialSummary';
import { ReportDoctorProduction } from './modules/reports/presentation/pages/ReportDoctorProduction';
import { ReportInsuranceProduction } from './modules/reports/presentation/pages/ReportInsuranceProduction';
import { ReportAging } from './modules/reports/presentation/pages/ReportAging';
import { ReportCollections } from './modules/reports/presentation/pages/ReportCollections';
import { ReportDisbursements } from './modules/reports/presentation/pages/ReportDisbursements';
import { ReportOrdersPipeline } from './modules/reports/presentation/pages/ReportOrdersPipeline';
import { ReportServicesBilled } from './modules/reports/presentation/pages/ReportServicesBilled';
import { ReportTaxesRetained } from './modules/reports/presentation/pages/ReportTaxesRetained';
import { ReportExecutivePanel } from './modules/reports/presentation/pages/ReportExecutivePanel';
import { ReportOrdersAnalytics } from './modules/reports/presentation/pages/ReportOrdersAnalytics';
import { ReportInsurerCollections } from './modules/reports/presentation/pages/ReportInsurerCollections';
import { ReportPaymentAccountInflows } from './modules/reports/presentation/pages/ReportPaymentAccountInflows';
import { AppConfigPage } from './modules/app-config/presentation/pages/AppConfigPage';
import { GuidePage } from './modules/guide/presentation/pages/GuidePage';
import { RequirePermission } from './modules/auth/presentation/components/RequirePermission';
import { PERMISSIONS } from './modules/auth/domain/models/permissions';

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
          <Route path="guide" element={<GuidePage />} />
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
            <Route path=":id" element={<PatientDetailPage />} />
          </Route>
          <Route path="doctors">
            <Route index element={<DoctorList />} />
            <Route path="create" element={<DoctorCreate />} />
            <Route path="edit/:id" element={<DoctorEdit />} />
            <Route path=":id" element={<DoctorDetailPage />} />
          </Route>
          <Route path="care-centers">
            <Route index element={<CareCenterList />} />
            <Route path="create" element={<CareCenterCreate />} />
            <Route path="edit/:id" element={<CareCenterEdit />} />
            <Route path=":id" element={<CareCenterDetailPage />} />
          </Route>
          <Route path="insurances">
            <Route index element={<InsuranceList />} />
            <Route path="create" element={<InsuranceCreate />} />
            <Route path="edit/:id" element={<InsuranceEdit />} />
            <Route path=":id" element={<InsuranceDetailPage />} />
          </Route>
          <Route path="pathologies">
            <Route index element={<PathologyList />} />
            <Route path="create" element={<PathologyCreate />} />
            <Route path="edit/:id" element={<PathologyEdit />} />
          </Route>
          <Route path="service-types">
            <Route index element={<ServiceTypeList />} />
            <Route path="create" element={<ServiceTypeCreate />} />
            <Route path="edit/:id" element={<ServiceTypeEdit />} />
          </Route>
          <Route path="contractors">
            <Route index element={<ContractorList />} />
            <Route path="create" element={<ContractorCreate />} />
            <Route path="edit/:id" element={<ContractorEdit />} />
          </Route>
          <Route path="exchange-rates">
            <Route index element={<ExchangeRateList />} />
            <Route path="create" element={<ExchangeRateCreate />} />
            <Route path="edit/:id" element={<ExchangeRateEdit />} />
          </Route>
          <Route path="tax-units">
            <Route index element={<TaxUnitList />} />
            <Route path="create" element={<TaxUnitCreate />} />
            <Route path="edit/:id" element={<TaxUnitEdit />} />
          </Route>
          <Route path="branches">
            <Route index element={<BranchList />} />
            <Route path="create" element={<BranchCreate />} />
            <Route path="edit/:id" element={<BranchEdit />} />
          </Route>
          <Route path="payment-accounts">
            <Route index element={<PaymentAccountList />} />
            <Route path="create" element={<PaymentAccountCreate />} />
            <Route path="edit/:id" element={<PaymentAccountEdit />} />
          </Route>
          <Route path="orders">
            <Route index element={<OrderList />} />
            <Route path="create" element={<OrderCreate />} />
            <Route path="drafts" element={<OrderDraftsPage />} />
            <Route path="edit/:id" element={<OrderEdit />} />
            <Route path=":id" element={<OrderDetailPage />} />
          </Route>
          <Route path="accounts-payable">
            <Route index element={<AccountsPayableList />} />
            <Route path="new" element={<AccountsPayableBatchPage />} />
            <Route path=":id" element={<AccountsPayableBatchPage />} />
          </Route>
          <Route path="accounts-receivable">
            <Route index element={<AccountsReceivableList />} />
            <Route path="new" element={<AccountsReceivableBatchPage />} />
            <Route path=":id" element={<AccountsReceivableBatchPage />} />
          </Route>
          <Route path="taxes-payable">
            <Route index element={<TaxesPayableList />} />
            <Route path="new" element={<TaxesPayableBatchPage />} />
            <Route path=":id" element={<TaxesPayableBatchPage />} />
          </Route>
          <Route
            path="config"
            element={
              <RequirePermission permission={PERMISSIONS.APP_CONFIG.VIEW}>
                <AppConfigPage />
              </RequirePermission>
            }
          />
          <Route path="reports">
            <Route
              path="executive-panel"
              element={
                <RequirePermission permission={PERMISSIONS.REPORTS.EXECUTIVE_PANEL_LIST}>
                  <ReportExecutivePanel />
                </RequirePermission>
              }
            />
            <Route
              path="orders-analytics"
              element={
                <RequirePermission permission={PERMISSIONS.REPORTS.ORDERS_ANALYTICS_LIST}>
                  <ReportOrdersAnalytics />
                </RequirePermission>
              }
            />
            <Route
              path="insurer-collections"
              element={
                <RequirePermission permission={PERMISSIONS.REPORTS.INSURER_COLLECTIONS_LIST}>
                  <ReportInsurerCollections />
                </RequirePermission>
              }
            />
            <Route
              path="receivables"
              element={
                <RequirePermission permission={PERMISSIONS.REPORTS.RECEIVABLES_LIST}>
                  <ReportReceivablesList />
                </RequirePermission>
              }
            />
            <Route
              path="payables"
              element={
                <RequirePermission permission={PERMISSIONS.REPORTS.PAYABLES_LIST}>
                  <ReportPayablesList />
                </RequirePermission>
              }
            />
            <Route
              path="taxes-retained"
              element={
                <RequirePermission permission={PERMISSIONS.REPORTS.TAXES_RETAINED_LIST}>
                  <ReportTaxesRetained />
                </RequirePermission>
              }
            />
            <Route
              path="financial-summary"
              element={
                <RequirePermission permission={PERMISSIONS.REPORTS.FINANCIAL_SUMMARY_LIST}>
                  <ReportFinancialSummary />
                </RequirePermission>
              }
            />
            <Route
              path="doctor-production"
              element={
                <RequirePermission permission={PERMISSIONS.REPORTS.DOCTOR_PRODUCTION_LIST}>
                  <ReportDoctorProduction />
                </RequirePermission>
              }
            />
            <Route
              path="insurance-production"
              element={
                <RequirePermission permission={PERMISSIONS.REPORTS.INSURANCE_PRODUCTION_LIST}>
                  <ReportInsuranceProduction />
                </RequirePermission>
              }
            />
            <Route
              path="aging"
              element={
                <RequirePermission permission={PERMISSIONS.REPORTS.AGING_LIST}>
                  <ReportAging />
                </RequirePermission>
              }
            />
            <Route
              path="collections"
              element={
                <RequirePermission permission={PERMISSIONS.REPORTS.COLLECTIONS_LIST}>
                  <ReportCollections />
                </RequirePermission>
              }
            />
            <Route
              path="payment-account-inflows"
              element={
                <RequirePermission permission={PERMISSIONS.REPORTS.PAYMENT_ACCOUNT_INFLOWS_LIST}>
                  <ReportPaymentAccountInflows />
                </RequirePermission>
              }
            />
            <Route
              path="disbursements"
              element={
                <RequirePermission permission={PERMISSIONS.REPORTS.DISBURSEMENTS_LIST}>
                  <ReportDisbursements />
                </RequirePermission>
              }
            />
            <Route
              path="orders-pipeline"
              element={
                <RequirePermission permission={PERMISSIONS.REPORTS.ORDERS_TRACKING_LIST}>
                  <ReportOrdersPipeline />
                </RequirePermission>
              }
            />
            <Route
              path="services-billed"
              element={
                <RequirePermission permission={PERMISSIONS.REPORTS.SERVICES_BILLED_LIST}>
                  <ReportServicesBilled />
                </RequirePermission>
              }
            />
          </Route>
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
