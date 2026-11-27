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

test('조기상환은 현금과 원금을 함께 줄이고 이자만큼 주담대 필요액을 낮춘다', () => {
  const draft = plan();
  draft.assets.push({ id: 'cash', name: '보유 현금', amount: 1000 });
  const baseline = calculatePlan(draft);
  draft.prepayments.push({ id: 'repay', target: 'auto', date: '2026-12-07', amount: 1000 });
  const result = calculatePlan(draft);
  assert.equal(result.cashAtClosing, 0);
  assert.equal(result.principal, 36_770);
  assert.equal(result.earlyFunding, 0);
  near(baseline.mortgage - result.mortgage, result.savedInterest);
});

test('조기상환일의 부족분을 뒤에 들어오는 저축과 분리한다', () => {
  const draft = plan();
  draft.savings = { amount: 200, firstDate: '2026-12-25' };
  draft.prepayments.push({ id: 'repay', target: 'auto', date: '2026-12-07', amount: 1000 });
  const result = calculatePlan(draft);
  assert.equal(result.firstShortfall, '2026-12-07');
  assert.equal(result.earlyFunding, 1000);
  assert.equal(result.cashAtClosing, 4800);
  near(result.totalAdditionalFunding, result.mortgage + 1000);
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

test('전체 금액 게이지에서 기존 상환액은 납부 완료로, 저축은 계획 자금으로 반영한다', () => {
  const draft = makeDefaultPlan('2026-12-08');
  draft.prepayments.push({ id: 'paid-repay', target: 'loan-1', date: '2026-12-07', amount: 1000 });
  draft.savings = { amount: 200, firstDate: '2026-12-25' };
  const result = calculatePlan(draft);
  assert.equal(result.funded, 4417);
  near(result.plannedFunds, 4800);
  near(result.funded + result.plannedFunds + result.totalAdditionalFunding, result.totalExpense);
  draft.assets.push({ id: 'cash', name: '보유 현금', amount: 100_000 });
  const fullyFunded = calculatePlan(draft);
  assert.equal(fullyFunded.totalAdditionalFunding, 0);
  near(fullyFunded.funded + fullyFunded.plannedFunds, fullyFunded.totalExpense);
});
