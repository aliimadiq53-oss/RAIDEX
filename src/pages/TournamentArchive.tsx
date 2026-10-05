import { useState } from 'react'
import type { JudgeResult, Player, Tournament, TournamentArchive } from '../lib/types'
import { compareTotalScoreAndTime, formatElapsedTime, getEffectiveScore, getRoundPosition, getTotalElapsedTime, parseTimeValue, recalculateRoundScores } from '../lib/scoring'

/* ─── helpers ─────────────────────────────────────────────── */
type ArchiveTab =
  | 'overview' | 'participants' | 'rounds'
  | 'ranking' | 'rules' | 'judges' | 'disqualifications'
  | 'appeals' | 'report'

const TABS: { id: ArchiveTab; label: string }[] = [
  { id: 'overview',         label: 'نظرة عامة' },
  { id: 'participants',     label: 'المشاركون' },
  { id: 'rounds',           label: 'الجولات' },
  { id: 'ranking',          label: 'الترتيب النهائي' },
  { id: 'rules',            label: 'القوانين' },
  { id: 'judges',           label: 'الحكام' },
  { id: 'disqualifications',label: 'الاستبعادات' },
  { id: 'appeals',          label: 'الاعتراضات' },
  { id: 'report',           label: 'التقرير' },
]


function computeFinalRanking(archive: TournamentArchive) {
  const totals: Record<string, { name: string; totalScore: number; totalFaults: number; totalTimeMs: number; hasMissingTime: boolean }> = {}
  const approvedResults = archive.results.filter((result) => result.status === 'approved')
  const approvedScores = recalculateRoundScores(approvedResults)
  for (const r of approvedResults) {
    const derivedScore = approvedScores.get(r.id) ?? 0
    if (!totals[r.competitionNumber]) {
      totals[r.competitionNumber] = { name: r.playerName, totalScore: 0, totalFaults: 0, totalTimeMs: 0, hasMissingTime: false }
    }
    totals[r.competitionNumber].totalScore += derivedScore
    totals[r.competitionNumber].totalFaults += r.faults.reduce((s, f) => s + f.count, 0)
    const elapsedMs = parseTimeValue(r.time)
    if (elapsedMs === null) totals[r.competitionNumber].hasMissingTime = true
    else totals[r.competitionNumber].totalTimeMs += elapsedMs
  }
  return Object.entries(totals)
    .map(([compNum, d]) => ({
      competitionNumber: compNum,
      ...d,
      totalTime: d.hasMissingTime ? '—' : formatElapsedTime(d.totalTimeMs),
    }))
    .sort((a, b) => compareTotalScoreAndTime(
      { totalScore: a.totalScore, totalTimeMs: a.hasMissingTime ? null : a.totalTimeMs, competitionNumber: a.competitionNumber },
      { totalScore: b.totalScore, totalTimeMs: b.hasMissingTime ? null : b.totalTimeMs, competitionNumber: b.competitionNumber },
    ))
}

function compareRoundResults(a: TournamentArchive['results'][number], b: TournamentArchive['results'][number]) {
  const statusOrder = { approved: 0, pending: 1, rejected: 2 }
  const statusDifference = statusOrder[a.status] - statusOrder[b.status]
  if (statusDifference !== 0) return statusDifference
  const scoreDifference = b.systemScore - a.systemScore
  if (scoreDifference !== 0) return scoreDifference

  const aTime = parseTimeValue(a.time)
  const bTime = parseTimeValue(b.time)
  if (aTime === null && bTime !== null) return 1
  if (aTime !== null && bTime === null) return -1
  return (aTime ?? 0) - (bTime ?? 0) || Number(a.competitionNumber) - Number(b.competitionNumber)
}

function getScoredRoundResults(results: TournamentArchive['results'], roundNumber: number) {
  const roundResults = results.filter((result) => result.roundNumber === roundNumber)
  const approvedResults = roundResults.filter((result) => result.status === 'approved')
  const approvedScores = recalculateRoundScores(approvedResults)
  return roundResults
    .map((result) => ({
      ...result,
      systemScore: result.status === 'approved' ? approvedScores.get(result.id) ?? 0 : 0,
    }))
    .sort(compareRoundResults)
}

function getResultStatusLabel(status: TournamentArchive['results'][number]['status']) {
  if (status === 'approved') return 'معتمدة'
  if (status === 'rejected') return 'مرفوضة'
  return 'بانتظار الاعتماد'
}

function getResultStatusClass(status: TournamentArchive['results'][number]['status']) {
  if (status === 'approved') return 'badge-green'
  if (status === 'rejected') return 'badge-red'
  return 'badge-orange'
}

