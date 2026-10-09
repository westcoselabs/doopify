"use client";

export type AdminSelectOption = { label: string; value: string };
type AdminSelectProps = {
  ariaLabel?: string;
  className?: string;
  disabled?: boolean;
  onChange?: (value: string) => void;
  options?: AdminSelectOption[];
  placeholder?: string;
  value?: string;
};

/** Native choice control: platform keyboard support and no out-of-dialog portal. */
export default function AdminSelect({ ariaLabel, className = '', disabled = false, onChange, options = [], placeholder = 'Select', value = '' }: AdminSelectProps) {
  return (
    <div className={['admin-select', className].filter(Boolean).join(' ')}>
      <select className="admin-select__trigger" aria-label={ariaLabel || undefined} disabled={disabled}
        value={value} onChange={event => onChange?.(event.target.value)}>
        {!options.some(option => option.value === value) && <option value={value} disabled>{placeholder}</option>}
        {options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </div>
  );
}
