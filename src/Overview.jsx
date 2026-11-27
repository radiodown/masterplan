import { useState } from 'react';
import { CalendarDays, Gauge, Plus } from 'lucide-react';
import { MOVE_IN, PURCHASE_PRICE } from '../shared/project.js';
import { Money, RowActions, UnitField, dateLabel, number } from './ui.jsx';

function FundingGauge({ summary }) {
  const { totalExpense, funded, plannedFunds, totalAdditionalFunding, earlyFunding, mortgage } = summary;
  const fundedShare = funded / totalExpense * 100;
  const plannedShare = plannedFunds / totalExpense * 100;
  const progress = totalAdditionalFunding > 0
    ? Math.min(99.9, Math.round((fundedShare + plannedShare) * 10) / 10)
    : 100;

  return <section className="funding-gauge" aria-labelledby="funding-title">
    <header className="gauge-heading">
      <div>
        <h2 id="funding-title">전체 필요 금액</h2>
        <Money value={totalExpense} className="gauge-amount" />
      </div>
      <div className="gauge-progress"><Gauge size={19} aria-hidden="true" /><span>계획 반영 확보율</span><strong>{progress}%</strong></div>
    </header>
    <div className="gauge-track" role="meter" aria-label="전체 필요 금액 대비 확보율" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}>
      <span className="gauge-paid" style={{ width: `${fundedShare}%` }} aria-hidden="true" />
      <span className="gauge-planned" style={{ width: `${plannedShare}%` }} aria-hidden="true" />
    </div>
    <dl className="gauge-legend">
      <div><dt><i className="dot-paid" />납부 완료</dt><dd><Money value={funded} /></dd></div>
      <div><dt><i className="dot-planned" />입주까지 마련할 자기자금</dt><dd><Money value={plannedFunds} /></dd></div>
      <div className="gauge-remaining"><dt><i />추가 필요 금액</dt><dd><Money value={totalAdditionalFunding} /></dd></div>
    </dl>
    <div className="gauge-note">
      <span>입주 시 필요 주담대 <Money value={mortgage} /></span>
      {earlyFunding > 0 && <span>{dateLabel(summary.firstShortfall)}부터 입주 전 현금 <Money value={earlyFunding} /> 필요</span>}
    </div>
  </section>;
}

function AssetsPane({ plan, summary, editAsset, removeAsset }) {
  return <section className="plan-pane assets-pane" aria-labelledby="assets-title">
    <div className="pane-heading">
      <div><h2 id="assets-title">보유자산</h2><p>{dateLabel(plan.asOf)} 기준</p></div>
      <button className="button subtle" type="button" onClick={() => editAsset()}><Plus size={16} /> 자산 추가</button>
    </div>
    {plan.assets.length === 0 ? <p className="pane-empty">예금, 적금 등 입주에 사용할 자산을 추가하세요.</p> : <>
      <ul className="item-list">
        {plan.assets.map((asset) => <li key={asset.id}>
          <span className="item-name">{asset.name}</span><Money value={asset.amount} />
          <RowActions label={asset.name} onEdit={() => editAsset(asset)} onRemove={() => removeAsset(asset)} />
        </li>)}
      </ul>
      <p className="pane-total">합계 <Money value={summary.assets} /></p>
    </>}
  </section>;
}

const SAVINGS_SLIDER_MAX = 1000;

