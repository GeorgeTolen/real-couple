import type { ReactNode } from 'react'
import { Spinner } from '@fluentui/react-components'
import type { CriterionResult } from '../api'
import { AGREEMENT, answerLabel, answerTone } from '../format'

export function Loading() {
  return <div className="empty"><Spinner label="Загрузка" /></div>
}

export function ErrorBox({ message }: { message: string | null }) {
  return message ? <div className="error" role="alert">{message}</div> : null
}

type Answerable = Pick<CriterionResult, 'type' | 'scale'>

export function AnswerBadge({ item, answer }: { item: Answerable; answer: string }) {
  return <span className={`badge ${answerTone(item, answer)}`}>{answerLabel(answer)}</span>
}

export function ScaleBar({ item, answer }: { item: Answerable; answer: string }) {
  if (item.type !== 'scale' || !item.scale.length) return <span />
  const steps = item.scale.map((s) => s.value).filter((v) => v > 0).sort((a, b) => a - b)
  const value = answer === 'NA' ? -1 : Number(answer)
  const tone = answerTone(item, answer)
  return (
    <div className={`seg-scale ${tone === 'mid' ? 'mid' : ''}`} aria-hidden="true">
      {steps.map((step) => <i key={step} className={value >= step ? 'on' : ''} />)}
    </div>
  )
}

export function AgreementDots({ agreement }: { agreement: string }) {
  const second = agreement === 'full' ? 'var(--accent)' : agreement === 'single' ? 'var(--text-3)' : '#e2a227'
  return (
    <span className="dots" title={AGREEMENT[agreement] ?? agreement}>
      <i className="dot" style={{ background: 'var(--accent)' }} />
      <i className="dot" style={{ background: second }} />
    </span>
  )
}

export function Segments<T extends string>({ value, options, onChange }: {
  value: T
  options: { value: T; label: ReactNode }[]
  onChange: (value: T) => void
}) {
  return (
    <div className="segments">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className={option.value === value ? 'on' : ''}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}
