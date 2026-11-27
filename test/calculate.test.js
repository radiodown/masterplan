import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculatePlan, PlanError } from '../shared/calculate.js';
import { makeDefaultPlan, MOVE_IN } from '../shared/project.js';

const plan = () => makeDefaultPlan('2026-11-27');
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 0.001, `${actual} ≈ ${expected}`);

test('확정 분양가, 직접 납부액과 회차별 원표 이자를 반영한다', () => {
  const result = calculatePlan(plan());
  assert.equal(result.paidPurchase, 3147);
  assert.equal(result.paidOptions, 270);
  assert.equal(result.options, 2797);
  assert.equal(result.extension, 1700);
  assert.equal(result.tax, 794);
  assert.equal(result.principal, 37_770);
  assert.equal(result.closing - result.interest, 25_354);
  assert.deepEqual(result.loans.map(({ interest }) => Number(interest.toFixed(1))), [1350.9, 542.2, 427.2, 342.1, 171.1]);
  near(result.interest, 2833.467);
  near(result.totalExpense, 69_374.467);
  near(result.mortgage, 65_957.467);
});

test('입주일 적립은 포함하고 이후 적립은 제외한다', () => {
  const draft = plan();
  draft.savings = { amount: 200, firstDate: MOVE_IN };
  assert.equal(calculatePlan(draft).savings, 200);
  draft.savings.firstDate = '2028-12-08';
  assert.equal(calculatePlan(draft).savings, 0);
});

test('별도 상환액은 보유 현금을 유지하고 원금과 이자만큼 주담대 필요액을 낮춘다', () => {
  const draft = plan();
  draft.assets.push({ id: 'cash', name: '보유 현금', amount: 1000 });
  const baseline = calculatePlan(draft);
  draft.prepayments.push({ id: 'repay', target: 'auto', date: '2026-12-07', amount: 1000 });
  const result = calculatePlan(draft);
  assert.equal(result.cashAtClosing, 1000);
  assert.equal(result.principal, 36_770);
  assert.equal(result.earlyFunding, 0);
  assert.equal(result.prepaymentTotal, 1000);
  near(result.plannedFunds, baseline.plannedFunds);
  near(baseline.mortgage - result.mortgage, 1000 + result.savedInterest);
});

test('별도 상환이 뒤에 들어오는 월저축에 영향을 주지 않는다', () => {
  const draft = plan();
  draft.savings = { amount: 200, firstDate: '2026-12-25' };
  draft.prepayments.push({ id: 'repay', target: 'auto', date: '2026-12-07', amount: 1000 });
  const result = calculatePlan(draft);
  assert.equal(result.firstShortfall, null);
  assert.equal(result.earlyFunding, 0);
  assert.equal(result.prepaymentTotal, 1000);
  assert.equal(result.cashAtClosing, 4800);
  near(result.totalAdditionalFunding, result.mortgage);
});

test('같은 날 저축은 필수 납부에 쓸 수 있으며 조기상환은 별도 자금으로 반영한다', () => {
  const draft = makeDefaultPlan('2026-12-07');
  draft.paidIds = draft.paidIds.filter((id) => id !== 'reservation');
  draft.assets.push({ id: 'cash', name: '보유 현금', amount: 800 });
  draft.savings = { firstDate: '2026-12-07', amount: 700 };
  draft.prepayments.push({ id: 'repay', target: 'loan-1', date: '2026-12-07', amount: 1500 });
  const result = calculatePlan(draft);
  assert.equal(result.prepaymentTotal, 1500);
  assert.equal(result.contractCash, 1000);
  assert.equal(result.earlyFunding, 0);
  assert.equal(result.assetsUsed, 800);
  assert.equal(result.savingsUsed, result.savings);
});

test('상환 시점의 실행 원금을 확인하고 금리가 높은 회차부터 차감한다', () => {
  const draft = plan();
  draft.prepayments.push({ id: 'repay', target: 'auto', date: '2027-05-07', amount: 9000 });
  const result = calculatePlan(draft);
  assert.deepEqual(result.allocations.repay.map(({ id, amount }) => [id, amount]), [['loan-2', 6295], ['loan-1', 2705]]);
  draft.prepayments[0].date = '2026-12-07';
  draft.prepayments[0].target = 'loan-2';
  assert.throws(() => calculatePlan(draft), PlanError);
});

test('선납 처리한 비용은 입주 정산금에서만 제외한다', () => {
  const draft = plan();
  const baseline = calculatePlan(draft);
  draft.paidIds.push('air-conditioner');
  const result = calculatePlan(draft);
  assert.equal(result.paidAmount - baseline.paidAmount, 782);
  near(baseline.settlement - result.settlement, 782);
  assert.equal(baseline.totalExpense, result.totalExpense);
});

