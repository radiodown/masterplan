import { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Building2, CalendarDays, ChartNoAxesCombined, CircleCheck, Cloud, CloudOff, LayoutDashboard } from 'lucide-react';
import { calculatePlan } from '../shared/calculate.js';
import { MOVE_IN, TRANCHES } from '../shared/project.js';
import { Overview } from './Overview.jsx';
import { Interest, Schedule } from './Details.jsx';
import { Dialog, Money, SelectField, UnitField, longDate } from './ui.jsx';
import './styles.css';

const pages = {
  overview: { label: '개요', icon: LayoutDashboard },
  schedule: { label: '납부 일정', icon: CalendarDays },
  interest: { label: '중도금 이자', icon: ChartNoAxesCombined },
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

function PlanDialog({ modal, plan, commit, onClose }) {
  const { item, kind } = modal;
  if (kind === 'asset') return <Dialog title={item ? '자산 수정' : '자산 추가'} onClose={onClose}
    description={`${longDate(plan.asOf)} 기준으로 입주에 사용할 금액을 입력하세요.`}
    onSubmit={(form) => commit((current) => ({ ...current, assets: replaceItem(current.assets, {
      id: item?.id ?? crypto.randomUUID(), name: String(form.get('name')).trim(), amount: Number(form.get('amount')),
    }) }))}>
    <label className="field"><span>자산 이름</span><input name="name" placeholder="예. 정기예금" defaultValue={item?.name} required maxLength={50} autoFocus /></label>
    <UnitField label="자산 금액" name="amount" min="1" step="1" placeholder="0" defaultValue={item?.amount} required />
  </Dialog>;

  if (kind === 'prepayment') return <Dialog title={item ? '조기상환 수정' : '조기상환 추가'} onClose={onClose}
    description="상환일부터 해당 원금에 대한 이자가 줄어듭니다."
    onSubmit={(form) => commit((current) => ({ ...current, prepayments: replaceItem(current.prepayments, {
      id: item?.id ?? crypto.randomUUID(), date: form.get('date'), amount: Number(form.get('amount')), target: form.get('target'),
    }) }))}>
    <label className="field"><span>상환일</span><input name="date" type="date" min={TRANCHES[0].date} max="2028-12-06" required autoFocus
      defaultValue={item?.date ?? (plan.asOf >= MOVE_IN ? '2028-12-06' : [plan.asOf, TRANCHES[0].date].sort().at(-1))} /></label>
    <UnitField label="상환 원금" name="amount" min="1" step="1" placeholder="0" defaultValue={item?.amount} required />
    <SelectField label="상환 회차" name="target" defaultValue={item?.target ?? 'auto'}>
      <option value="auto">금리가 높은 회차부터</option>
      {TRANCHES.map(({ id, title }) => <option value={id} key={id}>{title}</option>)}
    </SelectField>
    <p className="card-note">자산 기준일 이전의 상환은 이미 반영된 금액으로 처리합니다.</p>
  </Dialog>;

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
      {loadError ? <div className="card load-state"><h1>계획을 불러오지 못했습니다</h1><p>{loadError}</p>
        <button className="button primary" type="button" onClick={load}>다시 시도</button></div>
        : !model ? <div className="load-state" role="status">자금 계획을 불러오는 중입니다.</div>
          : <>
            {page === 'overview' && <Overview {...{ model, commit, editAsset, removeAsset, editPrepayment, removePrepayment }} />}
            {page === 'schedule' && <Schedule {...model} commit={commit} />}
            {page === 'interest' && <Interest {...{ model, editRates }} />}
          </>}
    </main>
    {modal && <PlanDialog {...{ modal, commit }} plan={model.plan} onClose={() => setModal(null)} />}
  </>;
}

createRoot(document.getElementById('root')).render(<App />);
