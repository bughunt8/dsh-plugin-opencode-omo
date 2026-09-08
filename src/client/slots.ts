/**
 * Plugin-owned SlotMap declaration. Conversation and standard session props
 * come from their current owning packages rather than duplicate declarations.
 */

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface SlotMap {
    /** Plugin-owned nested tab inside the opencode-omo settings section. */
    'opencode-omo.settings.tab': {
      kind: 'list'
      scope: 'root'
      owner: { readonly children?: never }
    }
  }
}

export {}
