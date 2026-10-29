import { Leaf, Newspaper } from '@phosphor-icons/react'

export type Tab = 'home' | 'news'

/** Bottom navigation between the two top-level screens. */
export default function TabBar({ tab, onTab }: { tab: Tab; onTab: (t: Tab) => void }) {
  const tabs: { id: Tab; label: string; icon: typeof Leaf }[] = [
    { id: 'home', label: 'Check', icon: Leaf },
    { id: 'news', label: 'News', icon: Newspaper },
  ]
  return (
    <nav className="tabbar" aria-label="Main">
      <div className="tabbar-inner" data-value={tab === 'news' ? 1 : 0}>
        <span className="thumb" aria-hidden />
        {tabs.map(({ id, label, icon: Icon }) => (
          <button key={id} aria-current={tab === id ? 'page' : undefined} onClick={() => tab !== id && onTab(id)}>
            <Icon size={24} weight={tab === id ? 'fill' : 'regular'} aria-hidden />
            {label}
          </button>
        ))}
      </div>
    </nav>
  )
}
