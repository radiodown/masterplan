import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Pencil, Trash2, X } from 'lucide-react';

const integer = new Intl.NumberFormat('ko-KR');
const oneDecimal = new Intl.NumberFormat('ko-KR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const rateFormat = new Intl.NumberFormat('ko-KR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const number = (value) => integer.format(Math.round(value));
export const decimal = (value) => oneDecimal.format(value);
export const percent = (value) => `${rateFormat.format(value)}%`;
export const dateLabel = (date) => date.replaceAll('-', '.');
export function longDate(date) {
  const [year, month, day] = date.split('-').map(Number);
  return `${year}년 ${month}월 ${day}일`;
}

export function Money({ value, className = '', detailed = false }) {
  if (detailed) return <span className={`money ${className}`}>{decimal(value)}<small>만원</small></span>;
  const rounded = Math.round(value);
  const hundredMillion = Math.floor(rounded / 10_000);
  const remainder = rounded % 10_000;
  return (
    <span className={`money ${className}`}>
      {hundredMillion > 0 && <>{number(hundredMillion)}<small>억</small>{remainder > 0 && ' '}</>}
      {(hundredMillion === 0 || remainder > 0) && <>{number(remainder)}<small>만원</small></>}
    </span>
  );
}

export function UnitField({ label, unit = '만원', ...props }) {
  return <label className="field"><span>{label}</span><span className="input-wrap">
    <input type="number" inputMode={props.step === '.01' ? 'decimal' : 'numeric'} max={100_000_000} {...props} />
    <span aria-hidden="true" className="input-unit">{unit}</span>
  </span></label>;
}

export function SelectField({ label, children, ...props }) {
  return <label className="field"><span>{label}</span><span className="select-wrap">
    <select {...props}>{children}</select><ChevronDown aria-hidden="true" size={16} />
  </span></label>;
}

export function RowActions({ label, onEdit, onRemove }) {
  return <div className="row-actions">
    <button className="icon-button" type="button" aria-label={`${label} 수정`} title="수정" onClick={onEdit}><Pencil size={16} /></button>
    <button className="icon-button remove" type="button" aria-label={`${label} 삭제`} title="삭제" onClick={onRemove}><Trash2 size={16} /></button>
  </div>;
}

export function Dialog({ title, description, onClose, onSubmit, children, submitLabel = '저장' }) {
  const dialog = useRef(null);
  const [error, setError] = useState('');
  useEffect(() => {
    dialog.current.showModal();
  }, []);

  return <dialog ref={dialog} className="dialog" aria-labelledby="dialog-title" onClose={onClose}>
    <div className="dialog-heading">
      <div><h2 id="dialog-title">{title}</h2>{description && <p>{description}</p>}</div>
      <button type="button" className="icon-button" aria-label="닫기" onClick={() => dialog.current.close()}><X size={22} /></button>
    </div>
    <form onSubmit={(event) => {
      event.preventDefault();
      try {
        onSubmit(new FormData(event.currentTarget));
        dialog.current.close();
      } catch (error) {
        setError(error.message);
      }
    }}>
      <div className="dialog-fields">{children}</div>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="dialog-actions">
        <button className="button secondary" type="button" onClick={() => dialog.current.close()}>취소</button>
        <button className="button primary" type="submit">{submitLabel}</button>
      </div>
    </form>
  </dialog>;
}
