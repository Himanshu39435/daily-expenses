import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { ErrorBox, Spinner } from '../components/UI';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [err, setErr] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault(); setErr(''); setBusy(true);
    try {
      await api.post('/auth/forgot-password', { email });
      setSent(true);
    } catch (error) { setErr(error.message); } finally { setBusy(false); }
  }

  return (
    <div className="grid min-h-screen place-items-center bg-slate-50 p-5">
      <form onSubmit={submit} className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-sm sm:p-8">
        <h1 className="text-2xl font-semibold text-slate-900">Forgot password?</h1>
        {sent ? (
          <>
            <p className="mt-3 text-sm text-slate-600">If an account exists for that email, a password reset link has been sent. Check your inbox.</p>
            <Link to="/login" className="btn-primary mt-6 w-full">Back to sign in</Link>
          </>
        ) : (
          <>
            <p className="mb-6 mt-1 text-sm text-slate-500">Enter your account email and we'll send you a reset link.</p>
            <ErrorBox>{err}</ErrorBox>
            <label className="label" htmlFor="reset-email">Email</label>
            <input id="reset-email" type="email" className="input" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            <button className="btn-primary mt-6 w-full" disabled={busy}>{busy && <Spinner />}Send reset link</button>
            <p className="mt-5 text-center text-sm text-slate-500"><Link to="/login" className="font-semibold text-blue-700 hover:underline">Back to sign in</Link></p>
          </>
        )}
      </form>
    </div>
  );
}
