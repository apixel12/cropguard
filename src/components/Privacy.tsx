import { ArrowLeft } from '@phosphor-icons/react'

export default function Privacy({ onBack }: { onBack: () => void }) {
  return (
    <section className="screen">
      <div className="topbar">
        <button className="icon-btn back" onClick={onBack}><ArrowLeft size={20} aria-hidden />Back</button>
      </div>
      <div style={{ display: 'grid', gap: 'var(--s2)' }}>
        <h1>Privacy policy</h1>
        <p className="lede">CropGuard checks your photos on your phone. You can use it without an account, and nothing leaves your phone.</p>
      </div>
      <div className="panel">
        <section>
          <h3>Without an account</h3>
          <p>Photos, videos and results stay on your phone. Nothing is sent anywhere. Your history is stored only on this phone, and you can delete it in History.</p>
        </section>
        <section>
          <h3>With an optional account</h3>
          <ul className="bullets">
            <li><b>What we store:</b> your email address; your password, stored by our account provider only as a one-way hash; and your check results (plant, condition, confidence, model version, date and time).</li>
            <li><b>What we never store:</b> photos, videos, thumbnails or your location.</li>
            <li><b>Why:</b> only to show your check history on your other devices.</li>
            <li><b>Where:</b> with Supabase, our account and database provider. Each account can only ever read its own results (enforced by the database).</li>
            <li><b>Password safety check:</b> when you choose a password, the first 5 characters of its SHA-1 fingerprint (not the password) are checked against the Have I Been Pwned list of breached passwords.</li>
            <li><b>How long:</b> until you delete your account. <b>Delete my account</b> (in Account) erases your account and all synced results.</li>
            <li><b>No ads, no tracking, no analytics, no selling or sharing of your data.</b></li>
          </ul>
        </section>
        <section>
          <h3>Age</h3>
          <p>Accounts are for people aged 13 and older. Anyone can use CropGuard without an account.</p>
        </section>
      </div>
    </section>
  )
}
