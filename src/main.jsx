import { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Building2, CalendarDays, ChartNoAxesCombined, CircleCheck, Cloud, CloudOff, Landmark, LayoutDashboard } from 'lucide-react';
import { calculatePlan } from '../shared/calculate.js';
import { LAST_PREPAYMENT_DATE, TRANCHES } from '../shared/project.js';
import { Overview } from './Overview.jsx';
import { Interest, Schedule } from './Details.jsx';
import { Repayment } from './Repayment.jsx';
import { Dialog, Money, SelectField, UnitField, longDate } from './ui.jsx';
import './styles.css';

const pages = {
  overview: { label: '개요', icon: LayoutDashboard },
  schedule: { label: '납부 일정', icon: CalendarDays },
  interest: { label: '중도금 이자', icon: ChartNoAxesCombined },
  repayment: { label: '대출 상환', icon: Landmark },
};

function getPage() {
  const key = location.hash.slice(1);
  return Object.hasOwn(pages, key) ? key : 'overview';
}

async function requestPlan(plan) {
  const options = plan ? { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(plan) } : {};
  const response = await fetch('/api/plan', options);
  const data = await response.json().catch(() => null);
  if (!response.ok || !data) throw new Error(data?.error || '저장 서버에 연결할 수 없습니다.');
  return data;
}

function Header({ page, saveState, retrySave }) {
  const states = {
    initial: { label: '로컬 저장', icon: Cloud }, saving: { label: '저장 중', icon: Cloud },
    saved: { label: '저장 완료', icon: CircleCheck }, error: { label: '저장 재시도', icon: CloudOff },
  };
  const { label, icon: SaveIcon } = states[saveState];
  return <header className="topbar"><div className="topbar-inner">
    <a className="brand" href="#overview" aria-label="포레스트 플랜 개요">
      <span className="brand-icon"><Building2 size={22} strokeWidth={1.8} aria-hidden="true" /></span>
      <span>포레스트 플랜</span>
    </a>
    <nav className="nav" aria-label="자금 계획 메뉴">
      {Object.entries(pages).map(([key, { label, icon: Icon }]) => <a href={`#${key}`} key={key} aria-current={page === key ? 'page' : undefined}>
        <Icon size={18} strokeWidth={1.8} aria-hidden="true" />{label}
      </a>)}
    </nav>
    <div className="save-container" role="status">
      {saveState === 'error' ? <button className="save-pill save-error" type="button" onClick={retrySave}><SaveIcon size={15} />{label}</button>
        : <span className={`save-pill ${saveState}`}><SaveIcon size={15} aria-hidden="true" />{label}</span>}
    </div>
  </div></header>;
}

function replaceItem(items, item) {
  return items.some(({ id }) => id === item.id) ? items.map((old) => old.id === item.id ? item : old) : [...items, item];
}

function PrepaymentDialog({ modal, summary, commit, onClose }) {
  const { item } = modal;
  const [target, setTarget] = useState(item.target);
  const loan = summary.slider.tranches.find(({ id }) => id === target);
  const firstDate = loan?.date ?? TRANCHES[0].date;
  const [date, setDate] = useState(item.date);
  const [amount, setAmount] = useState(item.amount);
  const previousAllocations = summary.allocations[item.id];
  const capacity = (candidate) => candidate.balance + (previousAllocations.find(({ id }) => id === candidate.id)?.amount ?? 0);
  const available = loan ? capacity(loan) : summary.principal + summary.slider.amount + item.amount;

  function changeTarget(event) {
    const nextTarget = event.target.value;
    const nextFirstDate = summary.slider.tranches.find(({ id }) => id === nextTarget)?.date ?? TRANCHES[0].date;
    setTarget(nextTarget);
    if (date && date < nextFirstDate) setDate(nextFirstDate);
  }

  return <Dialog title={loan ? `${loan.title} 조기상환 수정` : '조기상환 수정'}
    description={loan ? `대출 실행일 ${longDate(loan.date)}` : '기존 금리 순서에 따라 회차별로 배분합니다.'} onClose={onClose}
    onSubmit={(form) => commit((current) => ({ ...current, prepayments: replaceItem(current.prepayments, {
      id: item.id, date: form.get('date'), amount: Number(form.get('amount')), target,
    }) }))}>
    <SelectField label="상환 회차" value={target} onChange={changeTarget}>
      {item.target === 'auto' && <option value="auto">기존 자동 배분</option>}
      {summary.slider.tranches.map((candidate) => <option value={candidate.id} key={candidate.id} disabled={capacity(candidate) === 0}>{candidate.title}</option>)}
    </SelectField>
    <label className="field"><span>상환일</span><input name="date" type="date" min={firstDate} max={LAST_PREPAYMENT_DATE} required autoFocus
      value={date} onChange={(event) => setDate(event.target.value)} /></label>
    <UnitField label="상환 원금" name="amount" min="1" max={available} step="1" placeholder="0" value={amount}
      onChange={(event) => setAmount(event.target.value)} required />
    {loan && <div className="repayment-limit">
      <span>상환 가능 원금 <Money value={available} /></span>
      <button className="button subtle" type="button" onClick={() => setAmount(available)}>전액 입력</button>
    </div>}
    <p className="card-note">자산 기준일 이전의 상환은 이미 반영된 금액으로 처리합니다.</p>
  </Dialog>;
}

