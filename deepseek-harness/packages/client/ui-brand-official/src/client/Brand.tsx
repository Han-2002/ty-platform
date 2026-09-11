import { BrandWordmark } from '@deepseek-ai/dsh-client-ui-primitives'
import type { SidebarBrandMarkOwnerProps } from '@deepseek-ai/dsh-client-ui-sidebar/client'

/**
 * The official mark is removed: return nothing so the sidebar brand-mark slot
 * renders empty (the whale logo no longer appears beside the wordmark).
 * @param _props - Host-supplied mark presentation (unused).
 * @returns null.
 */
export function OfficialBrandMark(_props: SidebarBrandMarkOwnerProps) {
  return null
}

/**
 * Render the official name artwork without its independently slotted mark.
 * @returns the official name wordmark.
 */
export function OfficialBrandName() {
  return <BrandWordmark includeMark={false} />
}