function SavingsPane({ plan, summary, commit }) {
  const [amount, setAmount] = useState(plan.savings.amount ? String(plan.savings.amount) : '');
  const [firstDate, setFirstDate] = useState(plan.savings.firstDate);

  function changeAmount(value, valid) {
    setAmount(value);
    if (valid && Number(value) !== plan.savings.amount) {
      commit((current) => ({ ...current, savings: { ...current.savings, amount: Number(value) } }));
    }
  }

  function changeDate(event) {
    const { value, validity } = event.target;
    setFirstDate(value);
    if (validity.valid && value !== plan.savings.firstDate) {
      commit((current) => ({ ...current, savings: { ...current.savings, firstDate: value } }));
    }
  }

  const sliderAmount = Math.min(plan.savings.amount, SAVINGS_SLIDER_MAX);
  return <section className="plan-pane savings-pane" aria-labelledby="savings-title">
    <div className="pane-heading"><div><h2 id="savings-title">월 저축</h2>
      <p>입주일까지 {summary.savingsCount}회 · <Money value={summary.savings} /></p></div></div>
    <div className="savings-fields">
      <UnitField label="월 저축액" min="0" step="1" placeholder="0" value={amount}
        onChange={(event) => changeAmount(event.target.value, event.target.validity.valid)}
        onBlur={() => setAmount(plan.savings.amount ? String(plan.savings.amount) : '')} />
      <label className="field"><span>첫 저축일</span><input type="date" required min={plan.asOf} max="2099-12-31"
        value={firstDate} onChange={changeDate} onBlur={() => setFirstDate(plan.savings.firstDate)} /></label>
    </div>
    <div className="savings-slider">
      <input aria-label="월 저축액 빠른 조정" aria-valuetext={`${number(sliderAmount)}만원`} type="range" min="0" max={SAVINGS_SLIDER_MAX} step="1" value={sliderAmount}
        onChange={(event) => changeAmount(event.target.value, true)} style={{ '--slider-fill': `${sliderAmount / SAVINGS_SLIDER_MAX * 100}%` }} />
      <div aria-hidden="true"><span>0</span><span>{number(SAVINGS_SLIDER_MAX)}만원</span></div>
    </div>
  </section>;
}

function PrepaymentsPane({ plan, summary, editPrepayment, removePrepayment }) {
  const orderedPayments = [...plan.prepayments].sort((a, b) => a.date.localeCompare(b.date));
  return <section className="plan-pane prepayments-pane" aria-labelledby="prepayments-title">
    <div className="pane-heading">
      <div><h2 id="prepayments-title">중도금 조기상환</h2>
        {summary.savedInterest > 0 && <p>이자 <Money value={summary.savedInterest} detailed /> 절감</p>}</div>
      <button className="button subtle" type="button" onClick={() => editPrepayment()}><Plus size={16} /> 상환 추가</button>
    </div>
    {orderedPayments.length > 0 && <ul className="item-list">
      {orderedPayments.map((payment) => <li key={payment.id}>
        <span className="item-name">{dateLabel(payment.date)}
          <small>{summary.allocations[payment.id].map(({ title }) => title).join(' · ')}</small>
        </span>
        <Money value={payment.amount} />
        <RowActions label={`${dateLabel(payment.date)} 조기상환`} onEdit={() => editPrepayment(payment)} onRemove={() => removePrepayment(payment)} />
      </li>)}
    </ul>}
  </section>;
}

export function Overview({ model, commit, editAsset, removeAsset, editPrepayment, removePrepayment }) {
  const { plan, summary } = model;
  return <>
    <div className="page-heading">
      <div><h1>입주 자금 계획</h1><p>
        <span className="property-info"><span className="property-name">아이파크 포레스트 84B</span><span className="heading-separator" />
          <span className="property-price">분양가 <Money value={PURCHASE_PRICE} /></span></span>
        <span className="property-date"><CalendarDays size={15} aria-hidden="true" /> {dateLabel(MOVE_IN)} 입주 예정</span>
      </p></div>
    </div>
    <FundingGauge summary={summary} />
    <section className="card plan-controls" aria-label="자금 계획 조정">
      <SavingsPane {...{ plan, summary, commit }} />
      <AssetsPane {...{ plan, summary, editAsset, removeAsset }} />
      <PrepaymentsPane {...{ plan, summary, editPrepayment, removePrepayment }} />
    </section>
  </>;
}