function PlanDialog({ modal, plan, summary, commit, onClose }) {
  const { item, kind } = modal;
  if (kind === 'asset') return <Dialog title={item ? '자산 수정' : '자산 추가'} onClose={onClose}
    description={`${longDate(plan.asOf)} 기준으로 입주에 사용할 금액을 입력하세요.`}
    onSubmit={(form) => commit((current) => ({ ...current, assets: replaceItem(current.assets, {
      id: item?.id ?? crypto.randomUUID(), name: String(form.get('name')).trim(), amount: Number(form.get('amount')),
    }) }))}>
    <label className="field"><span>자산 이름</span><input name="name" placeholder="예. 정기예금" defaultValue={item?.name} required maxLength={50} autoFocus /></label>
    <UnitField label="자산 금액" name="amount" min="1" step="1" placeholder="0" defaultValue={item?.amount} required />
  </Dialog>;

  if (kind === 'prepayment') return <PrepaymentDialog {...{ modal, summary, commit, onClose }} />;

  if (kind === 'rate') return <Dialog title="금리 수정" description="COFIX 예상치와 가산금리를 입력하세요." onClose={onClose}
    onSubmit={(form) => commit((current) => ({ ...current, rates: {
      initialCofix: Number(form.get('initialCofix')), renewalCofix: Number(form.get('renewalCofix')), spread: Number(form.get('spread')),
    } }))}>
    <UnitField label="첫 실행 COFIX" name="initialCofix" unit="%" min="0" max="30" step=".01" defaultValue={plan.rates.initialCofix} required autoFocus />
    <UnitField label="이후 COFIX" name="renewalCofix" unit="%" min="0" max="30" step=".01" defaultValue={plan.rates.renewalCofix} required />
    <UnitField label="가산금리" name="spread" unit="%" min="0" max="30" step=".01" defaultValue={plan.rates.spread} required />
  </Dialog>;

  const asset = kind === 'removeAsset';
  return <Dialog title={asset ? '자산 삭제' : '조기상환 삭제'} submitLabel="삭제" onClose={onClose}
    onSubmit={() => commit((current) => {
      const key = asset ? 'assets' : 'prepayments';
      return { ...current, [key]: current[key].filter(({ id }) => id !== item.id) };
    })}>
    <p className="dialog-confirm">{asset ? item.name : longDate(item.date)} · <Money value={item.amount} /> 항목을 계획에서 삭제합니다.</p>
  </Dialog>;
}

function App() {
  const [page, setPage] = useState(getPage);
  const [model, setModel] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [saveState, setSaveState] = useState('initial');
  const [modal, setModal] = useState(null);
  const latestPlan = useRef(null);
  const requestNumber = useRef(0);
  const saving = useRef(Promise.resolve());

  async function load() {
    setLoadError('');
    try {
      const result = await requestPlan();
      latestPlan.current = result.plan;
      setModel(result);
    } catch (error) {
      setLoadError(error.message);
    }
  }

  useEffect(() => {
    load();
    function onNavigate() {
      setPage(getPage());
      window.scrollTo({ top: 0 });
    }
    addEventListener('hashchange', onNavigate);
    return () => removeEventListener('hashchange', onNavigate);
  }, []);

  function save(plan) {
    const version = ++requestNumber.current;
    setSaveState('saving');
    saving.current = saving.current.then(async () => {
      if (version !== requestNumber.current) return;
      try {
        await requestPlan(plan);
        if (version === requestNumber.current) setSaveState('saved');
      } catch {
        if (version === requestNumber.current) setSaveState('error');
      }
    });
  }

  function commit(transform) {
    const plan = transform(latestPlan.current);
    const summary = calculatePlan(plan);
    latestPlan.current = plan;
    setModel({ plan, summary });
    save(plan);
  }

  const editAsset = (item) => setModal({ kind: 'asset', item });
  const removeAsset = (item) => setModal({ kind: 'removeAsset', item });
  const editPrepayment = (item) => setModal({ kind: 'prepayment', item });
  const removePrepayment = (item) => setModal({ kind: 'removePrepayment', item });
  const editRates = () => setModal({ kind: 'rate' });

  return <>
    <Header {...{ page, saveState }} retrySave={() => save(latestPlan.current)} />
    <main className="main">
      {loadError ? <div className="load-state"><h1>계획을 불러오지 못했습니다</h1><p>{loadError}</p>
        <button className="button primary" type="button" onClick={load}>다시 시도</button></div>
        : !model ? <div className="load-state" role="status">자금 계획을 불러오는 중입니다.</div>
          : <>
            {page === 'overview' && <Overview {...{ model, commit, editAsset, removeAsset, editPrepayment, removePrepayment }} />}
            {page === 'schedule' && <Schedule {...model} commit={commit} />}
            {page === 'interest' && <Interest {...{ model, editRates }} />}
            {page === 'repayment' && <Repayment {...{ model, commit }} />}
          </>}
    </main>
    {modal && <PlanDialog {...{ modal, commit }} {...model} onClose={() => setModal(null)} />}
  </>;
}

createRoot(document.getElementById('root')).render(<App />);