/* ─── PDF Generator ────────────────────────────────────────── */
export function generatePDF(archive: TournamentArchive, sections: Set<string>) {
  const ranking = computeFinalRanking(archive)
  const top3 = ranking.slice(0, 3)
  const uniqueRounds = [...new Set(archive.results.map((r) => r.roundNumber))].sort()

  const html = `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
<meta charset="UTF-8">
<title>${archive.name} — التقرير الرسمي</title>
<style>
  @font-face { font-family: 'Thmanyah Sans'; src: url('https://framerusercontent.com/assets/x6EBzvXf1Fi35XhsRoHxePDVo.woff2') format('woff2'); font-style: normal; font-weight: 400; font-display: swap; }
  @font-face { font-family: 'Thmanyah Sans'; src: url('https://framerusercontent.com/assets/LZvgFRUsP7pGWYj3tKxMUrKuhSY.woff2') format('woff2'); font-style: normal; font-weight: 700; font-display: swap; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Thmanyah Sans', sans-serif; color: #1C1A17; background: white; direction: rtl; }
  .page { width: 210mm; min-height: 297mm; margin: 0 auto; padding: 0; }
  @media print {
    body { margin: 0; }
    .page { margin: 0; page-break-after: always; }
    .section { page-break-inside: avoid; }
    @page { margin: 18mm 15mm; size: A4; }
  }
  .cover { background: #1C1A17; color: white; min-height: 297mm; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; padding: 40mm 20mm; position: relative; overflow: hidden; }
  .cover::before { content: 'RIDEX'; position: absolute; font-size: 160px; font-weight: 900; color: rgba(255,255,255,0.04); top: 50%; left: 50%; transform: translate(-50%,-50%); white-space: nowrap; pointer-events: none; }
  .cover-mark { font-size: 11px; letter-spacing: 0.35em; text-transform: uppercase; color: #8D381F; margin-bottom: 20px; }
  .cover-title { font-size: 36px; font-weight: 900; color: white; margin-bottom: 12px; line-height: 1.3; }
  .cover-sub { font-size: 16px; color: rgba(255,255,255,0.5); margin-bottom: 8px; }
  .cover-official { margin-top: 40px; font-size: 13px; color: rgba(255,255,255,0.35); border-top: 1px solid rgba(255,255,255,0.1); padding-top: 24px; }
  .page-header { display: flex; align-items: center; justify-content: space-between; padding: 8px 0 10px; border-bottom: 1.5px solid #8D381F; margin-bottom: 24px; }
  .page-header-brand { font-size: 11px; font-weight: 900; letter-spacing: 0.2em; color: #8D381F; text-transform: uppercase; }
  .page-header-title { font-size: 10px; color: #9B9086; }
  .inner { padding: 20mm 15mm; }
  .section { margin-bottom: 32px; }
  .section-title { font-size: 18px; font-weight: 900; color: #1C1A17; margin-bottom: 16px; padding-bottom: 8px; border-bottom: 2px solid #ECE4D3; }
  .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  .info-item { background: #F5F0E8; border-radius: 8px; padding: 12px 16px; }
  .info-label { font-size: 10px; color: #9B9086; margin-bottom: 4px; }
  .info-value { font-size: 13px; font-weight: 700; color: #1C1A17; }
  table { width: 100%; border-collapse: collapse; font-size: 11px; }
  th { background: #1C1A17; color: white; padding: 8px 12px; text-align: right; font-weight: 700; font-size: 10px; }
  td { padding: 8px 12px; border-bottom: 1px solid #ECE4D3; vertical-align: top; }
  tr:nth-child(even) td { background: #F5F0E8; }
  .badge { display: inline-block; padding: 2px 8px; border-radius: 20px; font-size: 9px; font-weight: 700; }
  .badge-green { background: #dcfce7; color: #166534; }
  .badge-red { background: #fee2e2; color: #991b1b; }
  .badge-orange { background: #ffedd5; color: #9a3412; }
  .winners { display: grid; grid-template-columns: 1fr 2fr 1fr; gap: 16px; align-items: end; text-align: center; margin: 24px 0; }
  .winner-card { background: #F5F0E8; border-radius: 12px; padding: 20px 12px; }
  .winner-card.first { background: #1C1A17; color: white; padding: 28px 12px; }
  .winner-rank { font-size: 28px; font-weight: 900; margin-bottom: 8px; }
  .winner-rank.gold { color: #F59E0B; }
  .winner-rank.silver { color: #94A3B8; }
  .winner-rank.bronze { color: #92400E; }
  .winner-name { font-size: 13px; font-weight: 900; margin-bottom: 4px; }
  .winner-score { font-size: 11px; opacity: 0.6; }
  .page-footer { position: fixed; bottom: 10mm; left: 15mm; right: 15mm; display: flex; justify-content: space-between; font-size: 8px; color: #9B9086; border-top: 1px solid #ECE4D3; padding-top: 4px; }
  .fault-chip { display: inline-block; background: #fee2e2; color: #991b1b; border-radius: 4px; padding: 1px 6px; font-size: 9px; margin: 1px; }
</style>
</head>
<body>
<div class="page cover">
  <p class="cover-mark">RIDEX · نظام إدارة البطولات</p>
  <h1 class="cover-title">${archive.name}</h1>
  <p class="cover-sub">${archive.type} · ${archive.location}</p>
  <p class="cover-sub">${archive.date}</p>
  <div class="cover-official">
    <p style="color:rgba(255,255,255,0.6);font-weight:700;margin-bottom:6px;">التقرير الرسمي للبطولة</p>
    <p>إصدار التقرير: ${archive.reportVersion} · تاريخ الإصدار: ${new Date().toLocaleDateString('ar-IQ')}</p>
    <p style="margin-top:4px;">تاريخ الأرشفة: ${archive.archivedAt} · بواسطة: ${archive.archivedBy}</p>
  </div>
</div>

${sections.has('info') ? `
<div class="page inner">
  <div class="page-header"><span class="page-header-brand">منصة رايد إكس</span><span class="page-header-title">${archive.name}</span></div>
  <div class="section">
    <h2 class="section-title">معلومات البطولة</h2>
    <div class="info-grid">
      <div class="info-item"><div class="info-label">اسم البطولة</div><div class="info-value">${archive.name}</div></div>
      <div class="info-item"><div class="info-label">نوع البطولة</div><div class="info-value">${archive.type}</div></div>
      <div class="info-item"><div class="info-label">التاريخ</div><div class="info-value">${archive.date}</div></div>
      <div class="info-item"><div class="info-label">المكان</div><div class="info-value">${archive.location}</div></div>
      <div class="info-item"><div class="info-label">عدد الجولات</div><div class="info-value">${archive.totalRounds} جولات</div></div>
      <div class="info-item"><div class="info-label">عدد المشاركين</div><div class="info-value">${archive.participantCount} مشارك</div></div>
      <div class="info-item"><div class="info-label">الحكام</div><div class="info-value">${archive.judgeNames.join(' · ') || 'غير محدد'}</div></div>
      <div class="info-item"><div class="info-label">نظام الاحتساب</div><div class="info-value">${archive.rulesetSnapshot.name}</div></div>
    </div>
    <p style="margin-top:16px;font-size:12px;color:#9B9086;line-height:1.8;">${archive.description || 'لا توجد ملاحظات إضافية.'}</p>
  </div>
</div>` : ''}

${sections.has('rules') ? `
<div class="page inner">
  <div class="page-header"><span class="page-header-brand">منصة رايد إكس</span><span class="page-header-title">القوانين ونظام الاحتساب</span></div>
  <div class="section">
    <h2 class="section-title">القوانين المستخدمة — Snapshot مؤرشف</h2>
    <div class="info-item" style="margin-bottom:16px;">
      <div class="info-label">تاريخ حفظ النسخة</div>
      <div class="info-value">${archive.rulesetSnapshot.snapshotAt || 'غير محدد'}</div>
    </div>
    <p style="font-size:13px;font-weight:700;margin-bottom:8px;">${archive.rulesetSnapshot.name}</p>
    <p style="font-size:12px;color:#4B4540;margin-bottom:16px;">${archive.rulesetSnapshot.description || 'لا يوجد وصف.'}</p>
    <div class="info-item" style="margin-bottom:16px;">
      <div class="info-label">نظام الاحتساب</div>
      <div class="info-value" style="font-weight:500;margin-top:4px;">${archive.rulesetSnapshot.scoringDescription || 'غير محدد'}</div>
    </div>
    <h3 style="font-size:14px;font-weight:700;margin:16px 0 8px;">الأخطاء والعقوبات</h3>
    <table>
      <tr><th>الخطأ</th><th>يُستبعد</th><th>قابل للتكرار</th></tr>
      ${archive.rulesetSnapshot.faults.map((f) => `
      <tr>
        <td>${f.name}</td>
        <td><span class="badge ${f.disqualifies ? 'badge-red' : 'badge-green'}">${f.disqualifies ? 'نعم' : 'لا'}</span></td>
        <td>${f.repeatable ? 'نعم' : 'لا'}</td>
      </tr>`).join('') || '<tr><td colspan="3">لا توجد أخطاء مسجلة</td></tr>'}
    </table>
  </div>
</div>` : ''}

${sections.has('participants') ? `
<div class="page inner">
  <div class="page-header"><span class="page-header-brand">منصة رايد إكس</span><span class="page-header-title">قائمة المشاركين</span></div>
  <div class="section">
    <h2 class="section-title">قائمة المشاركين (${archive.participants.length})</h2>
    <table>
      <tr><th>رقم المشاركة</th><th>اسم اللاعب</th><th>الخيل</th><th>الفئة</th><th>الحالة</th></tr>
      ${archive.participants.map((p) => `
      <tr>
        <td style="font-weight:700;text-align:center;">${p.competitionNumber}</td>
        <td style="font-weight:700;">${p.playerName}</td>
        <td>${p.horseName}</td>
        <td>${p.category}</td>
        <td><span class="badge ${p.status === 'active' ? 'badge-green' : p.status === 'disqualified' ? 'badge-red' : 'badge-orange'}">${p.status === 'active' ? 'نشط' : p.status === 'disqualified' ? 'مستبعد' : 'منسحب'}</span></td>
      </tr>`).join('') || '<tr><td colspan="5">لا يوجد مشاركون مسجلون</td></tr>'}
    </table>
  </div>
</div>` : ''}

${sections.has('rounds') ? uniqueRounds.map((rn) => {
  const roundResults = getScoredRoundResults(archive.results, rn)
  const roundTopThree = roundResults.filter((result) => result.status === 'approved' && getRoundPosition(result, roundResults.filter((entry) => entry.status === 'approved')) <= 3)
  const rName = roundResults[0]?.roundName ?? `الجولة ${rn}`
  return `
<div class="page inner">
  <div class="page-header"><span class="page-header-brand">منصة رايد إكس</span><span class="page-header-title">${rName}</span></div>
  <div class="section">
    <h2 class="section-title">${rName} — الجولة رقم ${rn}</h2>
    ${roundTopThree.length > 0 ? `<div class="winners">${roundTopThree.map((r, index) => `
      <div class="winner-card ${index === 0 ? 'first' : ''}">
        <div class="winner-rank ${getRoundPosition(r, roundResults)}">${getRoundPosition(r, roundResults)}</div>
        <div class="winner-name">${r.playerName}</div>
        <div class="winner-score">${r.systemScore} نقطة · ${r.time}</div>
      </div>`).join('')}</div>` : ''}
    <table>
      <tr><th>رقم</th><th>الفارس</th><th>الوقت</th><th>الأخطاء</th><th>النقاط</th><th>الحالة</th><th>الحكم</th></tr>
      ${roundResults.map((r) => `
      <tr>
        <td style="font-weight:700;text-align:center;">${r.competitionNumber}</td>
        <td style="font-weight:700;">${r.playerName}</td>
        <td style="font-family:monospace;">${r.time}</td>
        <td>${r.faults.length === 0 ? '—' : r.faults.map(f => `<span class="fault-chip">${f.name} ×${f.count}</span>`).join('')}</td>
        <td style="font-weight:900;color:#8D381F;">${r.systemScore}</td>
        <td><span class="badge ${getResultStatusClass(r.status)}">${getResultStatusLabel(r.status)}</span></td>
        <td style="font-size:10px;">${r.judgeName}</td>
      </tr>`).join('') || '<tr><td colspan="7">لا توجد نتائج لهذه الجولة</td></tr>'}
    </table>
  </div>
</div>`
}).join('') : ''}

${sections.has('ranking') ? `
<div class="page inner">
  <div class="page-header"><span class="page-header-brand">منصة رايد إكس</span><span class="page-header-title">الترتيب النهائي</span></div>
  <div class="section">
    <h2 class="section-title">الترتيب النهائي — ${archive.name}</h2>
    ${top3.length >= 3 ? `
    <div class="winners">
      <div class="winner-card">
        <div class="winner-rank silver">2</div>
        <div class="winner-name">${top3[1]?.name}</div>
        <div class="winner-score">${top3[1]?.totalScore} نقطة</div>
        <div class="winner-score">${top3[1]?.totalTime} إجمالي</div>
      </div>
      <div class="winner-card first">
        <div class="winner-rank gold">1</div>
        <div class="winner-name">${top3[0]?.name}</div>
        <div class="winner-score">${top3[0]?.totalScore} نقطة</div>
        <div class="winner-score">${top3[0]?.totalTime} إجمالي</div>
      </div>
      <div class="winner-card">
        <div class="winner-rank bronze">3</div>
        <div class="winner-name">${top3[2]?.name}</div>
        <div class="winner-score">${top3[2]?.totalScore} نقطة</div>
        <div class="winner-score">${top3[2]?.totalTime} إجمالي</div>
      </div>
    </div>` : ''}
    <table>
      <tr><th>المركز</th><th>رقم</th><th>الفارس</th><th>مجموع النقاط</th><th>إجمالي الأخطاء</th><th>إجمالي الوقت</th></tr>
      ${computeFinalRanking(archive).map((r, i) => `
      <tr>
        <td style="font-weight:900;font-size:16px;color:${i===0?'#F59E0B':i===1?'#94A3B8':i===2?'#92400E':'#9B9086'};text-align:center;">${i+1}</td>
        <td style="font-weight:700;text-align:center;">${r.competitionNumber}</td>
        <td style="font-weight:700;">${r.name}</td>
        <td style="font-weight:900;color:#8D381F;text-align:center;">${r.totalScore}</td>
        <td style="text-align:center;">${r.totalFaults}</td>
        <td style="font-family:monospace;">${r.totalTime}</td>
      </tr>`).join('') || '<tr><td colspan="6">لا توجد بيانات ترتيب نهائي</td></tr>'}
    </table>
  </div>
</div>` : ''}

${sections.has('disqualifications') && archive.disqualifications.length > 0 ? `
<div class="page inner">
  <div class="page-header"><span class="page-header-brand">منصة رايد إكس</span><span class="page-header-title">حالات الاستبعاد</span></div>
  <div class="section">
    <h2 class="section-title">حالات الاستبعاد (${archive.disqualifications.length})</h2>
    <table>
      <tr><th>رقم</th><th>اللاعب</th><th>الجولة</th><th>السبب</th><th>بواسطة</th><th>التاريخ</th></tr>
      ${archive.disqualifications.map((d) => `
      <tr>
        <td style="font-weight:700;">${d.competitionNumber}</td>
        <td style="font-weight:700;">${d.playerName}</td>
        <td>${d.roundName}</td>
        <td style="font-size:10px;">${d.reason}</td>
        <td>${d.by}</td>
        <td style="font-size:10px;">${d.at}</td>
      </tr>`).join('')}
    </table>
  </div>
</div>` : ''}

${sections.has('appeals') ? `
<div class="page inner">
  <div class="page-header"><span class="page-header-brand">منصة رايد إكس</span><span class="page-header-title">الاعتراضات والتعديلات</span></div>
  <div class="section">
    <h2 class="section-title">الاعتراضات والتعديلات (${archive.appeals.length})</h2>
    <table>
      <tr><th>رقم</th><th>اللاعب</th><th>الجولة</th><th>الاعتراض</th><th>الحالة</th><th>القرار</th><th>التاريخ</th></tr>
      ${archive.appeals.map((a) => `
      <tr>
        <td style="font-weight:700;text-align:center;">${a.competitionNumber}</td>
        <td style="font-weight:700;">${a.playerName}</td>
        <td>${a.roundName || '—'}</td>
        <td style="font-size:10px;">${a.text}</td>
        <td><span class="badge ${a.status === 'pending' ? 'badge-orange' : a.status === 'reviewed' ? 'badge-green' : 'badge-red'}">${a.status === 'pending' ? 'قيد المراجعة' : a.status === 'reviewed' ? 'تمت المراجعة' : 'مرفوض'}</span></td>
        <td style="font-size:10px;">${a.adminResponse || '—'}</td>
        <td style="font-size:10px;">${a.submittedAt}</td>
      </tr>`).join('') || '<tr><td colspan="7">لا توجد اعتراضات مسجلة</td></tr>'}
    </table>
  </div>
</div>` : ''}

<div class="page-footer">
  <span>تم إنشاء هذا التقرير بواسطة نظام رايد إكس لإدارة البطولات</span>
  <span>${archive.name} · إصدار ${archive.reportVersion}</span>
</div>

</body>
</html>`

  const win = window.open('', '_blank')
  if (!win) return
  win.document.write(html)
  win.document.close()
  win.onload = () => setTimeout(() => win.print(), 400)
}

