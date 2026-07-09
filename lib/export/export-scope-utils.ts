import type { ExportConfig } from './export-route-utils'

export const getDefaultExportScope = (
  selectedCount: number,
  fallbackScope: ExportConfig['exportScope'] = 'pending',
): ExportConfig['exportScope'] => {
  return selectedCount > 0 ? 'selected' : fallbackScope
}
