import {
  addMonths, daysBetween, CONTRACT_PAYMENTS, CLOSING_PAYMENTS, DEFAULT_REPAYMENT, DIRECT_PAYMENTS,
  INTERIM_PRINCIPAL, LAST_PREPAYMENT_DATE, MAX_MORTGAGE_RATE, MAX_MORTGAGE_YEARS, MOVE_IN,
  PRIVATE_LOAN_MONTHS, PURCHASE_PRICE, SNAPSHOT_DATES, TRANCHES,
} from './project.js';

const sum = (items, amount) => items.reduce((total, item) => total + amount(item), 0);

export class PlanError extends Error {}

function check(condition, message) {
  if (!condition) throw new PlanError(message);
}

function isDate(value) {
  return typeof value === 'string' && /^20\d\d-\d\d-\d\d$/.test(value)
    && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}

function isAmount(value, min = 1) {
  return Number.isSafeInteger(value) && value >= min && value <= 100_000_000;
}

function isId(value) {
  return typeof value === 'string' && /^[a-zA-Z0-9-]{1,64}$/.test(value);
}

export function validatePlan(plan) {
  check(plan && isDate(plan.asOf) && plan.asOf <= MOVE_IN, '자산 기준일을 확인해 주세요.');
  const { asOf, assets, savings, prepayments, prepaymentSlider = 0, paidIds, rates, repayment = DEFAULT_REPAYMENT } = plan;
  check(Array.isArray(assets) && assets.length <= 100, '보유자산은 최대 100개까지 입력할 수 있습니다.');
  check(assets.every((asset) => asset && isId(asset.id) && typeof asset.name === 'string'
    && asset.name.trim().length > 0 && asset.name.length <= 50 && isAmount(asset.amount)), '자산 이름과 금액을 확인해 주세요.');
  check(new Set(assets.map(({ id }) => id)).size === assets.length, '자산 식별자가 중복되었습니다.');
  check(savings && isAmount(savings.amount, 0) && isDate(savings.firstDate) && savings.firstDate >= asOf,
    '월 저축액과 기준일 이후의 첫 저축일을 입력해 주세요.');
  check(Array.isArray(prepayments) && prepayments.length <= 100, '조기상환은 최대 100건까지 입력할 수 있습니다.');
  check(prepayments.every((payment) => payment && isId(payment.id) && isAmount(payment.amount)
    && isDate(payment.date) && payment.date >= TRANCHES[0].date && payment.date < MOVE_IN
    && (payment.target === 'auto' || TRANCHES.some(({ id }) => id === payment.target))),
  '조기상환 금액, 날짜 및 대상 회차를 확인해 주세요.');
  check(new Set(prepayments.map(({ id }) => id)).size === prepayments.length, '상환 식별자가 중복되었습니다.');
  check(isAmount(prepaymentSlider, 0) && prepaymentSlider <= INTERIM_PRINCIPAL, '슬라이더의 중도금 상환액을 확인해 주세요.');
  check(Array.isArray(paidIds) && paidIds.every((id) => DIRECT_PAYMENTS.some((item) => item.id === id)),
    '납부 상태를 확인해 주세요.');
  check(rates && [rates.initialCofix, rates.renewalCofix, rates.spread].every((rate) =>
    Number.isFinite(rate) && rate >= 0 && rate <= 30), 'COFIX와 가산금리는 0~30% 범위로 입력해 주세요.');
  check(repayment && Number.isFinite(repayment.annualRate) && repayment.annualRate >= 0 && repayment.annualRate <= MAX_MORTGAGE_RATE,
    `잔금대출 금리는 0~${MAX_MORTGAGE_RATE}% 범위로 입력해 주세요.`);
  check(Number.isInteger(repayment.years) && repayment.years >= 1 && repayment.years <= MAX_MORTGAGE_YEARS,
    `잔금대출 기간은 1~${MAX_MORTGAGE_YEARS}년 범위로 입력해 주세요.`);
  check(isAmount(repayment.privateAmount, 0), '지인 차입액을 만원 단위의 정수로 입력해 주세요.');
  const { firstExtra = 0, laterExtra = 0 } = repayment;
  check(isAmount(firstExtra, 0) && isAmount(laterExtra, 0),
    '잔금대출 추가 납부액은 만원 단위의 정수로 입력해 주세요.');
}

