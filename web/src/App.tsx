import { Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { RequireAuth } from './components/RequireAuth';
import { DashboardPage } from './pages/DashboardPage';
import { InvoiceDetailPage } from './pages/InvoiceDetailPage';
import { InvoicesPage } from './pages/InvoicesPage';
import { LoginPage } from './pages/LoginPage';
import {
  PaymentCancelPage,
  PaymentSandboxPage,
  PaymentSuccessPage,
} from './pages/PaymentPages';
import { RegisterPage } from './pages/RegisterPage';
import { UploadPage } from './pages/UploadPage';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/payments/success" element={<PaymentSuccessPage />} />
      <Route path="/payments/cancel" element={<PaymentCancelPage />} />
      <Route element={<RequireAuth />}>
        <Route element={<Layout />}>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/invoices" element={<InvoicesPage />} />
          <Route path="/upload" element={<UploadPage />} />
          <Route path="/invoices/:id" element={<InvoiceDetailPage />} />
          <Route path="/payments/sandbox" element={<PaymentSandboxPage />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
