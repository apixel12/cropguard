import { ArrowLeft, CaretRight, OrangeSlice, Plant as PlantIcon } from '@phosphor-icons/react'
import { PV_CROPS } from '../ml/plantVillageClassifier'
import { LEMON, plantName, type Plant } from '../ml/router'

interface Props {
  photo: string
  suggestions: Plant[]
  reason: 'unsure' | 'change'
  onPick: (p: Plant) => void
  onBack: () => void
}

function Row({ p, onPick }: { p: Plant; onPick: (p: Plant) => void }) {
  const lemon = p.kind === 'lemon'
  return (
    <button className="list-row" onClick={() => onPick(p)}>
      <span className={`crop-icon ${lemon ? 'lemon' : ''}`} aria-hidden>{lemon ? <OrangeSlice size={22} /> : <PlantIcon size={22} />}</span>
      <span className="grow title">{plantName(p)}</span>
      <CaretRight className="chev" size={18} aria-hidden />
    </button>
  )
}

/** Shown when the plant-identification step isn't sure, or the user taps "Change plant". */
export default function ChoosePlant({ photo, suggestions, reason, onPick, onBack }: Props) {
  const all: Plant[] = [LEMON, ...PV_CROPS.map((c) => ({ kind: 'pv' as const, cropKey: c.key, cropName: c.name }))]
  const key = (p: Plant) => plantName(p)
  // alphabetical: easier to find a plant by name than to scan a popularity order
  const rest = all.filter((p) => !suggestions.some((s) => key(s) === key(p))).sort((a, b) => plantName(a).localeCompare(plantName(b)))
  return (
    <section className="screen">
      <div className="topbar">
        <button className="icon-btn back" onClick={onBack}><ArrowLeft size={20} aria-hidden />Back</button>
      </div>
      <img className="result-photo" src={photo} alt="Your leaf photo" style={{ aspectRatio: '16 / 9' }} />
      <div style={{ display: 'grid', gap: 'var(--s2)' }}>
        <h1>Which plant is this?</h1>
        <p className="lede">
          {reason === 'unsure'
            ? 'CropGuard couldn’t tell which plant this is, so tell it and the check will continue.'
            : 'Choose the right plant and the same photo will be checked again.'}
        </p>
      </div>
      {suggestions.length > 0 && (
        <div>
          <h2 className="section-title">Best guesses</h2>
          <div className="list-card stagger">{suggestions.map((p) => <Row key={key(p)} p={p} onPick={onPick} />)}</div>
        </div>
      )}
      <div>
        <h2 className="section-title">{suggestions.length ? 'Everything else' : 'Plants CropGuard knows'}</h2>
        <div className="list-card stagger">{rest.map((p) => <Row key={key(p)} p={p} onPick={onPick} />)}</div>
      </div>
    </section>
  )
}
