import { useState } from 'react';
import { IndianRupee } from 'lucide-react';
import { useAuth } from '../AuthContext';
import { ErrorBox, Spinner } from '../components/UI';

export default function Login() {
  const { login, register } = useAuth();
  const [mode, setMode] = useState('login');
  const [f, setF] = useState({ name: '', companyName: '', email: '', password: '', adminSetupKey: '' });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  async function submit(e) {
    e.preventDefault(); setErr(''); setBusy(true);
    try { mode === 'login' ? await login(f.email, f.password) : await register(f); }
    catch (ex) { setErr(ex.message); } finally { setBusy(false); }
  }

  return (
    <div className="grid min-h-screen md:grid-cols-2">
      <div className="hidden flex-col justify-between bg-ink-900 p-12 text-white md:flex">
        <div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-lg bg-blue-600"><IndianRupee size={21} /></span><span className="text-lg font-semibold">Daily Expense Manager</span></div>
        <div>
          <p className="max-w-md text-3xl font-semibold leading-snug">Know exactly what the company gave you, what you spent, and what you are owed.</p>
          <p className="mt-4 max-w-md text-slate-300">Every rupee is tracked by where it came from: company money or your own pocket.</p>
        </div>
        <p className="text-sm text-slate-400">Balances and reimbursements calculate automatically.</p>
      </div>
      <div className="flex items-center justify-center p-6">
        <form onSubmit={submit} className="w-full max-w-sm">
          <h1 className="text-2xl font-semibold text-slate-900">{mode === 'login' ? 'Sign in' : 'Set up administrator'}</h1>
          <p className="mb-6 mt-1 text-sm text-slate-500">{mode === 'login' ? 'Welcome back. Enter your details to continue.' : 'One-time setup. You need the administrator key from the server owner.'}</p>
          <ErrorBox>{err}</ErrorBox>
          <div className="space-y-4">
            {mode === 'register' && (<>
              <div><label className="label" htmlFor="n">Your name</label><input id="n" className="input" required value={f.name} onChange={set('name')} autoComplete="name" /></div>
              <div><label className="label" htmlFor="c">Company name</label><input id="c" className="input" value={f.companyName} onChange={set('companyName')} placeholder="e.g. Sharma Constructions" /></div>
              <div><label className="label" htmlFor="setup-key">Administrator setup key</label><input id="setup-key" type="password" className="input" required autoComplete="off" value={f.adminSetupKey} onChange={set('adminSetupKey')} /></div>
            </>)}
            <div><label className="label" htmlFor="e">Email</label><input id="e" type="email" className="input" required value={f.email} onChange={set('email')} autoComplete="email" /></div>
            <div><label className="label" htmlFor="p">Password</label><input id="p" type="password" className="input" required minLength={mode === 'register' ? 8 : undefined} value={f.password} onChange={set('password')} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} />
              {mode === 'register' && <p className="mt-1 text-xs text-slate-500">At least 8 characters.</p>}</div>
          </div>
          <button className="btn-primary mt-6 w-full" disabled={busy}>{busy && <Spinner />}{mode === 'login' ? 'Sign in' : 'Set up administrator'}</button>
          <p className="mt-5 text-center text-sm text-slate-500">
            {mode === 'login' ? 'First-time setup?' : 'Already have an account?'}{' '}
            <button type="button" className="font-semibold text-blue-700 hover:underline" onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setErr(''); }}>{mode === 'login' ? 'Set up administrator' : 'Sign in'}</button>
          </p>
        </form>
      </div>
    </div>
  );
}
