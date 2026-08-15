/**
 * Local SlotMap declaration for the ui-conversation seat this plugin
 * occupies. It mirrors the owning package's declaration — declared here too so
 * the plugin's own typecheck sees the seat even when the installed owner
 * typings resolve through a different package tree (pnpm copies) than the
 * runtime's ui-slots copy. The owning plugin still declares it at runtime;
 * this file is type-only.
 */

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface SlotMap {
    'conversation.input.left': {
      kind: 'list'
      scope: 'session'
      owner: { readonly session: unknown; readonly input: unknown }
    }
  }
}

export {}
