import { farmerInfo } from '../data/farmerDetails'
import { useMode } from '../hooks/useMode'
import { ArrowLeft, CaretDown, CheckCircle, Question, WarningCircle, WarningOctagon } from '@phosphor-icons/react'
import type { ConditionInfo } from '../data/types'
import type { Combine, Prediction } from '../ml/classify'
import { ISSUE_TEXT, type QualityReport } from '../ml/qualityGate'

/** What was analysed: several photos (combined by geometric mean) or video frames (averaged). */
export interface Input {
  kind: 'photos' | 'video'
  used: number // photos or frames that passed the quality check and were analysed
  skipped: number // photos left out by the quality check
  srcs: string[]
  combine: Combine
}

export type Outcome =
  | { kind: 'quality'; report: QualityReport }
  | { kind: 'prediction'; pred: Prediction; info?: ConditionInfo; cropMismatch?: boolean; cropName: string; threshold: number; saved?: boolean; softBlur?: boolean; input?: Input }
  | { kind: 'error'; message: string }

/** Never show 100%: softmax confidence is not certainty. */
export const pct = (p: number) => (p >= 0.995 ? '>99%' : p > 0 && p < 0.005 ? '<1%' : `${Math.round(p * 100)}%`)

const SEVERITY: Record<ConditionInfo['severity'], { text: string; cls: string }> = {
  none: { text: 'Looks healthy', cls: 'healthy' },
  low: { text: 'Usually minor', cls: '' },
  moderate: { text: 'Worth keeping an eye on', cls: 'attention' },
  high: { text: 'Act soon', cls: 'attention' },
  regulated: { text: 'Must be reported in California', cls: 'attention' },
}

import type { Plant } from '../ml/router'

interface Props {
  photo: string
  outcome: Outcome
  plant: Plant | null
  onChangePlant?: () => void
  onRetake: () => void
  onHome: () => void
  displayName: (label: string) => string
}

function PlantLine({ name, onChange }: { name: string; onChange?: () => void }) {
  return (
    <span className="plant-line">
      <span className="crop">{name} leaf</span>
      {onChange && <button className="text-link" onClick={onChange}>Not {name.toLowerCase()}? Change plant</button>}
    </span>
  )
}

/** The model's output distribution: top 3 plus everything else, so it sums to 100%. */
function Ranked({ top, displayName }: { top: Prediction['top']; displayName: (l: string) => string }) {
  const rest = Math.max(0, 1 - top.reduce((a, t) => a + t.confidence, 0))
  const rows = [...top.map((t) => ({ key: String(t.index), label: t.label, name: displayName(t.label), v: t.confidence })), { key: 'rest', label: undefined, name: 'All other conditions', v: rest }]
  return (
    <ol className="ranked">
      {rows.map((r) => (
        <li key={r.key} className={r.key === 'rest' ? 'rest' : undefined} data-label={r.label} data-p={r.v.toFixed(6)}>
          <div className="r"><span>{r.name}</span><span>{pct(r.v)}</span></div>
          <div className="bar"><span style={{ width: `${Math.max(1, r.v * 100)}%` }} /></div>
        </li>
      ))}
    </ol>
  )
}