test('전체 금액 게이지에서 기존 중도금 상환과 저축을 각각 한 번만 반영한다', () => {
  const draft = makeDefaultPlan('2026-12-08');
  draft.prepayments.push({ id: 'paid-repay', target: 'loan-1', date: '2026-12-07', amount: 1000 });
  draft.savings = { amount: 200, firstDate: '2026-12-25' };
  const result = calculatePlan(draft);
  assert.equal(result.funded, 4417);
  assert.equal(result.paidAmount, 3417);
  assert.equal(result.prepaymentTotal, 1000);
  near(result.plannedFunds, 4800);
  near(result.funded + result.plannedFunds + result.totalAdditionalFunding, result.totalExpense);
  draft.assets.push({ id: 'cash', name: '보유 현금', amount: 100_000 });
  const fullyFunded = calculatePlan(draft);
  assert.equal(fullyFunded.totalAdditionalFunding, 0);
  near(fullyFunded.funded + fullyFunded.plannedFunds, fullyFunded.totalExpense);
});

test('기존 계획에 상환 설정이 없어도 잔금대출의 원리금균등 월 납부액을 계산한다', () => {
  const draft = plan();
  delete draft.repayment;
  draft.rates = { initialCofix: 0, renewalCofix: 0, spread: 0 };
  draft.assets.push({ id: 'cash', name: '보유 현금', amount: 53_124 });
  const result = calculatePlan(draft);
  assert.equal(result.mortgage, 10_000);
  assert.equal(result.repayment.mortgageMonths, 360);
  assert.equal(result.repayment.monthlyTotal, 477_415);
});

test('지인 차입을 입주 부족분에 적용하고 무이자 60개월 분납액을 합산한다', () => {
  const draft = plan();
  draft.rates = { initialCofix: 0, renewalCofix: 0, spread: 0 };
  draft.assets.push({ id: 'cash', name: '보유 현금', amount: 53_124 });
  draft.repayment = { annualRate: 0, years: 20, privateAmount: 6000 };
  const result = calculatePlan(draft);
  assert.equal(result.totalAdditionalFunding, 10_000);
  assert.equal(result.repayment.privateForClosing, 6000);
  assert.equal(result.mortgage, 4000);
  assert.equal(result.repayment.mortgageMonthly, 166_667);
  assert.equal(result.repayment.privateMonthly, 1_000_000);
  assert.equal(result.repayment.monthlyTotal, 1_166_667);

  draft.repayment.privateAmount = 15_000;
  const excess = calculatePlan(draft);
  assert.equal(excess.repayment.privateForClosing, 10_000);
  assert.equal(excess.mortgage, 0);
  assert.equal(excess.repayment.monthlyTotal, 2_500_000);
});

test('유효하지 않은 금리, 기간과 지인 차입액을 거부한다', () => {
  const draft = plan();
  for (const change of [{ annualRate: -1 }, { years: 0 }, { privateAmount: 1.5 }, { firstExtra: -1 }, { laterExtra: null }]) {
    const repayment = { ...draft.repayment, ...change };
    assert.throws(() => calculatePlan({ ...draft, repayment }), PlanError);
  }
});

test('슬라이더는 앞 회차 원금을 채운 다음 다음 회차를 부분 상환한다', () => {
  const draft = plan();
  draft.prepaymentSlider = 13_000;
  const result = calculatePlan(draft);
  assert.deepEqual(result.slider.payments.map(({ target, date, amount }) => [target, date, amount]), [
    ['loan-1', '2026-12-07', 12_590], ['loan-2', '2027-05-07', 410],
  ]);
  assert.equal(result.prepaymentTotal, 13_000);
  assert.equal(result.principal, 24_770);
  assert.equal(result.earlyFunding, 0);
  near(result.paidAmount + result.prepaymentTotal + result.assetsUsed + result.savingsUsed + result.totalAdditionalFunding, result.totalExpense);
});

test('슬라이더 상환은 저장된 자동 배분 원금을 보존한다', () => {
  const draft = plan();
  draft.prepayments.push({ id: 'legacy', target: 'auto', date: '2027-05-07', amount: 9000 });
  draft.prepaymentSlider = 12_000;
  const result = calculatePlan(draft);
  assert.deepEqual(result.allocations.legacy.map(({ id, amount }) => [id, amount]), [['loan-2', 6295], ['loan-1', 2705]]);
  assert.deepEqual(result.slider.payments.map(({ target, date, amount }) => [target, date, amount]), [
    ['loan-1', '2027-05-07', 9885], ['loan-3', '2027-09-07', 2115],
  ]);
  assert.equal(result.prepaymentTotal, 21_000);
});

test('두 구간의 월 추가 납부를 반영해 잔금대출 기간을 줄인다', () => {
  const draft = plan();
  draft.rates = { initialCofix: 0, renewalCofix: 0, spread: 0 };
  draft.assets.push({ id: 'cash', name: '보유 현금', amount: 51_124 });
  draft.repayment = { annualRate: 0, years: 10, privateAmount: 0, firstExtra: 50, laterExtra: 0 };
  const early = calculatePlan(draft).repayment;
  assert.equal(early.actualMonths, 90);
  assert.equal(early.firstBankMonthly, 1_500_000);
  assert.equal(early.laterBankMonthly, 1_000_000);

  draft.repayment.laterExtra = 50;
  const both = calculatePlan(draft).repayment;
  assert.equal(both.actualMonths, 80);
  assert.equal(both.laterBankMonthly, 1_500_000);

  draft.repayment.firstExtra = 200;
  const beforeSecondPhase = calculatePlan(draft).repayment;
  assert.equal(beforeSecondPhase.actualMonths, 40);
  assert.equal(beforeSecondPhase.laterBankMonthly, 0);
});