function simulateLoans(rates, prepayments) {
  const loans = TRANCHES.map((tranche, index) => {
    const rate = (index === 0 ? rates.initialCofix : rates.renewalCofix) + rates.spread;
    const renewals = [];
    for (let month = 6; addMonths(tranche.date, month) < MOVE_IN; month += 6) {
      renewals.push(addMonths(tranche.date, month));
    }
    return { ...tranche, balance: 0, interest: 0, rate, initialRate: rate, renewals };
  });

  const events = [...new Set([
    ...SNAPSHOT_DATES, ...loans.flatMap(({ renewals }) => renewals), ...prepayments.map(({ date }) => date),
  ])].sort();
  const snapshots = [];
  const allocations = {};
  let previous = events[0];

  for (const date of events) {
    const elapsed = daysBetween(previous, date);
    for (const loan of loans) {
      loan.interest += loan.balance * loan.rate / 100 * elapsed / 365;
      if (loan.date === date) loan.balance = loan.amount;
      if (loan.renewals.includes(date)) loan.rate = rates.renewalCofix + rates.spread;
    }

    for (const payment of prepayments.filter((item) => item.date === date)) {
      const eligible = payment.target === 'auto'
        ? [...loans].sort((a, b) => b.rate - a.rate || a.date.localeCompare(b.date))
        : loans.filter(({ id }) => id === payment.target);
      const available = sum(eligible, ({ balance }) => balance);
      check(payment.amount <= available,
        `${date}에 상환할 수 있는 원금은 ${available.toLocaleString('ko-KR')}만원입니다. 상환일 또는 금액을 조정해 주세요.`);
      let remaining = payment.amount;
      const allocation = [];
      for (const loan of eligible) {
        const used = Math.min(remaining, loan.balance);
        if (used === 0) continue;
        loan.balance -= used;
        remaining -= used;
        allocation.push({ id: loan.id, title: loan.title, amount: used });
      }
      allocations[payment.id] = allocation;
    }

    if (SNAPSHOT_DATES.includes(date)) {
      snapshots.push({
        date,
        principal: sum(loans, ({ balance }) => balance),
        interest: sum(loans, ({ interest }) => interest),
        loans: loans.map((loan) => ({
          interest: loan.date <= date ? loan.interest : null,
          rate: loan.date === date || loan.renewals.includes(date) ? loan.rate : null,
        })),
      });
    }
    previous = date;
  }

  return {
    loans, snapshots, allocations,
    principal: sum(loans, ({ balance }) => balance),
    interest: sum(loans, ({ interest }) => interest),
  };
}

function simulateCash(plan) {
  const assets = sum(plan.assets, ({ amount }) => amount);
  const deposits = [];
  let savingsCount = 0;
  for (let date = plan.savings.firstDate; date <= MOVE_IN; date = addMonths(plan.savings.firstDate, savingsCount)) {
    if (plan.savings.amount > 0) deposits.push({ date, amount: plan.savings.amount });
    savingsCount++;
  }
  const unpaid = CONTRACT_PAYMENTS.filter(({ id }) => !plan.paidIds.includes(id));
  const payments = unpaid.map(({ date, amount }) => ({ date: date < plan.asOf ? plan.asOf : date, amount: -amount }));
  let balance = assets;
  let earlyFunding = 0;
  let firstShortfall = null;
  // Same-day savings are available for required contract payments.
  const ledger = [...deposits, ...payments].sort((a, b) => a.date.localeCompare(b.date));
  for (const { date, amount } of ledger) {
    balance += amount;
    const shortfall = Math.max(0, -balance);
    if (shortfall > 0) {
      firstShortfall ??= date;
      earlyFunding += shortfall;
      balance = 0;
    }
  }
  return {
    assets, savingsCount, firstShortfall, earlyFunding,
    savings: savingsCount * plan.savings.amount,
    cashAtClosing: balance, contractCash: sum(unpaid, ({ amount }) => amount) - earlyFunding,
  };
}

function makeSliderPlan(plan, existingLoans) {
  const limit = plan.asOf <= LAST_PREPAYMENT_DATE ? existingLoans.principal : 0;
  const amount = Math.min(plan.prepaymentSlider ?? 0, limit);
  // Slider payments follow any legacy automatic allocations on the same day.
  const availableFrom = [plan.asOf, ...plan.prepayments.filter(({ target }) => target === 'auto').map(({ date }) => date)].sort().at(-1);
  const payments = [];
  let remaining = amount;
  let through = 0;
  const tranches = existingLoans.loans.map(({ id, title, date, balance }) => {
    through += balance;
    const paymentAmount = Math.min(remaining, balance);
    if (paymentAmount > 0) {
      payments.push({ id: `slider:${id}`, target: id, title, date: date > availableFrom ? date : availableFrom, amount: paymentAmount });
      remaining -= paymentAmount;
    }
    return { id, title, date, balance, through };
  });
  return { limit, amount, payments, tranches };
}

