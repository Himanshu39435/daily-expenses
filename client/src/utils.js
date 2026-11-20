export const CATEGORIES = ['Transport', 'Food', 'Hotel', 'Purchase', 'Material', 'Labour Payment', 'Courier', 'Office Expenses', 'Other'];
export const MODES = ['Cash', 'Bank', 'UPI'];

const nf = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
export const inr = (n) => {
  const v = Number(n || 0);
  return (v < 0 ? '-₹' : '₹') + nf.format(Math.abs(v));
};
export const fmtDate = (iso) => (iso ? iso.slice(0, 10).split('-').reverse().join('-') : '');
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const monthName = (k) => `${MON[+k.slice(5, 7) - 1]} ${k.slice(0, 4)}`;

const pad = (n) => String(n).padStart(2, '0');
export const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const today = () => ymd(new Date());
export const addDays = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return ymd(d); };
export const monthStart = () => { const d = new Date(); return ymd(new Date(d.getFullYear(), d.getMonth(), 1)); };
export const weekStart = () => { const d = new Date(); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return ymd(d); };
export const compact = (v) => (Math.abs(v) >= 100000 ? `${+(v / 100000).toFixed(1)}L` : Math.abs(v) >= 1000 ? `${+(v / 1000).toFixed(1)}k` : v);
