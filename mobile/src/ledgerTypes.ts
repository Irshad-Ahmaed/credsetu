import { isCalendarDate } from './entryUtils';

export type Loan = {
  id: string;
  friend_name: string;
  amount_paise: string;
  due_on: string;
  status: 'pending' | 'repaid';
  repaid_on: string | null;
  is_overdue: boolean;
  receipt_available: boolean;
};

export type LedgerSummary = {
  total_lent_paise: string;
  total_repaid_paise: string;
  total_pending_paise: string;
  total_overdue_paise: string;
  business_today: string;
  ledger_version: string;
  business_time_zone: 'Asia/Kolkata';
};

export type LoanPage = {
  data: Loan[];
  meta: { page: number; limit: number; has_more: boolean; ledger_version: string; business_today: string; business_time_zone: 'Asia/Kolkata' };
};
export type Dashboard = { summary: LedgerSummary; entries: LoanPage };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isMoney(value: unknown): value is string {
  return typeof value === 'string' && /^\d{1,30}$/.test(value);
}

function isLedgerVersion(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{1,20}:\d{1,20}:\d{1,20}$/.test(value)) return false;
  const [count, repaid, deleted] = value.split(':').map(BigInt);
  return repaid <= count && deleted <= count;
}

export function parseLoan(value: unknown, today?: string): Loan | null {
  if (!isRecord(value)) return null;
  const valid = typeof value.id === 'string' && value.id.length > 0
    && typeof value.friend_name === 'string' && value.friend_name.trim().length >= 2 && value.friend_name.length <= 80
    && isMoney(value.amount_paise) && BigInt(value.amount_paise) > 0n && BigInt(value.amount_paise) <= 1_000_000_000n
    && typeof value.due_on === 'string' && isCalendarDate(value.due_on)
    && (value.status === 'pending' || value.status === 'repaid')
    && (value.status === 'pending' ? value.repaid_on === null
      : typeof value.repaid_on === 'string' && isCalendarDate(value.repaid_on))
    && typeof value.is_overdue === 'boolean'
    && typeof value.receipt_available === 'boolean';
  if (!valid || (value.status === 'repaid' && value.is_overdue)) return null;
  if (today && value.is_overdue !== (value.status === 'pending' && (value.due_on as string) < today)) return null;
  return value as Loan;
}

export function parseLoanPage(value: unknown): LoanPage | null {
  if (!isRecord(value) || !Array.isArray(value.data) || !isRecord(value.meta)) return null;
  const meta = value.meta;
  if (!Number.isSafeInteger(meta.page) || Number(meta.page) < 1
    || !Number.isSafeInteger(meta.limit) || Number(meta.limit) < 1 || Number(meta.limit) > 100
    || typeof meta.has_more !== 'boolean'
    || !isLedgerVersion(meta.ledger_version)
    || typeof meta.business_today !== 'string' || !isCalendarDate(meta.business_today)
    || meta.business_time_zone !== 'Asia/Kolkata' || value.data.length > Number(meta.limit)
    || (meta.has_more && value.data.length !== meta.limit)
    || !value.data.every((loan) => parseLoan(loan, meta.business_today as string))
    || new Set(value.data.map((loan) => loan.id)).size !== value.data.length) return null;
  return value as LoanPage;
}

export function parseLedgerSummary(value: unknown): LedgerSummary | null {
  if (!isRecord(value) || !isMoney(value.total_lent_paise) || !isMoney(value.total_repaid_paise)
    || !isMoney(value.total_pending_paise) || !isMoney(value.total_overdue_paise)
    || typeof value.business_today !== 'string' || !isCalendarDate(value.business_today)
    || !isLedgerVersion(value.ledger_version) || value.business_time_zone !== 'Asia/Kolkata') return null;
  if (BigInt(value.total_lent_paise) !== BigInt(value.total_pending_paise) + BigInt(value.total_repaid_paise)
    || BigInt(value.total_overdue_paise) > BigInt(value.total_pending_paise)) return null;
  return value as LedgerSummary;
}

export function parseDashboard(value: unknown): Dashboard | null {
  if (!isRecord(value)) return null;
  const summary = parseLedgerSummary(value.summary);
  const entries = parseLoanPage(value.entries);
  if (!summary || !entries || entries.meta.page !== 1 || entries.meta.limit !== 20
    || entries.meta.business_today !== summary.business_today
    || entries.meta.ledger_version !== summary.ledger_version) return null;
  const totals = entries.data.reduce((sum, loan) => {
    const amount = BigInt(loan.amount_paise);
    sum.lent += amount;
    if (loan.status === 'repaid') sum.repaid += amount; else sum.pending += amount;
    if (loan.is_overdue) sum.overdue += amount;
    return sum;
  }, { lent: 0n, repaid: 0n, pending: 0n, overdue: 0n });
  const expected = { lent: summary.total_lent_paise, repaid: summary.total_repaid_paise,
    pending: summary.total_pending_paise, overdue: summary.total_overdue_paise };
  for (const key of ['lent', 'repaid', 'pending', 'overdue'] as const) {
    if (totals[key] > BigInt(expected[key]) || (!entries.meta.has_more && totals[key] !== BigInt(expected[key]))) return null;
  }
  return { summary, entries };
}