function calculateRepayment(closingGap, { annualRate, years, privateAmount, firstExtra = 0, laterExtra = 0 }) {
  const privateForClosing = Math.min(privateAmount, closingGap);
  const mortgage = closingGap - privateForClosing;
  const mortgageMonths = years * 12;
  const monthlyRate = annualRate / 1200;
  const principalWon = mortgage * 10_000;
  const monthLog = Math.log1p(monthlyRate);
  const discount = -Math.expm1(-mortgageMonths * monthLog);
  const regularPayment = principalWon * (monthlyRate === 0 ? 1 / mortgageMonths : monthlyRate / discount);
  const mortgageMonthly = Math.round(regularPayment);
  const privateMonthly = Math.round(privateAmount * 10_000 / PRIVATE_LOAN_MONTHS);
  let balance = principalWon;
  let extraReduction = 0;
  let actualMonths = 0;
  let firstBankMonthly = 0;
  let laterBankMonthly = 0;

  for (let month = 1; month <= mortgageMonths && balance > 0.000001; month++) {
    const extra = (month <= PRIVATE_LOAN_MONTHS ? firstExtra : laterExtra) * 10_000;
    const due = balance * (1 + monthlyRate);
    const payment = Math.min(due, regularPayment + extra);
    actualMonths = month;
    if (month === 1) firstBankMonthly = Math.round(payment);
    if (month === PRIVATE_LOAN_MONTHS + 1) laterBankMonthly = Math.round(payment);
    if (payment >= due) break;

    // The scheduled balance minus accumulated extra principal avoids drift over long terms.
    const monthsLeft = mortgageMonths - month;
    const scheduledBalanceRatio = monthlyRate === 0 ? monthsLeft / mortgageMonths : -Math.expm1(-monthsLeft * monthLog) / discount;
    extraReduction = extraReduction * (1 + monthlyRate) + extra;
    balance = principalWon * scheduledBalanceRatio - extraReduction;
  }

  return {
    mortgage, privateForClosing, mortgageMonths, mortgageMonthly, privateMonthly, actualMonths,
    firstBankMonthly, laterBankMonthly, monthlyTotal: firstBankMonthly + privateMonthly,
  };
}

export function calculatePlan(plan) {
  validatePlan(plan);
  const baseline = simulateLoans(plan.rates, []);
  const existing = plan.prepayments.length ? simulateLoans(plan.rates, plan.prepayments) : baseline;
  const slider = makeSliderPlan(plan, existing);
  const loan = slider.amount > 0 ? simulateLoans(plan.rates, [...plan.prepayments, ...slider.payments]) : existing;
  const cash = simulateCash(plan);
  const closingFixed = sum(CLOSING_PAYMENTS.filter(({ id }) => !plan.paidIds.includes(id)), ({ amount }) => amount);
  const closing = closingFixed + loan.interest;
  const settlement = closing + loan.principal;
  const closingGap = Math.max(0, settlement - cash.cashAtClosing);
  const { mortgage, ...repayment } = calculateRepayment(closingGap, plan.repayment ?? DEFAULT_REPAYMENT);
  const appliedCash = Math.min(cash.cashAtClosing, settlement);
  const paid = DIRECT_PAYMENTS.filter(({ id }) => plan.paidIds.includes(id));
  const options = sum(DIRECT_PAYMENTS.filter(({ category }) => category === 'option'), ({ amount }) => amount);
  const extension = sum(DIRECT_PAYMENTS.filter(({ id }) => id === 'extension' || id === 'extension-deposit'), ({ amount }) => amount);
  const tax = CLOSING_PAYMENTS.find(({ id }) => id === 'tax').amount;
  const extraExpense = options + tax + loan.interest;
  const totalExpense = PURCHASE_PRICE + extraExpense;
  const paidAmount = sum(paid, ({ amount }) => amount);
  const totalAdditionalFunding = closingGap + cash.earlyFunding;
  const prepaymentTotal = baseline.principal - loan.principal;
  const funded = paidAmount + prepaymentTotal;
  const plannedFunds = cash.contractCash + appliedCash;
  const assetsUsed = Math.min(cash.assets, plannedFunds);

  return {
    ...cash, ...loan, closing, settlement, closingGap, mortgage, repayment, slider, appliedCash, options, extension, tax, extraExpense,
    totalExpense, paidAmount, prepaymentTotal, totalAdditionalFunding, funded, plannedFunds, assetsUsed, savingsUsed: plannedFunds - assetsUsed,
    paidPurchase: sum(paid.filter(({ category }) => category === 'purchase'), ({ amount }) => amount),
    paidOptions: sum(paid.filter(({ category }) => category === 'option'), ({ amount }) => amount),
    baselineInterest: baseline.interest,
    savedInterest: Math.max(0, baseline.interest - loan.interest),
  };
}
