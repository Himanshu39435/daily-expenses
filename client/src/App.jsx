import { Navigate, Route, Routes, useParams } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useAuth } from './AuthContext';
import { api } from './api';
import Layout from './components/Layout';
import { Loading, ErrorBox } from './components/UI';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import TxnForm from './pages/TxnForm';
import Transactions from './pages/Transactions';
import Reports from './pages/Reports';
import ExcelDownload from './pages/ExcelDownload';
import SettingsPage from './pages/Settings';
import AdminDashboard from './pages/AdminDashboard';
import Employees from './pages/Employees';
import InviteAccept from './pages/InviteAccept';

function Protected() {
  const { user, ready } = useAuth();
  if (!ready) return <Loading />;
  return user ? <Layout /> : <Navigate to="/login" replace />;
}

function AdminOnly({ children }) {
  const { user } = useAuth();
  return user?.role === 'admin' ? children : <Navigate to="/" replace />;
}

function EditTxn() {
  const { id } = useParams();
  const [t, setT] = useState(null);
  const [err, setErr] = useState('');
  useEffect(() => { api.get(`/transactions/${id}`).then(setT).catch((e) => setErr(e.message)); }, [id]);
  if (err) return <ErrorBox>{err}</ErrorBox>;
  if (!t) return <Loading />;
  return <TxnForm key={id} kind={t.type === 'expense' ? 'expense' : 'money'} initial={t} />;
}

export default function App() {
  const { user, ready } = useAuth();
  return (
    <Routes>
      <Route path="/login" element={ready && user ? <Navigate to="/" replace /> : <Login />} />
      <Route path="/invite/:token" element={<InviteAccept />} />
      <Route element={<Protected />}>
        <Route path="/" element={user?.role === 'admin' ? <AdminDashboard /> : <Dashboard />} />
        <Route path="/employees" element={<AdminOnly><Employees /></AdminOnly>} />
        <Route path="/add-money" element={<TxnForm key="money" kind="money" />} />
        <Route path="/add-expense" element={<TxnForm key="expense" kind="expense" />} />
        <Route path="/edit/:id" element={<EditTxn />} />
        <Route path="/transactions" element={<Transactions />} />
        <Route path="/reports/daily" element={<Reports mode="daily" />} />
        <Route path="/reports/monthly" element={<Reports mode="monthly" />} />
        <Route path="/reports/category" element={<Reports mode="category" />} />
        <Route path="/excel" element={<ExcelDownload />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
