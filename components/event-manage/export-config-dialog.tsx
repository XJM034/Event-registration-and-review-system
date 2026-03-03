'use client'

import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Checkbox } from '@/components/ui/checkbox'
import { Loader2 } from 'lucide-react'
import { getDefaultExportScope } from '@/lib/export/export-scope-utils'

interface ExportConfigDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  eventId: string
  selectedCount: number
  onExport: (config: ExportConfig) => void
}

export interface ExportConfig {
  exportScope: 'selected' | 'approved' | 'pending' | 'all'
  teamFields: string[]
  playerFields: string[]
  groupBy: 'none' | 'division' | 'unit' | 'division_unit'
  fileNamePrefix?: string
}

interface FieldConfig {
  id: string
  label: string
  type: string
  required?: boolean
}

export default function ExportConfigDialog({
  open,
  onOpenChange,
  eventId,
  selectedCount,
  onExport
}: ExportConfigDialogProps) {
  const [loading, setLoading] = useState(true)
  const [exportScope, setExportScope] = useState<'selected' | 'approved' | 'pending' | 'all'>(
    getDefaultExportScope(selectedCount)
  )
  const [groupBy, setGroupBy] = useState<'none' | 'division' | 'unit' | 'division_unit'>('division_unit')
  const [teamFields, setTeamFields] = useState<FieldConfig[]>([])
  const [playerFields, setPlayerFields] = useState<FieldConfig[]>([])
  const [selectedTeamFields, setSelectedTeamFields] = useState<string[]>([])
  const [selectedPlayerFields, setSelectedPlayerFields] = useState<string[]>([])
  const [eventName, setEventName] = useState('')

  useEffect(() => {
    if (open) {
      setExportScope(getDefaultExportScope(selectedCount))
      fetchFieldsConfig()
    }
  }, [open, eventId, selectedCount])

  const fetchFieldsConfig = async () => {
    setLoading(true)
    try {
      // 获取赛事信息
      const eventResponse = await fetch(`/api/events/${eventId}`)
      const eventResult = await eventResponse.json()
      if (eventResult.success && eventResult.data) {
        setEventName(eventResult.data.name)
      }

      // 获取所有组别的报名设置
      const settingsResponse = await fetch(`/api/events/${eventId}/registration-settings`)
      const settingsResult = await settingsResponse.json()

      if (settingsResult.success && settingsResult.data) {
        const settings = Array.isArray(settingsResult.data) ? settingsResult.data : [settingsResult.data]

        // 合并所有组别的字段
        const teamFieldsMap = new Map<string, FieldConfig>()
        const playerFieldsMap = new Map<string, FieldConfig>()

        settings.forEach((setting: any) => {
          // 队伍字段
          if (setting.team_requirements) {
            const teamReq = setting.team_requirements
            const fields = teamReq.allFields || [
              ...(teamReq.commonFields || []),
              ...(teamReq.customFields || [])
            ]
            fields.forEach((f: FieldConfig) => {
              if (!teamFieldsMap.has(f.id)) {
                teamFieldsMap.set(f.id, f)
              }
            })
          }

          // 队员字段
          if (setting.player_requirements?.roles) {
            setting.player_requirements.roles.forEach((role: any) => {
              const fields = role.allFields || [
                ...(role.commonFields || []),
                ...(role.customFields || [])
              ]
              fields.forEach((f: FieldConfig) => {
                if (!playerFieldsMap.has(f.id)) {
                  playerFieldsMap.set(f.id, f)
                }
              })
            })
          }
        })

        const teamFieldsList = Array.from(teamFieldsMap.values())
        const playerFieldsList = Array.from(playerFieldsMap.values())

        setTeamFields(teamFieldsList)
        setPlayerFields(playerFieldsList)

        // 默认全选
        setSelectedTeamFields(teamFieldsList.map(f => f.id))
        setSelectedPlayerFields(playerFieldsList.map(f => f.id))
      }
    } catch (error) {
      console.error('Failed to fetch fields config:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleExport = () => {
    const config: ExportConfig = {
      exportScope,
      teamFields: selectedTeamFields,
      playerFields: selectedPlayerFields,
      groupBy,
      fileNamePrefix: eventName
    }
    onExport(config)
    onOpenChange(false)
  }

  const toggleTeamField = (fieldId: string) => {
    setSelectedTeamFields(prev =>
      prev.includes(fieldId)
        ? prev.filter(id => id !== fieldId)
        : [...prev, fieldId]
    )
  }

  const togglePlayerField = (fieldId: string) => {
    setSelectedPlayerFields(prev =>
      prev.includes(fieldId)
        ? prev.filter(id => id !== fieldId)
        : [...prev, fieldId]
    )
  }

  const selectAllTeamFields = () => {
    setSelectedTeamFields(teamFields.map(f => f.id))
  }

  const deselectAllTeamFields = () => {
    setSelectedTeamFields([])
  }

  const selectAllPlayerFields = () => {
    setSelectedPlayerFields(playerFields.map(f => f.id))
  }

  const deselectAllPlayerFields = () => {
    setSelectedPlayerFields([])
  }

  const getFieldTypeLabel = (type: string) => {
    const typeMap: Record<string, string> = {
      text: '文本',
      image: '图片',
      attachment: '附件',
      attachments: '附件',
      select: '单选',
      multiselect: '多选',
      date: '日期'
    }
    return typeMap[type] || type
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>导出配置</DialogTitle>
          <DialogDescription>
            选择导出范围、字段和分组方式
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
          </div>
        ) : (
          <div className="max-h-[60vh] overflow-y-auto pr-4">
            <div className="space-y-6">
              {/* 导出范围 */}
              <div className="space-y-3">
                <Label className="text-base font-semibold">导出范围</Label>
                <RadioGroup value={exportScope} onValueChange={(value: any) => setExportScope(value)}>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="selected" id="scope-selected" disabled={selectedCount === 0} />
                    <Label
                      htmlFor="scope-selected"
                      className={`font-normal ${selectedCount === 0 ? 'cursor-not-allowed text-gray-400' : 'cursor-pointer'}`}
                    >
                      仅导出选中的报名 ({selectedCount} 个)
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="approved" id="scope-approved" />
                    <Label htmlFor="scope-approved" className="font-normal cursor-pointer">
                      导出所有已通过的报名
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="pending" id="scope-pending" />
                    <Label htmlFor="scope-pending" className="font-normal cursor-pointer">
                      导出所有待审核的报名
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="all" id="scope-all" />
                    <Label htmlFor="scope-all" className="font-normal cursor-pointer">
                      导出所有报名（不含草稿）
                    </Label>
                  </div>
                </RadioGroup>
              </div>

              {/* 队伍字段选择 */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-base font-semibold">队伍字段</Label>
                  <div className="space-x-2">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={selectAllTeamFields}
                    >
                      全选
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={deselectAllTeamFields}
                    >
                      全不选
                    </Button>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3 p-4 border rounded-md bg-gray-50">
                  {teamFields.length === 0 ? (
                    <p className="col-span-2 text-sm text-gray-500">暂无队伍字段</p>
                  ) : (
                    teamFields.map(field => (
                      <div key={field.id} className="flex items-center space-x-2">
                        <Checkbox
                          id={`team-${field.id}`}
                          checked={selectedTeamFields.includes(field.id)}
                          onCheckedChange={() => toggleTeamField(field.id)}
                        />
                        <Label
                          htmlFor={`team-${field.id}`}
                          className="text-sm font-normal cursor-pointer flex-1"
                        >
                          {field.label}
                          <span className="text-xs text-gray-500 ml-1">
                            ({getFieldTypeLabel(field.type)})
                          </span>
                        </Label>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* 队员字段选择 */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-base font-semibold">队员字段</Label>
                  <div className="space-x-2">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={selectAllPlayerFields}
                    >
                      全选
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={deselectAllPlayerFields}
                    >
                      全不选
                    </Button>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3 p-4 border rounded-md bg-gray-50">
                  {playerFields.length === 0 ? (
                    <p className="col-span-2 text-sm text-gray-500">暂无队员字段</p>
                  ) : (
                    playerFields.map(field => (
                      <div key={field.id} className="flex items-center space-x-2">
                        <Checkbox
                          id={`player-${field.id}`}
                          checked={selectedPlayerFields.includes(field.id)}
                          onCheckedChange={() => togglePlayerField(field.id)}
                        />
                        <Label
                          htmlFor={`player-${field.id}`}
                          className="text-sm font-normal cursor-pointer flex-1"
                        >
                          {field.label}
                          <span className="text-xs text-gray-500 ml-1">
                            ({getFieldTypeLabel(field.type)})
                          </span>
                        </Label>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* 分组方式 */}
              <div className="space-y-3">
                <Label className="text-base font-semibold">分组方式</Label>
                <RadioGroup value={groupBy} onValueChange={(value: any) => setGroupBy(value)}>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="none" id="group-none" />
                    <Label htmlFor="group-none" className="font-normal cursor-pointer">
                      不分组
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="division" id="group-division" />
                    <Label htmlFor="group-division" className="font-normal cursor-pointer">
                      按组别分组（如 U8、U10）
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="unit" id="group-unit" />
                    <Label htmlFor="group-unit" className="font-normal cursor-pointer">
                      按报名单位分组
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="division_unit" id="group-division-unit" />
                    <Label htmlFor="group-division-unit" className="font-normal cursor-pointer">
                      按组别 → 报名单位分组（推荐）
                    </Label>
                  </div>
                </RadioGroup>
              </div>

              {/* 文件名预览 */}
              <div className="space-y-2 p-4 bg-blue-50 border border-blue-200 rounded-md">
                <Label className="text-sm font-semibold text-blue-900">文件名预览</Label>
                <p className="text-sm text-blue-700">
                  {eventName || '赛事名称'}_报名信息_{new Date().toISOString().split('T')[0]}.zip
                </p>
              </div>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button
            onClick={handleExport}
            disabled={loading || (exportScope === 'selected' && selectedCount === 0)}
            className="bg-blue-600 hover:bg-blue-700"
          >
            确认导出
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
