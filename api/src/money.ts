export const MAX_LOAN_PAISE = 1_000_000_000n;

export function rupeesToPaise(input: string): string | null {
  const value = input.trim();
  if (!/^\d+(?:\.\d{1,2})?$/.test(value)) return null;
  const [whole, fraction = ''] = value.split('.');
  const paise = BigInt(whole) * 100n + BigInt((fraction + '00').slice(0, 2));
  if (paise < 1n || paise > MAX_LOAN_PAISE) return null;
  return paise.toString();
}

export function formatPaise(value: string): string {
  if (!/^\d+$/.test(value)) throw new Error('Invalid paise value');
  const paise = BigInt(value);
  const rupees = (paise / 100n).toString();
  const grouped = rupees.length <= 3 ? rupees : `${rupees.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',')},${rupees.slice(-3)}`;
  return `₹${grouped}.${(paise % 100n).toString().padStart(2, '0')}`;
}
