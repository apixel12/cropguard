import { ArrowLeft } from '@phosphor-icons/react'
import { useModels } from '../hooks/useModels'
import type { ModelId } from '../ml/modelRegistry'

const pctOf = (v: unknown) => (typeof v === 'number' ? `${(v * 100).toFixed(1)}%` : '—')

function ModelFacts({ id, title }: { id: ModelId; title: string }) {
  const { models } = useModels()
  const meta = models[id]?.meta
  return (
    <div className="panel">
      <section>
        <h3>{title}</h3>
        {meta ? (
          <>
            <dl className="facts">
              <dt>{id === 'router-v2' ? 'Plants it knows' : 'Conditions it knows'}</dt><dd>{meta.classCount}</dd>
              <dt>Accuracy on unseen test photos</dt><dd>{pctOf(meta.metrics.appRule?.accuracy ?? meta.metrics.accuracy)}</dd>
              <dt>Right when it gives an answer</dt><dd>{pctOf(meta.metrics.appRule?.precision)}</dd>
              <dt>Gives an answer for</dt><dd>{pctOf(meta.metrics.appRule?.coverage)} of photos</dd>
            </dl>
            <p className="caption">
              Measured on {typeof meta.metrics.testImages === 'number' ? meta.metrics.testImages.toLocaleString() : 'held-out'} photos from
              the training datasets that the model never saw. Your own plants may differ. Version {meta.modelVersion}.
            </p>
          </>
        ) : <p className="caption">Not loaded on this phone yet.</p>}
      </section>
    </div>
  )
}

export default function About({ onBack }: { onBack: () => void }) {
  return (
    <section className="screen">
      <div className="topbar">
        <button className="icon-btn back" onClick={onBack}><ArrowLeft size={20} aria-hidden />Back</button>
      </div>
      <div style={{ display: 'grid', gap: 'var(--s2)' }}>
        <h1>How CropGuard works</h1>
        <p className="lede">
          Three image models run inside your phone’s browser: one works out which of 21 plants a leaf is from, then a disease model (one for lemon, one for every other crop) checks it for problems. Photos and short videos both work. Your photo is checked on the phone and never uploaded. There’s no account
          and no tracking. When a model isn’t confident, it says so instead of guessing.
        </p>
      </div>

      <ModelFacts id="router-v2" title="Plant identification" />
      <ModelFacts id="lemon-v1" title="Lemon model" />
      <ModelFacts id="crops-v2" title="Crops model (garden and field crops)" />

      <div className="panel">
        <section>
          <h3>Where the training photos come from</h3>
          <ul className="bullets">
            <li>Lemon: Large-Scale Lemon Leaf Disease and Pest Image Dataset from Bangladesh, Mendeley Data, DOI 10.17632/8d9fv6kpt3.2 (CC BY 4.0). Duplicate photos were removed.</li>
            <li>Garden crops: PlantVillage, Hughes &amp; Salathé 2015 (CC BY-SA 3.0); real-world photos from PlantDoc, Singh et al. 2020 (CC BY 4.0).</li>
            <li>Rice: Sethy et al. 2020 and RiceLeafBD (Mendeley Data, CC BY 4.0).</li>
            <li>Wheat: John Innes Centre wheat disease dataset (Zenodo, CC BY 4.0) and Getachew 2021, Holeta wheat farm, Ethiopia (Mendeley Data, CC BY 4.0).</li>
            <li>Cotton: cotton leaf disease severity dataset and SAR-CLD-2024 (Mendeley Data, CC BY 4.0).</li>
            <li>Sugarcane: Daphal &amp; Koli 2022 (Mendeley Data, CC BY 4.0).</li>
            <li>Cassava: iCassava 2019, Makerere AI Lab and NaCRRI (Mwebaze et al. 2019).</li>
            <li>Beans: iBean, Makerere AI Lab with Uganda’s National Crops Resources Research Institute (MIT).</li>
            <li>Model: MobileNetV2 (Sandler et al. 2018). Typeface: Public Sans (SIL OFL). Icons: Phosphor (MIT).</li>
          </ul>
        </section>
        <section>
          <h3>What it can’t do</h3>
          <ul className="bullets">
            <li>Give a diagnosis. Advice is general on purpose. Check with your local extension office or a garden centre.</li>
            <li>Name a cause for some lemon symptoms, like curling, dry or yellow-spotted leaves.</li>
            <li>Recognise plants it wasn’t trained on.</li>
          </ul>
        </section>
      </div>
    </section>
  )
}
