import { useCallback, useEffect, useState } from 'react';
import { Copy, Mail, UserPlus, X } from 'lucide-react';
import { api } from '../api';
import { ErrorBox, Loading, PageHeader, Spinner, useToast } from '../components/UI';

export default function Employees() {
  const [data, setData] = useState(null);
  const [email, setEmail] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [inviteLink, setInviteLink] = useState('');
  const toast = useToast();
  const load = useCallback(() => api.get('/admin/employees').then(setData).catch((e) => setErr(e.message)), []);
  useEffect(() => { load(); }, [load]);

  async function createInvite(e) {
    e.preventDefault(); setErr(''); setBusy(true); setInviteLink('');
    try {
      const { token } = await api.post('/admin/invites', { email });
      setInviteLink(`${window.location.origin}/invite/${token}`);
      setEmail('');
      await load();
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  }

  async function copyInvite() {
    try { await navigator.clipboard.writeText(inviteLink); toast('Invitation link copied'); }
    catch { setErr('Could not copy the link. Select and copy it manually.'); }
  }

  async function revoke(id) {
    setErr('');
    try { await api.del(`/admin/invites/${id}`); await load(); toast('Invitation revoked'); }
    catch (e) { setErr(e.message); }
  }

  if (!data && !err) return <Loading />;
  return (
    <>
      <PageHeader title="Employees" subtitle="Invite employees to join your company account" />
      <ErrorBox>{err}</ErrorBox>
      <form onSubmit={createInvite} className="card p-5">
        <h2 className="font-semibold text-slate-900">Invite an employee</h2>
        <p className="mt-1 text-sm text-slate-500">Create a secure, single-use link that expires in 7 days. Share it directly with the employee. Existing users can join with their current password.</p>
        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <input type="email" required className="input flex-1" placeholder="employee@company.com" value={email} onChange={(e) => setEmail(e.target.value)} aria-label="Employee email" />
          <button className="btn-primary" disabled={busy}>{busy ? <Spinner /> : <UserPlus size={17} />}Create invitation</button>
        </div>
        {inviteLink && <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3">
          <p className="text-sm font-medium text-emerald-800">Invitation created. Copy and share this link:</p>
          <div className="mt-2 flex gap-2"><input readOnly className="input min-w-0 flex-1 bg-white text-xs" value={inviteLink} onFocus={(e) => e.target.select()} /><button type="button" className="btn-ghost" onClick={copyInvite}><Copy size={16} />Copy</button></div>
        </div>}
      </form>

      <section className="card mt-5 overflow-hidden">
        <h2 className="border-b border-slate-100 px-4 py-3 text-sm font-semibold text-slate-800">Team members</h2>
        {!data ? <Loading /> : data.employees.length === 0 ? <p className="px-4 py-8 text-center text-sm text-slate-500">No employees have joined yet.</p> : (
          <ul className="divide-y divide-slate-100">
            {data.employees.map((employee) => <li key={employee._id} className="flex items-center gap-3 px-4 py-3"><span className="grid h-9 w-9 place-items-center rounded-full bg-blue-50 text-blue-700"><Mail size={17} /></span><div><p className="text-sm font-medium text-slate-800">{employee.name}</p><p className="text-xs text-slate-500">{employee.email}</p></div></li>)}
          </ul>
        )}
      </section>

      <section className="card mt-5 overflow-hidden">
        <h2 className="border-b border-slate-100 px-4 py-3 text-sm font-semibold text-slate-800">Pending invitations</h2>
        {!data ? null : data.invites.length === 0 ? <p className="px-4 py-8 text-center text-sm text-slate-500">No pending invitations.</p> : (
          <ul className="divide-y divide-slate-100">
            {data.invites.map((invite) => <li key={invite._id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"><div><p className="text-sm font-medium text-slate-800">{invite.email}</p><p className="text-xs text-slate-500">Expires {new Date(invite.expiresAt).toLocaleDateString()}</p></div><button className="btn-ghost text-red-600" onClick={() => revoke(invite._id)}><X size={16} />Revoke</button></li>)}
          </ul>
        )}
      </section>
    </>
  );
}
