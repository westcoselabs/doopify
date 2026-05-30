"use client";

import type { InputHTMLAttributes } from 'react';

type AdminInputProps = InputHTMLAttributes<HTMLInputElement>;

export default function AdminInput({
  className = '',
  suppressHydrationWarning,
  type,
  ...props
}: AdminInputProps) {
  return (
    <input
      className={`admin-input ${className}`.trim()}
      suppressHydrationWarning={suppressHydrationWarning ?? type === 'search'}
      type={type}
      {...props}
    />
  );
}
