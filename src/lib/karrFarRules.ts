import type { Fault } from './types'

export const KARR_FAR_MAX_TIME_SECONDS = 60

export const KARR_FAR_SCORING_DESCRIPTION =
  'النتيجة من 4 نقاط للأسرع بدون أخطاء، ثم 3 و2 و1. نتيجة بخطأ واحد تحصل على 0.5 نقطة، ونتيجة بخطأين أو أكثر تحصل على 0 نقطة. تجاوز 60 ثانية يسجل يدوياً كخطأ وقت إضافي.'

export const KARR_FAR_DEFAULT_FAULTS: Fault[] = [
  {
    id: 'KF-TIME-001',
    name: 'الخطأ تجاوز الوقت المحدد',
    description: 'يضاف يدوياً عند تجاوز زمن المسار المحدد بـ 60 ثانية. من 0.01 إلى 2 ثانية إضافية تسجل كخطأ واحد.',
    penalty: 0.5,
    disqualifies: false,
    repeatable: true,
    active: true,
  },
]

export function cloneKarrFarFaults(): Fault[] {
  return KARR_FAR_DEFAULT_FAULTS.map((fault) => ({ ...fault }))
}

export function withDefaultKarrFarFaults(existing: Fault[] | undefined): Fault[] {
  const current = (Array.isArray(existing) ? existing : [])
    .filter((fault) => fault.id !== 'KF-TIME-OVERTIME')
    .map((fault) => fault.id === 'KF-TIME-001'
      ? { ...fault, name: 'الخطأ تجاوز الوقت المحدد', description: KARR_FAR_DEFAULT_FAULTS[0].description }
      : fault)
  const missingDefaults = cloneKarrFarFaults().filter((defaultFault) =>
    !current.some((fault) => fault.id === defaultFault.id)
  )
  return [...current, ...missingDefaults]
}
