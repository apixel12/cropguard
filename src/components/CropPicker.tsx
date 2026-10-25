import { PV_CROPS } from '../ml/plantVillageClassifier'

export default function CropPicker({ onPick, onBack }: { onPick: (key: string, name: string) => void; onBack: () => void }) {
  return (
    <section className="screen">
      <header className="bar">
        <button className="link" onClick={onBack}>← Back</button>
        <h2>Choose crop</h2>
      </header>
      <p className="muted">
        The PlantVillage model supports these 14 crops only. Lemon has its own model. Use "Scan a Lemon Leaf" on the home screen.
      </p>
      <div className="crop-grid">
        {PV_CROPS.map((c) => (
          <button key={c.key} className="crop" onClick={() => onPick(c.key, c.name)}>{c.name}</button>
        ))}
      </div>
    </section>
  )
}
