import { useState } from 'react';
import { Link } from 'react-router-dom';
import { IndianRupee } from 'lucide-react';
import { useAuth } from '../AuthContext';
import { ErrorBox, PasswordInput, Spinner } from '../components/UI';

export default function Login() {
  const { login, register, registerEmployee } = useAuth();
  const [mode, setMode] = useState('login');
  const [f, setF] = useState({ name: '', companyName: '', email: '', password: '', adminSetupKey: '', joinCode: '' });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  async function submit(e) {
    e.preventDefault(); setErr(''); setBusy(true);
    try {
      if (mode === 'login') await login(f.email, f.password);
      else if (mode === 'register') await register(f);
      else await registerEmployee(f);
    }
    catch (ex) { setErr(ex.message); } finally { setBusy(false); }
  }

  const switchMode = (nextMode) => { setMode(nextMode); setErr(''); };

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
          <h1 className="text-2xl font-semibold text-slate-900">{mode === 'login' ? 'Sign in' : mode === 'register' ? 'Set up administrator' : 'Create employee account'}</h1>
          <p className="mb-6 mt-1 text-sm text-slate-500">
            {mode === 'login' ? 'Welcome back. Enter your details to continue.' : mode === 'register' ? 'One-time setup. You need the administrator key from the server owner.' : 'Create an account to join your company. Ask the administrator for the company join code.'}
          </p>
          <ErrorBox>{err}</ErrorBox>
          <div className="space-y-4">
            {mode !== 'login' && (<>
              <div><label className="label" htmlFor="n">Your name</label><input id="n" className="input" required value={f.name} onChange={set('name')} autoComplete="name" /></div>
              {mode === 'register' && <>
                <div><label className="label" htmlFor="c">Company name</label><input id="c" className="input" value={f.companyName} onChange={set('companyName')} placeholder="e.g. Sharma Constructions" /></div>
                <div><label className="label" htmlFor="setup-key">Administrator setup key</label><PasswordInput id="setup-key" label="setup key" required autoComplete="off" value={f.adminSetupKey} onChange={set('adminSetupKey')} /></div>
              </>}
              {mode === 'employee' && <div><label className="label" htmlFor="join-code">Company join code</label><PasswordInput id="join-code" label="join code" required autoComplete="off" value={f.joinCode} onChange={set('joinCode')} /></div>}
            </>)}
            <div><label className="label" htmlFor="e">Email</label><input id="e" type="email" className="input" required value={f.email} onChange={set('email')} autoComplete="email" /></div>
            <div><label className="label" htmlFor="p">Password</label><PasswordInput id="p" required minLength={mode === 'login' ? undefined : 8} value={f.password} onChange={set('password')} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} />
              {mode !== 'login' && <p className="mt-1 text-xs text-slate-500">{mode === 'employee' ? 'At least 8 characters. If this email already has an account, use its current password.' : 'At least 8 characters.'}</p>}</div>
            {mode === 'login' && <p className="-mt-2 text-right text-sm"><Link to="/forgot-password" className="font-semibold text-blue-700 hover:underline">Forgot password?</Link></p>}
          </div>
          <button className="btn-primary mt-6 w-full" disabled={busy}>{busy && <Spinner />}{mode === 'login' ? 'Sign in' : mode === 'register' ? 'Set up administrator' : 'Join company'}</button>
          <p className="mt-5 text-center text-sm text-slate-500">
            {mode === 'login' ? <>
              First-time setup?{' '}
              <button type="button" className="font-semibold text-blue-700 hover:underline" onClick={() => switchMode('register')}>Set up administrator</button>
              <br />
              <button type="button" className="mt-2 font-semibold text-blue-700 hover:underline" onClick={() => switchMode('employee')}>Create employee account</button>
            </> : <>
              Already have an account?{' '}
              <button type="button" className="font-semibold text-blue-700 hover:underline" onClick={() => switchMode('login')}>Sign in</button>
            </>}
          </p>
        </form>
      </div>
    </div>
  );
}
