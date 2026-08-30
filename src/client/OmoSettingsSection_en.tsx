/**
 * OmoSettingsSection — the single "opencode-omo" page in the global settings
 * nav. It owns one child tab slot (`opencode-omo.settings.tab`) so feature
 * pages nest under this section the same way the Plugins section nests its
 * tabs; the shipped tab is "Role Settings" (RoleSettingsSection).
 */
import type { ReactElement } from 'react'
import type {
  PropsRenderSlots, PropsRuntime,
} from '@deepseek-ai/dsh-client-ui-slots'

/** Full section props: settings-section owner share + the child tab render seat. */
export type OmoSettingsSectionProps =
  PropsRuntime<'settings.section'>
  & PropsRenderSlots<'opencode-omo.settings.tab'>

const STYLE: Record<string, React.CSSProperties> = {
  section: { display: 'flex', flexDirection: 'column', gap: 12, fontSize: 13, color: '#ffffff' },
  heading: { margin: 0, fontSize: 18, fontWeight: 600, lineHeight: 1.3 },
  intro: { margin: 0, color: '#e6e6e6', fontSize: 12, lineHeight: 1.6 },
  tabs: { display: 'flex', alignItems: 'center', gap: 4, borderBottom: '1px solid #3f3f3f' },
  tab: {
    padding: '8px 10px',
    border: 'none',
    borderBottom: '2px solid transparent',
    background: 'transparent',
    color: '#e6e6e6',
    fontSize: 13,
    fontWeight: 500,
    cursor: 'default',
  },
  tabActive: {
    borderBottomColor: '#ffffff',
    color: '#ffffff',
  },
}

/**
 * Render the opencode-omo settings page with its nested tabs.
 * @param props - settings shell owner props and the child tab render seat.
 * @returns the section element.
 */
export function OmoSettingsSection({ renderSlot }: OmoSettingsSectionProps): ReactElement {
  return (
    <div style={STYLE.section}>
      <h2 style={STYLE.heading}>opencode-omo</h2>
      <p style={STYLE.intro}>
        opencode + omo alignment settings: configure the primary model, fallback chain, step budget, and ultrawork override for each omo role.
      </p>
      <div style={STYLE.tabs} role="tablist" aria-label="opencode-omo settings page">
        <button
          type="button"
          role="tab"
          aria-selected="true"
          style={{ ...STYLE.tab, ...STYLE.tabActive }}
        >
          Role Settings
        </button>
      </div>
      {renderSlot('opencode-omo.settings.tab', {})}
    </div>
  )
}

export default OmoSettingsSection
