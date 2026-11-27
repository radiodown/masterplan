import { useState } from 'react';
import { DEFAULT_REPAYMENT, MAX_MORTGAGE_RATE, MAX_MORTGAGE_YEARS, PRIVATE_LOAN_MONTHS } from '../shared/project.js';
import { Money, UnitField, number } from './ui.jsx';
import { GaugeTrack } from './GaugeTrack.jsx';
import { useGaugeEntrance } from './useGaugeEntrance.js';

function Won({ value, className = '' }) {
  return <span className={`money ${className}`}>{number(value)}<small>원</small></span>;
}

function MonthlyGauge({ id, title, bankMonthly, privateMonthly, scheduledMonthly, scale, description, extraField }) {
  const { fill, entrance } = useGaugeEntrance();
  const monthlyTotal = bankMonthly + privateMonthly;
  const regular = Math.min(scheduledMonthly, bankMonthly);
  const extra = bankMonthly - regular;
  const segments = monthlyTotal > 0 ? [
    { id: 'bank', label: '잔금대출 기본 월 납부액', amount: regular, tone: 'paid' },
    { id: 'extra', label: '잔금대출 월 추가 납부액', amount: extra, tone: 'prepayment' },
    { id: 'private', label: '지인 차입 월 납부액', amount: privateMonthly, tone: 'planned' },
  ].map((segment) => ({ ...segment, share: segment.amount / scale * 100 }))
    : [{ id: 'empty', label: '예상 월 납부액', amount: 0, share: 100, tone: 'uncovered' }];

  return <section className="funding-gauge payment-gauge" aria-labelledby={id}>
    <header className="gauge-heading">
      <div><h2 id={id}>{title}</h2><Won value={monthlyTotal * entrance} className="gauge-amount" /></div>
      <p className="repayment-period">예상 월 납부액</p>
    </header>
    <GaugeTrack {...{ fill, segments }} label={`${title} 월 납부액 구성`} className="payment-track" wholeWon />
    {scale > 0 && <div className="payment-scale" aria-hidden="true"><span>0원</span><Won value={scale} /></div>}
    <dl className="gauge-legend payment-legend">
      <div><dt><i className="dot-paid" aria-hidden="true" />잔금대출 기본</dt><dd><Won value={regular} /></dd></div>
      {extra > 0 && <div><dt><i className="dot-prepayment" aria-hidden="true" />추가 납부</dt><dd><Won value={extra} /></dd></div>}
      {privateMonthly > 0 && <div><dt><i className="dot-planned" aria-hidden="true" />지인 차입</dt><dd><Won value={privateMonthly} /></dd></div>}
    </dl>
    <div className="repayment-fields">{extraField}</div>
    {description && <p className="card-note repayment-allocation">{description}</p>}
  </section>;
}

export function Repayment({ model, commit }) {
  const { plan, summary } = model;
  const settings = { ...DEFAULT_REPAYMENT, ...plan.repayment };
  const [draft, setDraft] = useState(settings);
  const { closingGap, mortgage, repayment } = summary;
  const sliderMax = Math.ceil(closingGap);
  const sliderAmount = Math.min(settings.privateAmount, sliderMax);
  const excess = settings.privateAmount - repayment.privateForClosing;
  const { actualMonths, mortgageMonths, mortgageMonthly, firstBankMonthly, laterBankMonthly, privateMonthly } = repayment;
  const monthsSaved = mortgage > 0 ? mortgageMonths - actualMonths : 0;
  const scale = Math.max(firstBankMonthly + privateMonthly, laterBankMonthly);

  function update(key, value, valid) {
    setDraft((current) => ({ ...current, [key]: value }));
    const amount = Number(value);
    if (valid && amount !== settings[key]) {
      commit((current) => ({ ...current, repayment: { ...DEFAULT_REPAYMENT, ...current.repayment, [key]: amount } }));
    }
  }

  function field(key) {
    return {
      value: draft[key],
      onChange: (event) => update(key, event.target.value, event.target.validity.valid),
      onBlur: () => setDraft((current) => ({ ...current, [key]: settings[key] })),
    };
  }

  return <>
    <div className="page-heading"><div><h1>대출 상환</h1>
      {mortgage > 0 && <p>잔금대출 예상 상환 기간 <strong>{actualMonths}개월</strong>
        {monthsSaved > 0 && <strong className="months-saved">{monthsSaved}개월 단축</strong>}
      </p>}
    </div></div>
    <div className="plan-controls repayment-phases">
      <MonthlyGauge id="first-phase-title" title="첫 60개월" bankMonthly={firstBankMonthly} privateMonthly={privateMonthly} scale={scale} scheduledMonthly={mortgageMonthly}
        description={actualMonths > 0 && actualMonths < PRIVATE_LOAN_MONTHS ? `잔금대출은 ${actualMonths}개월 차에 상환 완료` : undefined}
        extraField={<UnitField label="첫 60개월 잔금대출 월 추가 납부" min="0" step="1" disabled={mortgage === 0} {...field('firstExtra')} />} />
      <MonthlyGauge id="later-phase-title" title="61개월 차부터" bankMonthly={laterBankMonthly} privateMonthly={0} scale={scale} scheduledMonthly={mortgageMonthly}
        description={actualMonths > PRIVATE_LOAN_MONTHS ? `잔금대출 ${actualMonths}개월 차까지` : mortgage > 0 ? '첫 60개월 안에 잔금대출 상환 완료' : undefined}
        extraField={<UnitField label="61개월 이후 잔금대출 월 추가 납부" min="0" step="1" disabled={laterBankMonthly === 0} {...field('laterExtra')} />} />
    </div>
    <div className="plan-controls">
      <section className="plan-pane" aria-labelledby="mortgage-title">
        <div className="pane-heading"><div><h2 id="mortgage-title">잔금대출</h2>
          <p>대출 원금 <Money value={mortgage} /> · 원리금균등상환</p></div></div>
        <div className="savings-fields">
          <UnitField label="연 금리" unit="%" min="0" max={MAX_MORTGAGE_RATE} step=".01" required {...field('annualRate')} />
          <UnitField label="대출 기간" unit="년" min="1" max={MAX_MORTGAGE_YEARS} step="1" required {...field('years')} />
        </div>
      </section>
      <section className="plan-pane assets-pane" aria-labelledby="private-loan-title">
        <div className="pane-heading"><div><h2 id="private-loan-title">지인 차입</h2><p>무이자 · 60개월 원금균등상환</p></div></div>
        <div className="repayment-fields"><UnitField label="차입액" min="0" step="1" {...field('privateAmount')} /></div>
        {sliderMax > 0 && <div className="savings-slider">
          <input aria-label="지인 차입액 빠른 조정" aria-valuetext={`${number(sliderAmount)}만원`} type="range" min="0" max={sliderMax} step="1"
            value={sliderAmount} onChange={(event) => update('privateAmount', event.target.value, true)} style={{ '--slider-fill': `${sliderAmount / sliderMax * 100}%` }} />
          <div aria-hidden="true"><span>0</span><span>{number(sliderMax)}만원</span></div>
        </div>}
        <p className="card-note repayment-allocation">차입액은 입주 부족분에 먼저 충당합니다.
          {excess > 0 && <> 입주 자금에 <Money value={repayment.privateForClosing} />을 반영하고, 초과 차입액도 월 상환액에 포함합니다.</>}
        </p>
      </section>
    </div>
  </>;
}