/* ─── PDF Export Modal ─────────────────────────────────────── */
interface ExportModalProps {
  archive: TournamentArchive
  onClose: () => void
}

function ExportModal({ archive, onClose }: ExportModalProps) {
  const [selected, setSelected] = useState<Set<string>>(
    new Set(['info', 'rules', 'participants', 'rounds', 'ranking', 'disqualifications', 'appeals'])
  )

  const toggle = (key: string) =>
    setSelected((prev) => { const s = new Set(prev); s.has(key) ? s.delete(key) : s.add(key); return s })

  const allKeys = ['info', 'rules', 'participants', 'rounds', 'ranking', 'disqualifications', 'appeals']
  const labels: Record<string, string> = {
    info: 'معلومات البطولة', rules: 'القوانين ونظام الاحتساب', participants: 'قائمة المشاركين',
    rounds: 'نتائج الجولات (كل جولة)', ranking: 'الترتيب النهائي والفائزون',
    disqualifications: 'حالات الاستبعاد', appeals: 'الاعتراضات والتعديلات',
  }

  return (
    <div className="fixed inset-0 bg-charcoal/60 z-50 flex items-center justify-center px-4" onClick={onClose}>
      <div className="bg-surface border border-line rounded-xl p-6 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-charcoal font-black text-lg">تصدير ملف PDF</h3>
          <button onClick={onClose} className="text-muted-text hover:text-warm-gray text-xl">×</button>
        </div>

        <p className="text-muted-text text-sm mb-4 font-serif">اختر أقسام التقرير</p>

        <div className="space-y-2 mb-6">
          <button
            onClick={() => setSelected(selected.size === allKeys.length ? new Set() : new Set(allKeys))}
            className="w-full text-right text-xs text-brand font-bold mb-1 hover:underline"
          >
            {selected.size === allKeys.length ? 'إلغاء تحديد الكل' : 'تحديد الكل'}
          </button>
          {allKeys.map((key) => (
            <label key={key} className="flex items-center gap-3 cursor-pointer group">
              <div
                onClick={() => toggle(key)}
                className={`w-5 h-5 rounded border flex items-center justify-center transition-colors shrink-0 ${selected.has(key) ? 'bg-brand border-brand' : 'border-line bg-ivory'}`}
              >
                {selected.has(key) && <span className="text-ivory text-xs font-black">✓</span>}
              </div>
              <span className="text-charcoal text-sm group-hover:text-brand transition-colors">{labels[key]}</span>
            </label>
          ))}
        </div>

        <div className="flex gap-3">
          <button
            onClick={() => { generatePDF(archive, selected); onClose() }}
            disabled={selected.size === 0}
            className="flex-1 bg-brand text-ivory py-3 font-black text-sm rounded-lg hover:bg-brand-hover transition-colors disabled:opacity-40"
          >
            تصدير PDF ←
          </button>
          <button onClick={onClose} className="border border-line text-muted-text text-sm px-4 py-3 rounded-lg hover:bg-sand transition-colors">
            إلغاء
          </button>
        </div>
        <p className="text-muted-text/50 text-[10px] text-center mt-3 font-serif">سيفتح مربع الطباعة — اختر "حفظ كـ PDF"</p>
      </div>
    </div>
  )
}

