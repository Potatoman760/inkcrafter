import React from 'react'

/** A stat's value inside its range, or an attribute bar in the cast editor. */
export function Meter({ value, min = 0, max = 100, tone = 'branch', className = '' }) {
  const ratio = max === min ? 0 : Math.min(1, Math.max(0, (value - min) / (max - min)))
  const colour = tone === 'branch' ? 'var(--accent-branch)'
    : tone === 'signal' ? 'var(--accent-signal)'
    : tone === 'caution' ? 'var(--accent-caution)' : 'var(--accent-alert)'
  return (
    <div className={['ic-meter', className].filter(Boolean).join(' ')} role="meter" aria-valuenow={value} aria-valuemin={min} aria-valuemax={max}>
      <div className="ic-meter__fill" style={{ width: `${ratio * 100}%`, background: colour }} />
    </div>
  )
}
