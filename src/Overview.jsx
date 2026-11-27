import { useState } from 'react';
import { CalendarDays, Plus } from 'lucide-react';
import { MOVE_IN, PURCHASE_PRICE } from '../shared/project.js';
import { Money, RowActions, UnitField, dateLabel, number } from './ui.jsx';
import { GaugeTrack } from './GaugeTrack.jsx';
import { useGaugeEntrance } from './useGaugeEntrance.js';

function FundingGauge({ summary }) {
  const { fill, entrance } = useGaugeEntrance();
  const {
    totalExpense, funded, plannedFunds, totalAdditionalFunding, closingGap, earlyFunding, mortgage, savedInterest,
    paidAmount, assetsUsed, savingsUsed, prepaymentTotal, extension, options, interest, tax,
  } = summary;
  const { privateForClosing } = summary.repayment;
  const showFinancing = earlyFunding > 0 || privateForClosing > 0;
  const share = (amount) => amount / totalExpense * 100;
  const progress = totalAdditionalFunding > 0
    ? Math.min(99.9, Math.round(share(funded + plannedFunds) * 10) / 10)
    : 100;
  const displayedProgress = entrance < 1 ? Math.floor(progress * entrance * 10) / 10 : progress;
  const sources = [
    { id: 'paid', label: '납부 완료', amount: paidAmount, tone: 'paid' },
    { id: 'assets', label: '보유자산', amount: assetsUsed, tone: 'assets' },
    { id: 'savings', label: '월저축 반영액', amount: savingsUsed, tone: 'planned' },
    { id: 'prepayment', label: '중도금 상환', amount: prepaymentTotal, tone: 'prepayment' },
  ];
  const segments = [...sources,
    { id: 'shortfall', label: '입주 전 부족한 현금', amount: earlyFunding, tone: 'shortfall' },
    { id: 'closing', label: privateForClosing > 0 ? '입주일 부족 금액' : '입주 시 필요 주담대', amount: closingGap, tone: 'uncovered' },
  ].map((segment) => ({ ...segment, share: share(segment.amount) }));
  const costs = [
    ['분양가', PURCHASE_PRICE], ['발코니 확장', extension], ['옵션', options - extension], ['중도금 이자', interest], ['취득세', tax],
  ];

  return <section className="funding-gauge" aria-labelledby="funding-title">
    <header className="gauge-heading">
      <div>
        <h2 id="funding-title">전체 필요 금액</h2>
        <Money value={totalExpense} className="gauge-amount" />
      </div>
      <div className="gauge-progress"><span>계획 반영 확보율</span><strong>{displayedProgress}<small>%</small></strong></div>
    </header>
    <dl className="funding-costs" aria-label="전체 필요 금액의 구성">
      {costs.map(([label, amount], index) => <div key={label}>
        {index > 0 && <span aria-hidden="true">+</span>}<dt>{label}</dt><dd><Money value={amount} /></dd>
      </div>)}
    </dl>
    <GaugeTrack {...{ fill, segments, progress }} label="전체 필요 금액 대비 확보율" />
    <div className="gauge-scale" aria-hidden="true"><span>0%</span><span>25%</span><span>50%</span><span>75%</span><span>100%</span></div>
    <dl className="gauge-legend funding-legend">
      {sources.map(({ id, label, amount, tone }) => <div key={id}>
        <dt><i className={`dot-${tone}`} aria-hidden="true" />{label}</dt><dd><Money value={amount} /></dd>
      </div>)}
      <div className="gauge-remaining">
        <dt><i aria-hidden="true" />추가 필요 금액</dt>
        <dd><Money value={totalAdditionalFunding} />
          {!showFinancing && <span className="gauge-loan-label">입주 시 필요 주담대</span>}
        </dd>
      </div>
    </dl>
    {(showFinancing || savedInterest > 0) && <div className="gauge-note">
      {savedInterest > 0 && <span>조기상환 이자 절감 <Money value={savedInterest} detailed /></span>}
      {earlyFunding > 0 && <span className="gauge-shortfall-label">{dateLabel(summary.firstShortfall)}부터 입주 전 현금 <Money value={earlyFunding} /> 필요</span>}
      {showFinancing && <span>입주 시 필요 주담대 <Money value={mortgage} /></span>}
      {privateForClosing > 0 && <span>입주에 쓰는 지인 차입금 <Money value={privateForClosing} /></span>}
    </div>}
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

function PrepaymentsPane({ plan, summary, commit, editPrepayment, removePrepayment }) {
  const { slider, prepaymentTotal } = summary;
  const orderedPayments = [...plan.prepayments].sort((a, b) => a.date.localeCompare(b.date));
  const setSlider = (amount) => commit((current) => ({ ...current, prepaymentSlider: amount }));
  return <section className="plan-pane prepayments-pane" aria-labelledby="prepayments-title">
    <div className="pane-heading"><div><h2 id="prepayments-title">중도금 조기상환</h2><p>상환 계획 합계 <Money value={prepaymentTotal} /></p></div></div>
    {slider.limit > 0 && <>
      <div className="prepayment-slider-label"><label htmlFor="prepayment-slider">1차부터 순서대로 추가 상환</label><Money value={slider.amount} /></div>
      <div className="savings-slider">
        <input id="prepayment-slider" aria-valuetext={`${number(slider.amount)}만원`} type="range" min="0" max={slider.limit} step="1" value={slider.amount}
          onChange={(event) => setSlider(Number(event.target.value))}
          style={{ '--slider-fill': `${slider.amount / slider.limit * 100}%` }} />
        <div className="prepayment-stops"><button className="prepayment-stop-start" type="button" aria-label="추가 상환액 0만원" onClick={() => setSlider(0)}>0</button>
          {slider.tranches.filter(({ balance }) => balance > 0).map(({ id, title, through }) => <button key={id} type="button"
            className={through === slider.limit ? 'prepayment-stop-end' : ''} style={{ left: `${through / slider.limit * 100}%` }}
            aria-label={`${title}까지 추가 상환`} onClick={() => setSlider(through)}>{title.split(' ')[0]}</button>)}
        </div>
      </div>
      {slider.payments.length > 0 && <ul className="item-list slider-payments" aria-label="슬라이더 회차별 상환 내역">
        {slider.payments.map(({ id, title, date, amount }) => <li key={id}>
          <span className="item-name">{title}<small>{dateLabel(date)}</small></span><Money value={amount} />
        </li>)}
      </ul>}
    </>}
    {orderedPayments.length > 0 && <details className="reference-details prepayment-history">
      <summary>직접 입력한 상환 내역 ({orderedPayments.length}건)</summary>
      <ul className="item-list">
        {orderedPayments.map((payment) => {
          const tranches = summary.allocations[payment.id].map(({ title }) => title).join(' · ');
          return <li key={payment.id}>
            <span className="item-name">{dateLabel(payment.date)}<small>{tranches}</small></span>
            <Money value={payment.amount} />
            <RowActions label={`${dateLabel(payment.date)} ${tranches} 조기상환`} onEdit={() => editPrepayment(payment)} onRemove={() => removePrepayment(payment)} />
          </li>;
        })}
      </ul>
    </details>}
  </section>;
}

export function Overview({ model, commit, editAsset, removeAsset, editPrepayment, removePrepayment }) {
  const { plan, summary } = model;
  return <>
    <div className="page-heading">
      <div><h1>입주 자금 계획</h1><p>
        <span className="property-name">아이파크 포레스트 84B</span>
        <span className="property-date"><CalendarDays size={15} aria-hidden="true" /> {dateLabel(MOVE_IN)} 입주 예정</span>
      </p></div>
    </div>
    <FundingGauge summary={summary} />
    <section className="plan-controls overview-controls" aria-label="자금 계획 조정">
      <SavingsPane {...{ plan, summary, commit }} />
      <PrepaymentsPane {...{ plan, summary, commit, editPrepayment, removePrepayment }} />
      <AssetsPane {...{ plan, summary, editAsset, removeAsset }} />
    </section>
  </>;
}
