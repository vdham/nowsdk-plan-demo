export type Severity = 'low' | 'medium' | 'high'

export type FindingExplanation = {
  explanation: string
  blastRadius: string
  remediation: string[]
}

export type Finding = {
  ruleId: string
  severity: Severity
  category: string
  resourceId: string
  message: string
  // Optional LLM-generated annotation. Never contributes to any
  // fingerprint — it's a UX overlay, not a risk decision.
  explanation?: FindingExplanation
}

export const SEVERITY_RANK: Record<Severity, number> = {
  low: 1,
  medium: 2,
  high: 3,
}

export function highestSeverity(findings: Finding[]): Severity | 'none' {
  let max: Severity | null = null
  for (const f of findings) {
    if (max === null || SEVERITY_RANK[f.severity] > SEVERITY_RANK[max]) {
      max = f.severity
    }
  }
  return max ?? 'none'
}
