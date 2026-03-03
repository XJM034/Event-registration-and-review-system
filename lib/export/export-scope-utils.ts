import type { ExportConfig } from './export-route-utils'

export const getDefaultExportScope = (
  selectedCount: number
): ExportConfig['exportScope'] => {
  return selectedCount > 0 ? 'selected' : 'pending'
}
