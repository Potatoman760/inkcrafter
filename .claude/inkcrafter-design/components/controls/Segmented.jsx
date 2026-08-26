import React from 'react'

/** 2–4 mutually exclusive options in one compact row. */
export function Segmented({ options, value, onChange, className = '', ...rest }) {
  return (
    <div className={['ic-segmented', className].filter(Boolean).join(' ')} role="tablist" {...rest}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="tab"
          aria-selected={option.value === value}
          className={option.value === value ? 'is-active' : ''}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}
