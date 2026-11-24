import { useCallback, useEffect, useState } from 'react';
import { Copy, Mail, Pencil, ShieldCheck, UserCheck, UserPlus, UserX, X } from 'lucide-react';
import { api } from '../api';
import { Confirm, ErrorBox, Loading, Modal, PageHeader, Spinner, useToast } from '../components/UI';

export default function Employees() {
  const [data, setData] = useState(null);
  const [email, setEmail] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [inviteLink, setInviteLink] = useState('');
  const [editing, setEditing] = useState(null);
  const [pendingStatus, setPendingStatus] = useState(null);
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

  async function saveMember(e) {
    e.preventDefault(); setErr(''); setBusy(true);
    try {
      await api.put(`/admin/employees/${editing._id}`, {
        name: editing.name,
        email: editing.email,
        role: editing.role,
      });
      setEditing(null);
      await load();
      toast(editing.role === 'admin' ? 'Administrator access updated' : 'Employee details updated');
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  }

  async function setMemberStatus(member, isActive) {
    setErr(''); setBusy(true);
    try {
      await api.put(`/admin/employees/${member._id}`, { isActive });
      setPendingStatus(null);
      await load();
      toast(isActive ? 'Account reactivated' : 'Account deactivated; transaction history is preserved');
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  }

  function memberList(title, members) {
    return (
      <section className="card mt-5 overflow-hidden">
        <h2 className="border-b border-slate-100 px-4 py-3 text-sm font-semibold text-slate-800">{title}</h2>
        {members.length === 0 ? <p className="px-4 py-8 text-center text-sm text-slate-500">No {title.toLowerCase()} to show.</p> : (
          <ul className="divide-y divide-slate-100">
            {members.map((member) => <li key={member._id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
              <div className="flex min-w-0 items-center gap-3">
                <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-full ${member.role === 'admin' ? 'bg-violet-50 text-violet-700' : 'bg-blue-50 text-blue-700'}`}>
                  {member.role === 'admin' ? <ShieldCheck size={17} /> : <Mail size={17} />}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-800">{member.name} {!member.isActive && <span className="ml-1 text-xs font-normal text-amber-700">(Inactive)</span>}</p>
                  <p className="truncate text-xs text-slate-500">{member.email} · {member.role === 'admin' ? 'Administrator' : 'Employee'}</p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button className="btn-ghost" onClick={() => setEditing({ ...member })}><Pencil size={15} />Edit</button>
                <button
                  className={`btn-ghost ${member.isActive ? 'text-red-600' : 'text-emerald-700'}`}
                  disabled={busy}
                  onClick={() => member.isActive ? setPendingStatus(member) : setMemberStatus(member, true)}
                >
                  {member.isActive ? <><UserX size={15} />Deactivate</> : <><UserCheck size={15} />Reactivate</>}
                </button>
              </div>
            </li>)}
          </ul>
        )}
      </section>
    );
  }

  if (!data && !err) return <Loading />;
  return (
    <>
      <PageHeader title="Team management" subtitle={data?.canManageAdmins ? 'Edit employee details, manage accounts, and assign administrator access.' : 'Edit employees, assign administrator access, or deactivate employee accounts.'} />
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

      {data && memberList('Employees', data.employees)}
      {data?.canManageAdmins && memberList('Administrators', data.admins)}

      <section className="card mt-5 overflow-hidden">
        <h2 className="border-b border-slate-100 px-4 py-3 text-sm font-semibold text-slate-800">Pending invitations</h2>
        {!data ? <Loading /> : data.invites.length === 0 ? <p className="px-4 py-8 text-center text-sm text-slate-500">No pending invitations.</p> : (
          <ul className="divide-y divide-slate-100">
            {data.invites.map((invite) => <li key={invite._id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"><div><p className="text-sm font-medium text-slate-800">{invite.email}</p><p className="text-xs text-slate-500">Expires {new Date(invite.expiresAt).toLocaleDateString()}</p></div><button className="btn-ghost text-red-600" onClick={() => revoke(invite._id)}><X size={16} />Revoke</button></li>)}
          </ul>
        )}
      </section>

      {editing && <Modal title="Edit team member" onClose={() => setEditing(null)}>
        <form onSubmit={saveMember} className="space-y-4">
          <div><label className="label" htmlFor="member-name">Name</label><input id="member-name" className="input" required value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} /></div>
          <div><label className="label" htmlFor="member-email">Email</label><input id="member-email" type="email" className="input" required value={editing.email} onChange={(e) => setEditing({ ...editing, email: e.target.value })} /></div>
          <div>
            <label className="label" htmlFor="member-role">Role</label>
            <select id="member-role" className="input" value={editing.role} onChange={(e) => setEditing({ ...editing, role: e.target.value })}>
              <option value="employee">Employee</option>
              <option value="admin">Administrator</option>
            </select>
            <p className="mt-1 text-xs text-slate-500">Administrators can manage employees. Only the owner can manage administrator accounts.</p>
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-ghost" onClick={() => setEditing(null)}>Cancel</button>
            <button className="btn-primary" disabled={busy}>{busy && <Spinner />}Save changes</button>
          </div>
        </form>
      </Modal>}
      {pendingStatus && <Confirm
        danger
        title="Deactivate this account?"
        confirmText="Deactivate account"
        busy={busy}
        onCancel={() => setPendingStatus(null)}
        onConfirm={() => setMemberStatus(pendingStatus, false)}
        message="The person will be signed out and can no longer log in. Their account and transaction history are preserved, and the owner can reactivate them later."
      />}
    </>
  );
}
