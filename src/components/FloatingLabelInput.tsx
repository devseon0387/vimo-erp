'use client';

import { InputHTMLAttributes, TextareaHTMLAttributes, useId, useState } from 'react';

interface FloatingLabelInputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  required?: boolean;
}

interface FloatingLabelTextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string;
  required?: boolean;
}

export function FloatingLabelInput({ label, required, className = '', id, ...props }: FloatingLabelInputProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const [isFocused, setIsFocused] = useState(false);
  const hasValue = props.value !== undefined && props.value !== '';

  const isFloating = isFocused || hasValue;

  return (
    <div className="relative">
      <input
        id={inputId}
        {...props}
        onFocus={(e) => {
          setIsFocused(true);
          props.onFocus?.(e);
        }}
        onBlur={(e) => {
          setIsFocused(false);
          props.onBlur?.(e);
        }}
        className={`
          w-full px-4 pt-6 pb-2 border border-ink-300 rounded-lg
          focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent
          transition-all duration-200
          ${className}
        `}
        placeholder=""
      />
      <label
        htmlFor={inputId}
        className={`
          absolute left-4 transition-all duration-200 pointer-events-none
          ${isFloating
            ? 'top-1.5 text-xs text-brand-600 font-medium'
            : 'top-1/2 -translate-y-1/2 text-base text-ink-500'
          }
        `}
      >
        {label}
        {required && <span className="text-bad-500 ml-1">*</span>}
      </label>
    </div>
  );
}

export function FloatingLabelTextarea({ label, required, className = '', rows = 3, id, ...props }: FloatingLabelTextareaProps) {
  const autoId = useId();
  const textareaId = id ?? autoId;
  const [isFocused, setIsFocused] = useState(false);
  const hasValue = props.value !== undefined && props.value !== '';

  const isFloating = isFocused || hasValue;

  return (
    <div className="relative">
      <textarea
        id={textareaId}
        {...props}
        rows={rows}
        onFocus={(e) => {
          setIsFocused(true);
          props.onFocus?.(e);
        }}
        onBlur={(e) => {
          setIsFocused(false);
          props.onBlur?.(e);
        }}
        className={`
          w-full px-4 pt-6 pb-2 border border-ink-300 rounded-lg
          focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent
          transition-all duration-200 resize-none
          ${className}
        `}
        placeholder=""
      />
      <label
        htmlFor={textareaId}
        className={`
          absolute left-4 transition-all duration-200 pointer-events-none
          ${isFloating
            ? 'top-1.5 text-xs text-brand-600 font-medium'
            : 'top-4 text-base text-ink-500'
          }
        `}
      >
        {label}
        {required && <span className="text-bad-500 ml-1">*</span>}
      </label>
    </div>
  );
}
