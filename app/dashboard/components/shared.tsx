"use client";
import { READY_ACTIONS, STEP_NAMES } from "../constants";
import type { Plan, Step } from "../types";

export function Field({
  label,
  value,
  setValue,
  placeholder,
}: {
  label: string;
  value: string;
  setValue: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <label>
      {label}
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
      />
    </label>
  );
}

/** Kolon seçimi için dropdown */
export function ColumnField({
  label,
  value,
  setValue,
  columns,
}: {
  label: string;
  value: string;
  setValue: (value: string) => void;
  columns: string[];
}) {
  return (
    <label>
      {label}
      <select value={value} onChange={(e) => setValue(e.target.value)}>
        {columns.map((item) => (
          <option key={item}>{item}</option>
        ))}
      </select>
    </label>
  );
}

export function EmptyState({
  icon,
  title,
  action,
  onClick,
}: {
  icon: string;
  title: string;
  action?: string;
  onClick?: () => void;
}) {
  return (
    <div className="management-empty">
      <span>{icon}</span>
      <b>{title}</b>
      {action && <button onClick={onClick}>{action}</button>}
    </div>
  );
}

/** Dosya yüklenmeden önce gösterilen hızlı aksiyon listesi */
export function QuickActions({ onSelect }: { onSelect: (text: string) => void }) {
  return (
    <div className="quick">
      <div className="quick-title">
        <div>
          <h3>Genel hazır işlemler</h3>
          <p>Bir dosya yükledikten sonra kolon ve koşul bilgilerini seçebilirsin.</p>
        </div>
      </div>
      <div className="quick-grid">
        {READY_ACTIONS.slice(0, 4).map((action) => (
          <button key={action.id} onClick={() => onSelect("")}>
            <span>{action.icon}</span>
            <b>{action.title}</b>
            <i>→</i>
          </button>
        ))}
      </div>
    </div>
  );
}

/** İlerleme çubuğu */
export function Progress({ value, message }: { value: number; message: string }) {
  return (
    <div className="job-progress">
      <div>
        <b>{message}</b>
        <span>%{value}</span>
      </div>
      <i>
        <em style={{ width: `${value}%` }} />
      </i>
    </div>
  );
}

/** AI plan önizleme kartı */
export function PlanCard({
  plan,
  onExecute,
  executing,
}: {
  plan: Plan;
  onExecute: () => void;
  executing: boolean;
}) {
  return (
    <div className="plan-card">
      <div className="plan-title">
        <span>✓</span>
        <div>
          <b>İşlem planı hazır</b>
          <small>
            {plan.originalRows.toLocaleString("tr-TR")} →{" "}
            {plan.estimatedRows.toLocaleString("tr-TR")} satır
          </small>
        </div>
      </div>
      <p>{plan.plan.summary}</p>
      <ol>
        {plan.plan.steps.map((step: Step, i: number) => (
          <li key={i}>
            <i>{i + 1}</i>
            <div>
              <b>{STEP_NAMES[step.kind] ?? step.kind}</b>
              <small>
                {[step.column, step.operator, step.value, step.newName]
                  .filter(Boolean)
                  .join(" · ")}
              </small>
            </div>
          </li>
        ))}
      </ol>
      <div className="safe-note">◇ Orijinal dosyan değiştirilmeyecek</div>
      <div className="plan-buttons">
        <button onClick={() => { }}>Planı kontrol et</button>
        <button className="apply" onClick={onExecute} disabled={executing}>
          {executing ? "Uygulanıyor..." : "Onayla ve uygula →"}
        </button>
      </div>
    </div>
  );
}
