/**
 * OmoSettingsSection — the single "opencode-omo" page in the global settings
 * nav. It owns one child tab slot (`opencode-omo.settings.tab`) so feature
 * pages nest under this section the same way the Plugins section nests its
 * tabs; the shipped tabs are "General" (omo.json import) and "角色设置"
 * (RoleSettingsSection). One tab renders at a time via the slot render
 * options' entry selector.
 */
import { useState } from 'react'
import type { ReactElement } from 'react'
import type {
  PropsRenderSlots, PropsRuntime,
} from '@deepseek-ai/dsh-client-ui-slots'

/** Full section props: settings-section owner share + the child tab render seat. */
export type OmoSettingsSectionProps =
  PropsRuntime<'settings.section'>
  & PropsRenderSlots<'opencode-omo.settings.tab'>

type TabId = 'general' | 'roles'

const TABS: ReadonlyArray<{ id: TabId; label: string }> = [
  { id: 'general', label: 'General' },
  { id: 'roles', label: '角色设置' },
]

const STYLE: Record<string, React.CSSProperties> = {
  section: { display: 'flex', flexDirection: 'column', gap: 12, fontSize: 13, color: 'var(--dsw-alias-label-primary, #333)' },
  heading: { margin: 0, fontSize: 18, fontWeight: 600, lineHeight: 1.3 },
  intro: { margin: 0, color: 'var(--dsw-alias-label-secondary, #616161)', fontSize: 12, lineHeight: 1.6 },
  tabs: { display: 'flex', alignItems: 'center', gap: 4, borderBottom: '1px solid var(--dsw-alias-border, #e0e0e0)' },
  tab: {
    padding: '8px 10px',
    border: 'none',
    borderBottom: '2px solid transparent',
    background: 'transparent',
    color: 'var(--dsw-alias-label-secondary, #616161)',
    fontSize: 13,
    fontWeight: 500,
    cursor: 'pointer',
  },
  tabActive: {
    borderBottomColor: 'var(--dsw-alias-label-primary, #333)',
    color: 'var(--dsw-alias-label-primary, #333)',
  },
}

/**
 * Render the opencode-omo settings page with its nested tabs.
 * @param props - settings shell owner props and the child tab render seat.
 * @returns the section element.
 */
export function OmoSettingsSection({ renderSlot }: OmoSettingsSectionProps): ReactElement {
  const [active, setActive] = useState<TabId>('general')
  return (
    <div style={STYLE.section}>
      <h2 style={STYLE.heading}>opencode-omo</h2>
      <p style={STYLE.intro}>
        opencode + omo 对齐设置：导入 omo.json 默认配置，并为每个 omo 角色配置主模型、fallback 链、步数预算与 ultrawork 覆盖。
      </p>
      <div style={STYLE.tabs} role="tablist" aria-label="opencode-omo 设置页">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={active === tab.id}
            style={{ ...STYLE.tab, ...(active === tab.id ? STYLE.tabActive : {}) }}
            onClick={() => { setActive(tab.id) }}
          >
            {tab.label}
          </button>
        ))}
      </div>
      {typeof renderSlot === 'function'
        ? renderSlot('opencode-omo.settings.tab', {}, { only: active })
        : null}
    </div>
  )
}

export default OmoSettingsSection