export default function Result({ photo, outcome, onRetake, onHome, displayName, onChangePlant }: Props) {
  const { mode } = useMode()
  const p = outcome.kind === 'prediction' ? outcome : null
  const confident = p?.pred.status === 'confident'
  const info = p?.info
  const healthy = confident && info?.severity === 'none'
  const farmer = info ? farmerInfo(info) : undefined
  const sev = info ? SEVERITY[info.severity] : null
  // several photos whose own answers differ
  const disagree = !!p && p.input?.kind === 'photos' && p.input.used > 1 && new Set(p.pred.perImageTop).size > 1

  return (
    <section className="screen">
      <div className="topbar">
        <button className="icon-btn back" onClick={onHome}><ArrowLeft size={20} aria-hidden />Home</button>
        {p && <span className="caption">{p.pred.modelVersion} · on this phone</span>}
      </div>
      <img className="result-photo" src={photo} alt="The leaf that was checked" />
      {p?.input?.kind === 'photos' && p.input.used > 1 && (
        <div className="result-thumbs" aria-label={`${p.input.used} photos were checked together`}>
          {p.input.srcs.map((s, i) => <img key={s} src={s} alt={`Photo ${i + 1}`} />)}
        </div>
      )}

      {outcome.kind === 'quality' && (
        <div className="verdict uncertain">
          <span className="pill uncertain"><Question size={16} aria-hidden />Not checked</span>
          <h1>The photo needs retaking</h1>
          <ul className="bullets lede">{outcome.report.issues.map((i) => <li key={i}>{ISSUE_TEXT[i]}</li>)}</ul>
        </div>
      )}

      {outcome.kind === 'error' && (
        <div className="callout attention" role="alert">
          <WarningCircle size={20} aria-hidden />
          <div><b>Something went wrong.</b> {outcome.message} No result was made up.</div>
        </div>
      )}

      {p && !confident && (
        <div className="verdict uncertain">
          <PlantLine name={p.cropName} onChange={onChangePlant} />
          <h1>Not sure about this one</h1>
          <span className="pill uncertain"><Question size={16} aria-hidden />Not confident enough to name a problem</span>
          <p className="lede">
            {disagree && !p.cropMismatch
              ? 'Your photos point to different problems, so CropGuard won’t pick one. Check each leaf on its own, or add more photos of the same problem.'
              : p.cropMismatch
              ? `This doesn’t look like the ${p.cropName.toLowerCase()} leaves the model knows. It may be a different plant, or the photo may need retaking.`
              : p.pred.top[0].confidence >= 0.7 && p.pred.cutoff > p.pred.top[0].confidence
                ? `The closest match, ${displayName(p.pred.top[0].label)}, reached ${pct(p.pred.top[0].confidence)}, but ${p.pred.cutoff > 1 ? 'CropGuard never names it on its own' : `CropGuard only names it at ${pct(p.pred.cutoff)}`} because it was easy to confuse with other conditions in testing. Treat this as unconfirmed.`
                : 'Rather than guess, CropGuard only names a problem when it’s confident. A clearer photo usually helps.'}
          </p>
          {!disagree && <ul className="bullets lede">
            <li>Shoot in daylight, out of harsh sun</li>
            <li>One leaf, filling the square</li>
            <li>Hold still so it’s sharp</li>
          </ul>}
        </div>
      )}

      {p && confident && (
        <div className={`verdict ${sev?.cls ?? ''}`}>
          <PlantLine name={p.cropName} onChange={onChangePlant} />
          <h1>{healthy ? 'No problems spotted' : info?.name ?? displayName(p.pred.top[0].label)}</h1>
          {sev && (
            <span className={`pill ${sev.cls}`}>
              {healthy ? <CheckCircle size={16} weight="fill" aria-hidden /> : <WarningCircle size={16} aria-hidden />}
              {sev.text}
            </span>
          )}
          <div>
            <div className="meter-row"><span>Model confidence</span><b>{pct(p.pred.top[0].confidence)}</b></div>
            <div className="meter" aria-hidden>
              <span style={{ width: `${p.pred.top[0].confidence * 100}%` }} />
              <i style={{ left: `${p.threshold * 100}%` }} />
            </div>
            <p className="caption" style={{ marginTop: 'var(--s2)' }}>
              How closely this matches what the model learned, not the chance it’s right. Below the line ({pct(p.threshold)}) CropGuard says it isn’t sure
              {p.threshold > 0.7 ? '. This condition has a higher bar because it’s easier to confuse with others.' : '.'}
            </p>
          </div>
        </div>
      )}

      {p?.input && p.input.skipped > 0 && (
        <div className="callout" role="note">
          <WarningCircle size={20} aria-hidden />
          <div><b>{p.input.skipped} of your photos {p.input.skipped === 1 ? 'was' : 'were'} skipped</b> because {p.input.skipped === 1 ? 'it was' : 'they were'} too dark, too blurry or didn’t show a leaf clearly. The result uses the other {p.input.used}.</div>
        </div>
      )}

      {disagree && confident && (
        <div className="callout uncertain" role="note">
          <WarningCircle size={20} aria-hidden />
          <div><b>Your photos don’t all point to the same thing.</b> Most of them support this result. If they show different plants or different problems, check them separately.</div>
        </div>
      )}

      {p?.softBlur && (
        <div className="callout uncertain" role="note">
          <WarningCircle size={20} aria-hidden />
          <div><b>The photo is a little blurry.</b> CropGuard still checked it, but a sharper photo or a short video gives a more reliable result.</div>
        </div>
      )}

      {p && confident && info?.severity === 'regulated' && (
        <div className="callout attention">
          <WarningOctagon size={20} aria-hidden />
          <div><b>This is a regulated citrus disease in California.</b> Don’t move leaves, fruit or cuttings off your property. Report it to the CDFA Pest Hotline: 1-800-491-1899.</div>
        </div>
      )}

      {p && confident && info && (
        <div className="panel">
          <section>
            <h3>{healthy ? 'What this means' : 'About this problem'}</h3>
            <p>{info.shortDescription}</p>
            {info.note && <p className="caption">{info.note}</p>}
          </section>
          <section>
            <h3>{healthy ? 'What healthy looks like' : 'What to look for'}</h3>
            <ul className="bullets">{info.visualSigns.map((s) => <li key={s}>{s}</li>)}</ul>
          </section>
          <section>
            <h3>What to do next</h3>
            {/* the CDFA reporting step is shown in its own callout */}
            <ul className="bullets">{info.generalNextSteps.filter((s) => !s.includes('CDFA')).map((s) => <li key={s}>{s}</li>)}</ul>
          </section>
        </div>
      )}

      {p && confident && info && mode === 'farmer' && farmer && (
        <div className="panel farmer">
          <p className="farmer-tag">Farmer detail</p>
          {!healthy && (
            <dl className="agronomy">
              <dt>Cause</dt><dd>{farmer.cause}</dd>
              <dt>How it spreads</dt><dd>{farmer.spread}</dd>
              <dt>Favoured by</dt><dd>{farmer.favoredBy}</dd>
              <dt>Why it matters</dt><dd>{farmer.impact}</dd>
            </dl>
          )}
          <section>
            <h3>Scouting</h3>
            <p>{farmer.scouting}</p>
          </section>
          <section>
            <h3>{healthy ? 'Keep it that way' : 'Integrated management'}</h3>
            <ol className="steps">{farmer.management.map((s) => <li key={s}>{s}</li>)}</ol>
          </section>
          <p className="caption">General guidance only. Registrations, thresholds and resistance differ by region: confirm with your local extension service or a certified crop adviser before treating.</p>
        </div>
      )}

      {p && (
        <details className="panel breakdown" open>
          <summary>Prediction breakdown<CaretDown size={18} aria-hidden /></summary>
          {disagree && !confident ? (
            <>
              <p className="caption">Your photos disagree, so here is each photo’s own top answer rather than a combined score.</p>
              <ol className="ranked perphoto">
                {p.pred.perImageTop!.map((l, i) => (
                  <li key={i} data-label={l}>
                    <div className="r"><span>Photo {i + 1}: {displayName(l)}</span><span>{pct(p.pred.perImageConf?.[i] ?? 0)}</span></div>
                    <div className="bar"><span style={{ width: `${Math.max(1, (p.pred.perImageConf?.[i] ?? 0) * 100)}%` }} /></div>
                  </li>
                ))}
              </ol>
            </>
          ) : (
            <>
              <p className="caption">
                {p.cropMismatch
                  ? 'What the model output, across every crop it knows.'
                  : `What the model output, among the ${p.cropName.toLowerCase()} conditions it knows${p.input && p.input.used > 1 ? `, combining your ${p.input.used} ${p.input.kind === 'video' ? 'video frames' : 'photos'}` : ''}.`}
              </p>
              <Ranked top={p.pred.top} displayName={displayName} />
            </>
          )}
        </details>
      )}

      <p className="fine-print">
        A screening aid, not a diagnosis. {p && (p.saved ? 'Saved to your history.' : 'Not saved: this phone’s storage is unavailable.')}
        {p && ` Checked in ${Math.round(p.pred.inferenceMs)} ms${p.input?.kind === 'video' && p.input.used > 1 ? `, combining the ${p.input.used} sharpest frames from your video` : p.input && p.input.used > 1 ? `, combining your ${p.input.used} photos` : ''}.`}
      </p>
      <div className="sticky-cta">
        <button className="btn primary full" onClick={onRetake}>Check another leaf</button>
      </div>
    </section>
  )
}
