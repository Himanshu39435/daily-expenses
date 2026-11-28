import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../AuthContext';
import { ErrorBox, PasswordInput, Spinner } from '../components/UI';

export default function ResetPassword() {
  const { token } = useParams();
  const { logout } = useAuth();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [err, setErr] = useState('');
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault(); setErr('');
    if (password !== confirmPassword) { setErr('Passwords do not match'); return; }
    setBusy(true);
    try {
      await api.post('/auth/reset-password', { token, password });
      logout();
      setDone(true);
    } catch (error) { setErr(error.message); } finally { setBusy(false); }
  }

  return (
    <div className="grid min-h-screen place-items-center bg-slate-50 p-5">
      <form onSubmit={submit} className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-sm sm:p-8">
        <h1 className="text-2xl font-semibold text-slate-900">Reset password</h1>
        {done ? (
          <>
            <p className="mt-3 text-sm text-slate-600">Your password has been reset. You can now sign in.</p>
            <Link to="/login" className="btn-primary mt-6 w-full">Sign in</Link>
          </>
        ) : (
          <>
            <p className="mb-6 mt-1 text-sm text-slate-500">Choose a new password with at least 8 characters.</p>
            <ErrorBox>{err}</ErrorBox>
            <div className="space-y-4">
              <div><label className="label" htmlFor="new-password">New password</label><PasswordInput id="new-password" required minLength={8} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} /></div>
              <div><label className="label" htmlFor="confirm-password">Confirm new password</label><PasswordInput id="confirm-password" label="confirm password" required minLength={8} autoComplete="new-password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} /></div>
            </div>
            <button className="btn-primary mt-6 w-full" disabled={busy}>{busy && <Spinner />}Set new password</button>
            <p className="mt-5 text-center text-sm text-slate-500"><Link to="/login" className="font-semibold text-blue-700 hover:underline">Back to sign in</Link></p>
          </>
        )}
      </form>
    </div>
  );
}
