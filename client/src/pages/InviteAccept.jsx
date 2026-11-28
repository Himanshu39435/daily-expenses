import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { IndianRupee } from 'lucide-react';
import { useAuth } from '../AuthContext';
import { ErrorBox, PasswordInput, Spinner } from '../components/UI';

export default function InviteAccept() {
  const { token } = useParams();
  const { acceptInvite } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', password: '' });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault(); setErr(''); setBusy(true);
    try { await acceptInvite({ token, ...form }); navigate('/', { replace: true }); }
    catch (e) { setErr(e.message); } finally { setBusy(false); }
  }

  return (
    <div className="grid min-h-screen place-items-center bg-slate-50 p-5">
      <form onSubmit={submit} className="w-full max-w-md rounded-2xl bg-white p-6 shadow-sm sm:p-8">
        <div className="mb-5 flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-lg bg-blue-600 text-white"><IndianRupee size={21} /></span><span className="font-semibold text-slate-900">Join your company</span></div>
        <h1 className="text-2xl font-semibold text-slate-900">Accept invitation</h1>
        <p className="mb-6 mt-1 text-sm text-slate-500">Use your current password if you already have an account; otherwise, create a password to join.</p>
        <p className="mb-5 rounded-lg bg-amber-50 p-3 text-xs text-amber-800">If you join with an existing account, your transaction history will be visible to this company's administrators.</p>
        <ErrorBox>{err}</ErrorBox>
        <div className="space-y-4">
          <div><label className="label" htmlFor="invite-name">Your name</label><input id="invite-name" className="input" required autoComplete="name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
          <div><label className="label" htmlFor="invite-password">Password</label><PasswordInput id="invite-password" required minLength={8} autoComplete="current-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /><p className="mt-1 text-xs text-slate-500">At least 8 characters.</p></div>
        </div>
        <button className="btn-primary mt-6 w-full" disabled={busy}>{busy && <Spinner />}Join company</button>
        <p className="mt-5 text-center text-sm text-slate-500">Already have an account? <Link to="/login" className="font-semibold text-blue-700 hover:underline">Sign in</Link></p>
      </form>
    </div>
  );
}
