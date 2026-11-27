import { useState } from 'react';
import { Settings2 } from 'lucide-react';
import {
  DIRECT_PAYMENTS, MOVE_IN, ORIGINAL_CLOSING, ORIGINAL_TOTAL, PURCHASE_PRICE, REFERENCE_CLOSING, REFERENCE_TOTAL, TRANCHES,
} from '../shared/project.js';
import { Money, dateLabel, decimal, number, percent } from './ui.jsx';

const filters = { all: '전체', purchase: '분양대금', option: '옵션·확장', other: '이자·취득세' };

export function Schedule({ plan, summary, commit }) {
  const [filter, setFilter] = useState('all');
  const rows = [
    ...DIRECT_PAYMENTS,
    ...TRANCHES.map((loan) => ({ ...loan, category: 'purchase', financed: true })),
    { id: 'interest', title: '예상 중도금 이자', category: 'other', date: MOVE_IN, amount: summary.interest, estimated: true },
  ].sort((a, b) => a.date.localeCompare(b.date));
  const visibleRows = rows.filter((row) => filter === 'all' || row.category === filter);

  function togglePaid(id, paid) {
    commit((current) => ({ ...current, paidIds: paid ? current.paidIds.filter((item) => item !== id) : [...current.paidIds, id] }));
  }

  return <>
    <div className="page-heading"><div><h1>납부 일정</h1><p>납부 상태를 누르면 완료 여부를 바꿀 수 있습니다.</p></div></div>
    <section className="ledger" aria-label="전체 납부 내역">
      <p className="ledger-summary">
        <span>분양가 <Money value={PURCHASE_PRICE} /></span>
        <span>추가 비용 <Money value={summary.extraExpense} /></span>
        <span>납부 완료 <Money value={summary.paidAmount} /></span>
      </p>
      <div className="filters" aria-label="납부 항목 필터">
        {Object.entries(filters).map(([key, title]) => <button key={key} type="button" aria-pressed={filter === key} onClick={() => setFilter(key)}>{title}</button>)}
      </div>
      <div className="table-scroll" tabIndex={0} aria-label="납부 내역 표">
        <table className="data-table schedule-table">
          <thead><tr><th scope="col">납부일</th><th scope="col">항목</th><th scope="col">구분</th><th scope="col" className="align-right">금액</th><th scope="col" className="align-right">납부 상태</th></tr></thead>
          <tbody>{visibleRows.map((row) => {
            const paid = plan.paidIds.includes(row.id);
            return <tr key={row.id}>
              <td><time dateTime={row.date}>{dateLabel(row.date)}</time></td>
              <th scope="row">{row.title}{row.financed && <span className="table-subtitle"> {row.share}%</span>}</th>
              <td><span className={`category ${row.category}`}>{filters[row.category]}</span></td>
              <td className="align-right"><Money value={row.amount} detailed={row.estimated} /></td>
              <td className="align-right">{row.financed ? <span className="status financed">중도금 대출</span>
                : row.estimated ? <span className="status pending">입주 시 정산</span>
                  : <button type="button" className={`status status-button ${paid ? 'paid' : 'pending'}`} aria-pressed={paid}
                    aria-label={`${row.title} 납부 완료`} onClick={() => togglePaid(row.id, paid)}>{paid ? '납부 완료' : '미납'}</button>}</td>
            </tr>;
          })}</tbody>
        </table>
      </div>
    </section>
    <details className="reference-details"><summary>분양가와 납부액 기준</summary>
      <p>분양 잔금은 분양가에서 계약금 3,147만원과 중도금 3억 7,770만원을 차감한 2억 2,033만원으로 반영했습니다. 원본 잔금과 1만원 차이입니다.</p>
      <p>원본 개별 항목 합계는 <Money value={ORIGINAL_TOTAL} />, 입주일 항목 합계는 <Money value={ORIGINAL_CLOSING} />입니다. 원본 표 하단에는 각각 <Money value={REFERENCE_TOTAL} />, <Money value={REFERENCE_CLOSING} />으로 적혀 있습니다. 옵션은 각 납부일에 적힌 금액을 반영했습니다.</p>
    </details>
  </>;
}

export function Interest({ model, editRates }) {
  const { plan, summary } = model;
  const { rates } = plan;
  return <>
    <div className="page-heading"><div><h1>중도금 이자</h1><p>건설사 선납 · 입주일 일괄 정산</p></div>
      <button className="button primary" type="button" onClick={editRates}><Settings2 size={18} /> 금리 수정</button>
    </div>
    <section className="ledger" aria-label="회차별 이자 산정 내역">
      <p className="ledger-summary">
        <span>예상 이자 <Money value={summary.interest} detailed /></span>
        {summary.savedInterest > 0 && <>
          <span>조기상환 전 <Money value={summary.baselineInterest} detailed /></span>
          <span>절감액 <Money value={summary.savedInterest} detailed /></span>
        </>}
      </p>
      <p className="ledger-note">COFIX 첫 실행 {percent(rates.initialCofix)} · 이후 {percent(rates.renewalCofix)} · 가산 {percent(rates.spread)}</p>
      <div className="table-scroll" tabIndex={0} aria-label="회차별 이자 표">
        <table className="data-table interest-table">
          <thead><tr><th scope="col">기준일</th>{summary.loans.map((loan) => <th scope="col" className="align-right" key={loan.id}>{loan.title}<small>{number(loan.amount)}</small></th>)}<th scope="col" className="align-right">대출 잔액</th><th scope="col" className="align-right">누적 이자</th></tr></thead>
          <tbody>{summary.snapshots.map((point) => <tr key={point.date}>
            <th scope="row"><time dateTime={point.date}>{dateLabel(point.date)}</time></th>
            {point.loans.map(({ rate, interest }, index) => <td key={TRANCHES[index].id} className="align-right">
              {interest === null ? '—' : decimal(interest)}{rate !== null && <small className="rate-tag">{percent(rate)}</small>}
            </td>)}
            <td className="align-right">{number(point.principal)}</td><td className="align-right interest-overall">{decimal(point.interest)}</td>
          </tr>)}</tbody>
        </table>
      </div>
      <p className="ledger-note after-table">금액 단위 만원 · 회차별 6개월 갱신 · 실제 경과 일수 ÷ 365</p>
    </section>
  </>;
}
