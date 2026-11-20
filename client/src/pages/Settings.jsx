import { useRef, useState } from 'react';
import { Download, Upload } from 'lucide-react';
import { api, downloadFile } from '../api';
import { useAuth } from '../AuthContext';
import { PageHeader, ErrorBox, Spinner, Confirm, useToast } from '../components/UI';

export default function Settings() {
  const { user, setUser, logout } = useAuth();
  const toast = useToast();
  const [p, setP] = useState({ name: user.name, companyName: user.companyName, openingBalance: String(user.openingBalance), openingDate: user.openingDate });
  const [pw, setPw] = useState({ currentPassword: '', newPassword: '' });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState('');
  const [pending, setPending] = useState(null);
  const fileRef = useRef();

  async function saveProfile(e) {
    e.preventDefault(); setErr(''); setBusy('profile');
    try { const d = await api.put('/auth/settings', user.role === 'admin' ? p : { name: p.name }); setUser(d.user); toast('Settings saved - all balances recalculated'); } catch (x) { setErr(x.message); } finally { setBusy(''); }
  }
  async function savePw(e) {
    e.preventDefault(); setErr(''); setBusy('pw');
    try { await api.put('/auth/password', pw); setPw({ currentPassword: '', newPassword: '' }); toast('Password changed'); } catch (x) { setErr(x.message); } finally { setBusy(''); }
  }
  async function backup() {
    setBusy('backup');
    try { await downloadFile('/backup', 'expense-backup.json'); toast('Backup downloaded'); } catch (x) { toast(x.message, 'err'); } finally { setBusy(''); }
  }
  function pick(e) {
    const f = e.target.files[0]; e.target.value = '';
    if (!f) return;
    const r = new FileReader();
    r.onload = () => { try { setPending(JSON.parse(r.result)); } catch { toast('That file is not a valid backup', 'err'); } };
    r.readAsText(f);
  }
  async function restore() {
    setBusy('restore');
    try { const d = await api.post('/backup/restore', { data: pending }); toast(`Restored ${d.restored} transactions`); setPending(null); const me = await api.get('/auth/me'); setUser(me.user); setP({ ...p, companyName: me.user.companyName, openingBalance: String(me.user.openingBalance), openingDate: me.user.openingDate }); }
    catch (x) { toast(x.message, 'err'); setPending(null); } finally { setBusy(''); }
  }
  const set = (k) => (e) => setP({ ...p, [k]: e.target.value });

  return (
    <>
      <PageHeader title="Settings" />
      <ErrorBox>{err}</ErrorBox>
      <div className="grid gap-4 lg:grid-cols-2">
        <form onSubmit={saveProfile} className="card p-5">
          <h2 className="font-semibold text-slate-900">{user.role === 'admin' ? 'Company and opening balance' : 'Profile'}</h2>
          <div className="mt-4 space-y-4">
            <div><label className="label" htmlFor="n">Your name</label><input id="n" className="input" required value={p.name} onChange={set('name')} /></div>
            <div><label className="label" htmlFor="c">Company name</label><input id="c" className="input" value={p.companyName} onChange={set('companyName')} disabled={user.role !== 'admin'} /></div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div><label className="label" htmlFor="ob">Opening balance (₹)</label><input id="ob" type="number" min="0" step="0.01" className="input" value={p.openingBalance} onChange={set('openingBalance')} disabled={user.role !== 'admin'} /></div>
              <div><label className="label" htmlFor="od">Opening date</label><input id="od" type="date" className="input" value={p.openingDate} onChange={set('openingDate')} disabled={user.role !== 'admin'} /></div>
            </div>
            <p className="text-xs text-slate-500">{user.role === 'admin' ? 'The opening balance is the money you already held from the company before you started recording. Use Add Money for anything received later.' : 'Company details and opening balance are managed by your administrator.'}</p>
          </div>
          <button className="btn-primary mt-5" disabled={busy === 'profile'}>{busy === 'profile' && <Spinner />}Save settings</button>
        </form>

        <form onSubmit={savePw} className="card p-5">
          <h2 className="font-semibold text-slate-900">Change password</h2>
          <div className="mt-4 space-y-4">
            <div><label className="label" htmlFor="cp">Current password</label><input id="cp" type="password" className="input" required autoComplete="current-password" value={pw.currentPassword} onChange={(e) => setPw({ ...pw, currentPassword: e.target.value })} /></div>
            <div><label className="label" htmlFor="np">New password</label><input id="np" type="password" className="input" required minLength={8} autoComplete="new-password" value={pw.newPassword} onChange={(e) => setPw({ ...pw, newPassword: e.target.value })} /></div>
          </div>
          <button className="btn-primary mt-5" disabled={busy === 'pw'}>{busy === 'pw' && <Spinner />}Update password</button>
        </form>

        <div className="card p-5 lg:col-span-2">
          <h2 className="font-semibold text-slate-900">Backup and restore</h2>
          <p className="mt-1 text-sm text-slate-500">The backup file contains your settings, every transaction and the attached bills. Keep it somewhere safe. Restoring replaces all current data.</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button className="btn-ghost" onClick={backup} disabled={busy === 'backup'}>{busy === 'backup' ? <Spinner /> : <Download size={16} />}Download backup</button>
            <button className="btn-ghost" onClick={() => fileRef.current.click()}><Upload size={16} />Restore from backup</button>
            <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={pick} />
          </div>
        </div>
        <div className="lg:col-span-2"><button className="btn-ghost" onClick={logout}>Sign out</button></div>
      </div>
      {pending && <Confirm danger busy={busy === 'restore'} title="Replace all data with this backup?" confirmText="Restore backup" onCancel={() => setPending(null)} onConfirm={restore}
        message={`This backup has ${pending.transactions?.length ?? 0} transactions${pending.exportedAt ? ` (saved ${pending.exportedAt.slice(0, 10)})` : ''}. Everything currently in your account will be replaced. Download a backup first if you may need the current data.`} />}
    </>
  );
}
