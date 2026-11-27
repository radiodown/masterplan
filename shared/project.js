export const MOVE_IN = '2028-12-07';
export const PURCHASE_PRICE = 62_950;
export const REFERENCE_TOTAL = 65_646;
export const REFERENCE_CLOSING = 28_087;
export const REFERENCE_INTEREST = 2_833;
export const REFERENCE_BALANCE = 22_032;

export const CONTRACT_PAYMENTS = [
  { id: 'reservation', date: '2026-08-15', title: '가계약금', amount: 1000, category: 'purchase' },
  { id: 'extension-deposit', date: '2026-08-15', title: '발코니 확장 계약금', amount: 170, category: 'option' },
  { id: 'contract', date: '2026-09-11', title: '계약금', amount: 2147, category: 'purchase' },
  { id: 'option-deposit', date: '2026-10-01', title: '옵션 계약금', amount: 100, category: 'option' },
];

export const TRANCHES = [
  { id: 'loan-1', date: '2026-12-07', title: '1차 중도금', share: 20, amount: 12_590 },
  { id: 'loan-2', date: '2027-05-07', title: '2차 중도금', share: 10, amount: 6295 },
  { id: 'loan-3', date: '2027-09-07', title: '3차 중도금', share: 10, amount: 6295 },
  { id: 'loan-4', date: '2027-12-07', title: '4차 중도금', share: 10, amount: 6295 },
  { id: 'loan-5', date: '2028-06-07', title: '5차 중도금', share: 10, amount: 6295 },
];

export const INTERIM_PRINCIPAL = TRANCHES.reduce((total, { amount }) => total + amount, 0);
export const PURCHASE_DEPOSIT = CONTRACT_PAYMENTS.reduce((total, { amount, category }) =>
  category === 'purchase' ? total + amount : total, 0);

export const CLOSING_PAYMENTS = [
  { id: 'balance', title: '분양 잔금', amount: PURCHASE_PRICE - PURCHASE_DEPOSIT - INTERIM_PRINCIPAL, category: 'purchase' },
  { id: 'extension', title: '발코니 확장 잔금', amount: 1530, category: 'option' },
  { id: 'air-conditioner', title: '에어컨', amount: 782, category: 'option' },
  { id: 'induction', title: '인덕션', amount: 105, category: 'option' },
  { id: 'ventilation', title: '힘펠', amount: 110, category: 'option' },
  { id: 'tax', title: '예상 취득세', amount: 794, category: 'other' },
].map((payment) => ({ ...payment, date: MOVE_IN }));

export const DIRECT_PAYMENTS = [...CONTRACT_PAYMENTS, ...CLOSING_PAYMENTS];
export const ORIGINAL_CLOSING = CLOSING_PAYMENTS.reduce((total, { id, amount }) =>
  total + (id === 'balance' ? REFERENCE_BALANCE : amount), REFERENCE_INTEREST);
export const ORIGINAL_TOTAL = CONTRACT_PAYMENTS.reduce((total, { amount }) =>
  total + amount, INTERIM_PRINCIPAL + ORIGINAL_CLOSING);

export const SNAPSHOT_DATES = [
  '2026-12-07', '2027-05-07', '2027-06-07', '2027-09-07', '2027-11-07', '2027-12-07',
  '2028-03-07', '2028-05-07', '2028-06-07', '2028-09-07', '2028-11-07', MOVE_IN,
];

const DAY = 86_400_000;

export function daysBetween(from, to) {
  return (Date.parse(to) - Date.parse(from)) / DAY;
}

export function addMonths(date, months) {
  const [year, month, day] = date.split('-').map(Number);
  const lastDay = new Date(Date.UTC(year, month + months, 0)).getUTCDate();
  return new Date(Date.UTC(year, month + months - 1, Math.min(day, lastDay))).toISOString().slice(0, 10);
}

export function seoulToday() {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' }).format(new Date());
}

export function makeDefaultPlan(today = seoulToday()) {
  const asOf = today > MOVE_IN ? MOVE_IN : today;
  return {
    asOf,
    assets: [],
    savings: { amount: 0, firstDate: addMonths(`${asOf.slice(0, 7)}-25`, 1) },
    prepayments: [],
    paidIds: DIRECT_PAYMENTS.filter(({ date }) => date < asOf).map(({ id }) => id),
    rates: { initialCofix: 3.62, renewalCofix: 3.87, spread: 1.55 },
  };
}