/* ─── Archived Tournament Detail ───────────────────────────── */
function ArchivedDetail({ archive, onBack }: { archive: TournamentArchive; onBack: () => void }) {
  const [tab, setTab] = useState<ArchiveTab>('overview')
  const [showExport, setShowExport] = useState(false)
  const ranking = computeFinalRanking(archive)
  const uniqueRounds = [...new Set(archive.results.map((r) => r.roundNumber))].sort()

  return (
    <div className="p-6 max-w-6xl">
      {showExport && <ExportModal archive={archive} onClose={() => setShowExport(false)} />}

      {/* Header */}
      <div className="flex items-start justify-between mb-6 gap-4">
        <div>
          <button onClick={onBack} className="text-muted-text text-xs hover:text-warm-gray transition-colors mb-3 flex items-center gap-1">
            ← أرشيف البطولات
          </button>
          <div className="flex items-center gap-3 mb-1">
            <span className="bg-charcoal/10 text-charcoal text-[10px] font-black px-2 py-0.5 rounded">مؤرشفة</span>
            <span className="text-muted-text text-xs font-serif">إصدار {archive.reportVersion}</span>
          </div>
          <h1 className="text-charcoal text-2xl font-black">{archive.name}</h1>
          <p className="text-muted-text text-sm font-serif">{archive.type} · {archive.location} · {archive.date}</p>
        </div>
        <button
          onClick={() => setShowExport(true)}
          className="shrink-0 bg-brand text-ivory text-sm font-black px-5 py-2.5 rounded-lg hover:bg-brand-hover transition-colors flex items-center gap-2"
        >
          تصدير PDF ↓
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-0 border-b border-line mb-6 overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2.5 text-xs font-semibold border-b-2 -mb-px transition-colors whitespace-nowrap ${tab === t.id ? 'text-brand border-brand' : 'text-muted-text border-transparent hover:text-warm-gray'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* OVERVIEW */}
      {tab === 'overview' && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {[
            { label: 'إجمالي المشاركين', value: archive.participantCount },
            { label: 'عدد الجولات', value: archive.totalRounds },
            { label: 'الحكام', value: archive.judgeNames.length },
            { label: 'إجمالي النتائج', value: archive.results.length },
          ].map((s) => (
            <div key={s.label} className="bg-surface border border-line rounded-xl p-4">
              <p className="text-muted-text text-xs font-serif mb-1">{s.label}</p>
              <p className="text-charcoal text-3xl font-black">{s.value}</p>
            </div>
          ))}
          <div className="col-span-2 lg:col-span-4 bg-surface border border-line rounded-xl p-5">
            <p className="text-muted-text text-xs font-serif mb-3">الفائز — المركز الأول</p>
            {ranking[0] && (
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-amber-400/15 border border-amber-400/30 flex items-center justify-center">
                  <span className="text-amber-500 font-black text-xl">1</span>
                </div>
                <div>
                  <p className="text-charcoal font-black text-xl">{ranking[0].name}</p>
                  <p className="text-muted-text text-sm font-serif">{ranking[0].totalScore} نقطة · إجمالي الوقت {ranking[0].totalTime} · رقم {ranking[0].competitionNumber}</p>
                </div>
              </div>
            )}
          </div>
          <div className="col-span-2 lg:col-span-4 bg-sand/40 border border-line rounded-xl p-4">
            <p className="text-muted-text text-xs font-serif mb-1">تفاصيل الأرشفة</p>
            <p className="text-charcoal text-sm">أُرشف بواسطة <strong>{archive.archivedBy}</strong> في {archive.archivedAt}</p>
          </div>
        </div>
      )}

      {/* PARTICIPANTS */}
      {tab === 'participants' && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-sand/60 border border-b-0 border-line text-muted-text text-xs font-serif uppercase tracking-wider">
                <th className="px-4 py-3 text-right font-normal">رقم</th>
                <th className="px-4 py-3 text-right font-normal">الفارس</th>
                <th className="px-4 py-3 text-right font-normal">الخيل</th>
                <th className="px-4 py-3 text-right font-normal">الفئة</th>
                <th className="px-4 py-3 text-right font-normal">الحالة</th>
              </tr>
            </thead>
            <tbody className="border border-t-0 border-line rounded-b-lg">
              {archive.participants.map((p, i) => (
                <tr key={p.competitionNumber} className={`${i < archive.participants.length - 1 ? 'border-b border-line/60' : ''} hover:bg-sand/30`}>
                  <td className="px-4 py-3 font-serif text-lg text-muted-text/40">{p.competitionNumber}</td>
                  <td className="px-4 py-3 font-bold text-charcoal">{p.playerName}</td>
                  <td className="px-4 py-3 text-warm-gray font-serif">{p.horseName}</td>
                  <td className="px-4 py-3 text-muted-text">{p.category}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-bold px-2 py-1 rounded-full ${p.status === 'active' ? 'bg-green-600/10 text-green-700' : 'bg-red-500/10 text-red-600'}`}>
                      {p.status === 'active' ? 'نشط' : 'مستبعد'}
                    </span>
                    {p.disqualifiedReason && <p className="text-muted-text text-xs mt-1">{p.disqualifiedReason}</p>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ROUNDS */}
      {tab === 'rounds' && (
        <div className="space-y-8">
          {uniqueRounds.map((rn) => {
            const rResults = getScoredRoundResults(archive.results, rn)
            const approvedRoundResults = rResults.filter((result) => result.status === 'approved')
            const roundTopThree = approvedRoundResults.filter((result) => getRoundPosition(result, approvedRoundResults) <= 3)
            const rName = rResults[0]?.roundName ?? `الجولة ${rn}`
            return (
              <div key={rn}>
                <p className="font-serif text-[11px] tracking-[0.3em] uppercase text-muted-text mb-2">الجولة {rn}</p>
                <h3 className="text-charcoal text-lg font-black mb-4">{rName}</h3>
                {roundTopThree.length > 0 && (
                  <div className="mb-5 grid gap-3 sm:grid-cols-3">
                    {roundTopThree.map((result) => {
                      const position = getRoundPosition(result, approvedRoundResults)
                      return <div key={result.id} className={`rounded-lg border p-4 ${position === 1 ? 'border-amber-300 bg-amber-50/70' : 'border-line bg-white'}`}>
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-muted-text text-xs font-serif">المركز {position}</span>
                          <span className="text-muted-text text-xs font-serif">رقم {result.competitionNumber}</span>
                        </div>
                        <p className="mt-2 font-black text-charcoal">{result.playerName}</p>
                        <p className="mt-1 text-sm font-serif text-brand">{result.systemScore} نقطة · {result.time}</p>
                      </div>
                    })}
                  </div>
                )}
                <div className="border border-line rounded-xl overflow-hidden">
                  <div className="grid grid-cols-12 gap-2 px-4 py-2 bg-sand/60 text-muted-text text-xs font-serif uppercase tracking-wide">
                    <div className="col-span-1">رقم</div>
                    <div className="col-span-3">الفارس</div>
                    <div className="col-span-2">الوقت</div>
                    <div className="col-span-2">الأخطاء</div>
                    <div className="col-span-1 text-center">النقاط</div>
                    <div className="col-span-1">الحالة</div>
                    <div className="col-span-2">الحكم</div>
                  </div>
                  {rResults.map((r, i) => (
                    <div key={r.competitionNumber + rn} className={`grid grid-cols-12 gap-2 px-4 py-3 items-center ${i < rResults.length - 1 ? 'border-b border-line/50' : ''} hover:bg-sand/20`}>
                      <div className="col-span-1 font-serif text-muted-text/40 text-lg">{r.competitionNumber}</div>
                      <div className="col-span-3 font-bold text-charcoal text-sm">{r.playerName}</div>
                      <div className="col-span-2 font-serif tabular-nums text-sm text-warm-gray">{r.time}</div>
                      <div className="col-span-2 text-xs text-muted-text">{r.faults.length === 0 ? '—' : r.faults.map((f) => `${f.name} ×${f.count}`).join(', ')}</div>
                      <div className="col-span-1 text-center font-black text-brand">{r.status === 'approved' ? r.systemScore : '—'}</div>
                      <div className="col-span-1 text-[10px] text-muted-text">{getResultStatusLabel(r.status)}</div>
                      <div className="col-span-2 text-xs text-muted-text font-serif">{r.judgeName}</div>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* RANKING */}
      {tab === 'ranking' && (
        <div>
          {/* Podium */}
          {ranking.length >= 3 && (
            <div className="flex items-end justify-center gap-4 mb-10">
              {[1, 0, 2].map((pos) => {
                const r = ranking[pos]
                const medals = ['text-amber-500 border-amber-400/30 bg-amber-400/10', 'text-slate-400 border-slate-300/20 bg-slate-300/8', 'text-amber-700 border-amber-700/20 bg-amber-700/8']
                const labels = ['المركز الأول', 'المركز الثاني', 'المركز الثالث']
                const heights = ['h-36', 'h-44', 'h-28']
                return (
                  <div key={pos} className={`flex-1 max-w-[180px] border ${medals[pos]} rounded-xl p-4 text-center ${heights[pos]} flex flex-col items-center justify-center`}>
                    <p className={`font-black text-3xl mb-1 ${medals[pos].split(' ')[0]}`}>{pos + 1}</p>
                    <p className="text-charcoal font-black text-sm">{r?.name}</p>
                    <p className="text-muted-text text-xs font-serif">{r?.totalScore} نقطة · {r?.totalTime}</p>
                    <p className="text-muted-text/50 text-[10px] mt-0.5">{labels[pos]}</p>
                  </div>
                )
              })}
            </div>
          )}
          <div className="border border-line rounded-xl overflow-hidden">
            {ranking.map((r, i) => (
              <div key={r.competitionNumber} className={`flex items-center gap-4 px-5 py-3.5 ${i < ranking.length - 1 ? 'border-b border-line/50' : ''} ${i < 3 ? 'bg-sand/30' : ''} hover:bg-sand/20`}>
                <span className={`font-black text-xl w-8 text-center ${i === 0 ? 'text-amber-500' : i === 1 ? 'text-slate-400' : i === 2 ? 'text-amber-700' : 'text-muted-text/40'}`}>{i + 1}</span>
                <span className="font-serif text-2xl text-muted-text/25 w-8">{r.competitionNumber}</span>
                <span className="flex-1 font-bold text-charcoal">{r.name}</span>
                <span className="font-black text-brand text-xl tabular-nums">{r.totalScore}</span>
                <span className="text-muted-text text-xs font-serif w-16 text-left">{r.totalFaults} أخطاء</span>
                <span className="font-serif text-sm text-warm-gray tabular-nums w-24 text-left" title="إجمالي الوقت">{r.totalTime}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* RULES */}
      {tab === 'rules' && (
        <div>
          <div className="bg-amber-500/8 border border-amber-500/20 rounded-lg px-4 py-3 mb-6 text-sm text-amber-700">
            هذه نسخة القوانين المحفوظة (Snapshot) وقت إجراء البطولة — محمية من التعديل.
          </div>
          <div className="grid grid-cols-2 gap-4 mb-6">
            {[
              { label: 'اسم النظام', v: archive.rulesetSnapshot.name },
              { label: 'تاريخ حفظ النسخة', v: archive.rulesetSnapshot.snapshotAt },
            ].map((s) => (
              <div key={s.label} className="bg-surface border border-line rounded-xl p-4">
                <p className="text-muted-text text-xs font-serif mb-1">{s.label}</p>
                <p className="text-charcoal font-bold text-sm">{s.v}</p>
              </div>
            ))}
          </div>
          <div className="bg-surface border border-line rounded-xl p-5 mb-6">
            <p className="text-muted-text text-xs font-serif mb-1">نظام الاحتساب</p>
            <p className="text-charcoal font-semibold text-sm">{archive.rulesetSnapshot.scoringDescription}</p>
          </div>
          <h3 className="text-charcoal font-black mb-3">الأخطاء والعقوبات</h3>
          <div className="border border-line rounded-xl overflow-hidden">
            {archive.rulesetSnapshot.faults.map((f, i) => (
              <div key={f.id} className={`flex items-center gap-4 px-5 py-3.5 ${i < archive.rulesetSnapshot.faults.length - 1 ? 'border-b border-line' : ''}`}>
                <span className="flex-1 text-charcoal text-sm font-semibold">{f.name}</span>
                <span className={`text-xs font-bold px-3 py-1 rounded-full ${f.disqualifies ? 'bg-red-500/10 text-red-600' : 'bg-green-600/10 text-green-700'}`}>
                  {f.disqualifies ? 'يُستبعد' : 'لا يُستبعد'}
                </span>
                <span className="text-muted-text text-xs font-serif">{f.repeatable ? 'قابل للتكرار' : 'مرة واحدة'}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* JUDGES */}
      {tab === 'judges' && (
        <div className="space-y-3">
          {archive.judgeNames.map((name) => {
            const judgeResults = archive.results.filter((r) => r.judgeName === name)
            return (
              <div key={name} className="bg-surface border border-line rounded-xl p-5 flex items-center gap-5">
                <div className="w-10 h-10 rounded-full bg-sand flex items-center justify-center shrink-0">
                  <span className="text-charcoal font-black text-sm">{name[0]}</span>
                </div>
                <div className="flex-1">
                  <p className="text-charcoal font-black text-base">{name}</p>
                  <p className="text-muted-text text-xs font-serif">حكم معتمد</p>
                </div>
                <div className="text-center">
                  <p className="text-charcoal font-black text-2xl">{judgeResults.length}</p>
                  <p className="text-muted-text text-xs font-serif">نتيجة أُدخلت</p>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* DISQUALIFICATIONS */}
      {tab === 'disqualifications' && (
        archive.disqualifications.length === 0 ? (
          <div className="text-center py-16 border border-dashed border-line rounded-xl">
            <p className="text-muted-text">لا توجد استبعادات في هذه البطولة</p>
          </div>
        ) : (
          <div className="space-y-3">
            {archive.disqualifications.map((d, i) => (
              <div key={i} className="bg-orange-500/5 border border-orange-500/20 rounded-xl p-5">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <p className="text-charcoal font-black">{d.playerName}</p>
                    <p className="text-muted-text text-xs font-serif">رقم المشاركة {d.competitionNumber} · {d.roundName}</p>
                  </div>
                  <span className="text-orange-600 text-xs font-bold bg-orange-500/10 px-3 py-1 rounded-full">مستبعد</span>
                </div>
                <p className="text-charcoal text-sm mb-2">{d.reason}</p>
                <p className="text-muted-text text-xs font-serif">بواسطة: {d.by} · {d.at}</p>
              </div>
            ))}
          </div>
        )
      )}

      {/* REPORT */}
      {tab === 'report' && (
        <div className="text-center py-16">
          <div className="w-20 h-20 rounded-full bg-brand/10 border border-brand/20 flex items-center justify-center mx-auto mb-6">
            <span className="text-brand text-3xl">📄</span>
          </div>
          <h2 className="text-charcoal text-xl font-black mb-2">التقرير الرسمي للبطولة</h2>
          <p className="text-muted-text text-sm font-serif mb-2">{archive.name}</p>
          <p className="text-muted-text/60 text-xs font-serif mb-8">إصدار {archive.reportVersion} · أُرشف: {archive.archivedAt}</p>
          <button
            onClick={() => setShowExport(true)}
            className="bg-brand text-ivory text-base font-black px-8 py-4 rounded-xl hover:bg-brand-hover transition-colors"
          >
            تصدير PDF ↓
          </button>
          <p className="text-muted-text/40 text-xs mt-4 font-serif">يُفتح مربع طباعة المتصفح — اختر "حفظ كـ PDF"</p>
        </div>
      )}
    </div>
  )
}

/* ─── Archive List View ────────────────────────────────────── */
export default function TournamentArchiveView({ onSelectDetail, tournaments = [], judgeResults = [], players = [], appeals = [] }: { onSelectDetail?: (id: string) => void; tournaments?: Tournament[]; judgeResults?: JudgeResult[]; players?: Player[]; appeals?: Array<{ id: string; tournamentId: string; competitionNumber: string; playerName: string; roundName?: string; text: string; status: 'pending' | 'reviewed' | 'dismissed'; submittedAt: string; reviewedBy?: string; adminResponse?: string }> }) {
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const cloudArchives: TournamentArchive[] = tournaments
    .filter((tournament) => tournament.status === 'completed' || tournament.status === 'archived')
    .map((tournament) => {
      const tournamentResults = judgeResults.filter((result) => result.tournamentId === tournament.id)
      const tournamentAppeals = appeals.filter((appeal) => appeal.tournamentId === tournament.id)
      const tournamentParticipants = (tournament.participants ?? []).map((participant) => ({
        competitionNumber: participant.competitionNumber,
        playerName: players.find((player) => player.id === participant.playerId)?.name ?? participant.playerId,
        playerId: participant.playerId,
        horseName: participant.horseId,
        category: participant.category,
        status: participant.status,
      }))
      const disqualifications = tournamentResults
        .filter((result) => result.status === 'rejected' || result.faults.some((fault) => fault.count > 0 && fault.name.toLowerCase().includes('استبعاد')))
        .map((result) => ({
          competitionNumber: result.competitionNumber,
          playerName: result.playerName,
          roundName: result.roundName || `الجولة ${result.roundNumber}`,
          reason: result.rejectedReason || 'تمت مراجعة النتيجة وإجراء تعديل عليها',
          by: result.approvedBy || 'المدير',
          at: result.approvedAt || result.submittedAt,
        }))
      const approvedResults = tournamentResults.filter((result) => result.status === 'approved')
      const approvedScores = recalculateRoundScores(approvedResults)
      const archiveResults = tournamentResults.map((result) => {
        const derivedScore = result.status === 'approved' ? approvedScores.get(result.id) ?? 0 : 0
        return {
          id: result.id,
          tournamentId: result.tournamentId,
          roundId: result.roundId,
          playerId: result.playerId,
          competitionNumber: result.competitionNumber,
          playerName: result.playerName,
          roundNumber: result.roundNumber,
          roundName: result.roundName,
          time: result.time,
          faults: result.faults,
          systemScore: derivedScore,
          status: result.status,
          published: result.published,
          judgeName: result.judgeName,
          submittedAt: result.submittedAt,
          approvedBy: result.approvedBy,
          approvedAt: result.approvedAt,
          rejectedReason: result.rejectedReason,
        }
      })

      const auditLog = [
        ...tournamentResults.map((result) => ({
          action: result.status === 'approved' ? 'اعتماد نتيجة' : result.status === 'rejected' ? 'رفض نتيجة' : 'إدخال نتيجة',
          description: `${result.playerName} — ${result.roundName || `الجولة ${result.roundNumber}`} — ${result.time} • ${getEffectiveScore(result, tournamentResults)} نقطة`,
          userName: result.judgeName || 'الحكم',
          category: 'نتيجة',
          timestamp: result.approvedAt || result.submittedAt,
        })),
        ...tournamentAppeals.map((appeal) => ({
          action: 'اعتراض',
          description: `${appeal.playerName} — ${appeal.text}`,
          userName: appeal.reviewedBy || 'المدير',
          category: 'اعتراض',
          timestamp: appeal.submittedAt,
        })),
      ].sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || ''))

      return {
        tournamentId: tournament.id,
        name: tournament.name,
        type: tournament.type,
        date: tournament.date,
        location: tournament.location,
        description: tournament.description,
        totalRounds: tournament.totalRounds,
        participantCount: tournament.participantCount,
        judgeNames: Array.from(new Set(tournamentResults.map((result) => result.judgeName))).filter(Boolean),
        status: tournament.status,
        archivedAt: tournament.status === 'archived' ? 'تمت أرشفته' : new Date().toLocaleDateString('ar-IQ'),
        archivedBy: 'مدير البطولة',
        reportVersion: 1,
        rulesetSnapshot: { rulesetId: tournament.rulesetId, name: tournament.type, description: 'نسخة محفوظة من قوانين البطولة وقت الإغلاق', scoringDescription: 'جميع النتائج محسوبة حسب نظام النقاط النهائي بعد مراجعة الجولات', rounds: tournament.totalRounds, faults: tournament.faults ?? [], snapshotAt: new Date().toLocaleDateString('ar-IQ') },
        participants: tournamentParticipants,
        results: archiveResults,
        disqualifications,
        appeals: tournamentAppeals.map((appeal) => ({
          competitionNumber: appeal.competitionNumber,
          playerName: appeal.playerName,
          roundName: appeal.roundName,
          text: appeal.text,
          status: appeal.status,
          submittedAt: appeal.submittedAt,
          reviewedBy: appeal.reviewedBy,
          adminResponse: appeal.adminResponse,
        })),
        auditLog,
      }
    })
  const archives = cloudArchives

  const selected = selectedId ? archives.find((a) => a.tournamentId === selectedId) : null

  if (selected) {
    return <ArchivedDetail archive={selected} onBack={() => setSelectedId(null)} />
  }

  return (
    <div className="p-8 max-w-5xl">
      <p className="font-serif text-[11px] tracking-[0.3em] uppercase text-muted-text mb-2">النظام</p>
      <h1 className="text-charcoal text-3xl font-black mb-2">أرشيف البطولات</h1>
      <p className="text-muted-text text-sm font-serif mb-8">سجل دائم لجميع البطولات المكتملة — القوانين والنتائج والتقارير.</p>

      {archives.length === 0 ? (
        <div className="text-center py-20 border border-dashed border-line rounded-xl">
          <p className="text-muted-text">لا توجد بطولات مؤرشفة بعد</p>
          <p className="text-muted-text/60 text-sm font-serif mt-1">ستظهر البطولات المكتملة هنا عند أرشفتها</p>
        </div>
      ) : (
        <div className="space-y-3">
          {archives.map((archive) => {
            const ranking = computeFinalRanking(archive)
            return (
              <div key={archive.tournamentId} className="bg-surface border border-line rounded-xl p-5 hover:border-line transition-all group">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-1">
                      <span className="text-[10px] font-black text-charcoal/50 bg-sand px-2 py-0.5 rounded">مؤرشفة</span>
                      <span className="text-muted-text text-xs font-serif">{archive.date}</span>
                    </div>
                    <h3 className="text-charcoal font-black text-lg mb-1">{archive.name}</h3>
                    <p className="text-muted-text text-sm font-serif">{archive.type} · {archive.location}</p>
                    <div className="flex items-center gap-4 mt-2 text-xs text-muted-text">
                      <span>{archive.participantCount} مشارك</span>
                      <span>{archive.totalRounds} جولات</span>
                      {ranking[0] && <span>الفائز: <strong className="text-charcoal">{ranking[0].name}</strong></span>}
                    </div>
                  </div>
                  <div className="flex flex-col gap-2 shrink-0">
                    <button
                      onClick={() => setSelectedId(archive.tournamentId)}
                      className="bg-charcoal text-ivory text-xs font-black px-4 py-2 rounded-lg hover:opacity-80 transition-opacity"
                    >
                      عرض الأرشيف
                    </button>
                    <button
                      onClick={() => generatePDF(archive, new Set(['info', 'rules', 'participants', 'rounds', 'ranking', 'disqualifications']))}
                      className="border border-line text-muted-text text-xs font-semibold px-4 py-2 rounded-lg hover:bg-sand transition-colors text-center"
                    >
                      تصدير PDF
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
