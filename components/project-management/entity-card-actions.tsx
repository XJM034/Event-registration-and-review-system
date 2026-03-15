'use client'

import { Edit, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'

interface EntityCardActionsProps {
  enabled: boolean
  itemName: string
  switchId: string
  onToggle: () => void
  onEdit: () => void
  onDelete: () => void
}

export default function EntityCardActions({
  enabled,
  itemName,
  switchId,
  onToggle,
  onEdit,
  onDelete,
}: EntityCardActionsProps) {
  return (
    <div className="flex flex-col gap-3 border-t border-border/60 pt-3 sm:border-0 sm:pt-0">
      <div className="flex items-center justify-between gap-3 rounded-lg bg-muted/30 px-3 py-2 sm:min-w-[120px] sm:bg-transparent sm:px-0 sm:py-0">
        <Label htmlFor={switchId} className="text-sm font-medium text-foreground">
          {enabled ? '已启用' : '已禁用'}
        </Label>
        <Switch id={switchId} checked={enabled} onCheckedChange={onToggle} />
      </div>

      <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center sm:gap-2">
        <Button
          aria-label={`编辑${itemName}`}
          variant="outline"
          size="sm"
          onClick={onEdit}
          className="h-10 justify-center gap-2 sm:h-9 sm:w-9 sm:px-0"
        >
          <Edit className="h-4 w-4" />
          <span className="sm:hidden">编辑</span>
        </Button>

        <Button
          aria-label={`删除${itemName}`}
          variant="outline"
          size="sm"
          onClick={onDelete}
          className="h-10 justify-center gap-2 border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700 dark:border-red-900/60 dark:text-red-400 dark:hover:bg-red-950/30 dark:hover:text-red-300 sm:h-9 sm:w-9 sm:px-0"
        >
          <Trash2 className="h-4 w-4" />
          <span className="sm:hidden">删除</span>
        </Button>
      </div>
    </div>
  )
}
