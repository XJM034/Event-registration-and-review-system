/**
 * 身份证号工具函数
 * 用于从身份证号提取年龄、性别等信息并进行校验
 */

export interface IdCardInfo {
  isValid: boolean
  gender?: 'male' | 'female'
  birthDate?: Date
  age?: number
  error?: string
}

/**
 * 校验身份证号格式
 */
export function validateIdCard(idCard: string): boolean {
  if (!idCard) return false

  // 18位身份证号正则
  const pattern = /^[1-9]\d{5}(19|20)\d{2}(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])\d{3}[\dXx]$/

  if (!pattern.test(idCard)) return false

  // 校验码验证
  const weights = [7, 9, 10, 5, 8, 4, 2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2]
  const checkCodes = ['1', '0', 'X', '9', '8', '7', '6', '5', '4', '3', '2']

  let sum = 0
  for (let i = 0; i < 17; i++) {
    sum += parseInt(idCard[i]) * weights[i]
  }

  const checkCode = checkCodes[sum % 11]
  const lastChar = idCard[17].toUpperCase()

  return checkCode === lastChar
}

/**
 * 从身份证号提取信息
 */
export function parseIdCard(idCard: string): IdCardInfo {
  if (!idCard) {
    return { isValid: false, error: '身份证号不能为空' }
  }

  if (!validateIdCard(idCard)) {
    return { isValid: false, error: '身份证号格式不正确' }
  }

  // 提取出生日期
  const year = parseInt(idCard.substring(6, 10))
  const month = parseInt(idCard.substring(10, 12))
  const day = parseInt(idCard.substring(12, 14))

  const birthDate = new Date(year, month - 1, day)

  // 验证日期有效性
  if (
    birthDate.getFullYear() !== year ||
    birthDate.getMonth() !== month - 1 ||
    birthDate.getDate() !== day
  ) {
    return { isValid: false, error: '身份证号中的出生日期无效' }
  }

  // 计算年龄
  const today = new Date()
  let age = today.getFullYear() - year

  // 如果今年生日还没过，年龄减1
  if (
    today.getMonth() < month - 1 ||
    (today.getMonth() === month - 1 && today.getDate() < day)
  ) {
    age--
  }

  // 提取性别（倒数第二位，奇数为男，偶数为女）
  const genderCode = parseInt(idCard[16])
  const gender: 'male' | 'female' = genderCode % 2 === 1 ? 'male' : 'female'

  return {
    isValid: true,
    gender,
    birthDate,
    age,
  }
}

/**
 * 校验身份证号是否符合组别规则
 */
export interface DivisionRules {
  gender?: 'male' | 'female' | 'mixed' | 'none'
  minAge?: number
  maxAge?: number
  minBirthDate?: string
  maxBirthDate?: string
}

export interface ValidationResult {
  isValid: boolean
  errors: string[]
}

export function validateAgainstDivisionRules(
  idCard: string,
  rules: DivisionRules
): ValidationResult {
  const errors: string[] = []

  const info = parseIdCard(idCard)

  if (!info.isValid) {
    errors.push(info.error || '身份证号无效')
    return { isValid: false, errors }
  }

  // 校验性别
  if (rules.gender && rules.gender !== 'none' && rules.gender !== 'mixed') {
    if (info.gender !== rules.gender) {
      const genderText = rules.gender === 'male' ? '男子' : '女子'
      errors.push(`该组别仅限${genderText}参赛`)
    }
  }

  const hasBirthDateRules = Boolean(rules.minBirthDate || rules.maxBirthDate)

  // 校验年龄（仅当未配置出生日期规则时生效，避免旧数据叠加）
  if (!hasBirthDateRules && info.age !== undefined) {
    if (rules.minAge !== undefined && info.age < rules.minAge) {
      errors.push(`年龄不得小于${rules.minAge}岁（当前${info.age}岁）`)
    }

    if (rules.maxAge !== undefined && info.age > rules.maxAge) {
      errors.push(`年龄不得大于${rules.maxAge}岁（当前${info.age}岁）`)
    }
  }

  // 校验出生日期（精确到天，含边界）
  if (info.birthDate) {
    const birthDateStr = `${info.birthDate.getFullYear()}-${String(info.birthDate.getMonth() + 1).padStart(2, '0')}-${String(info.birthDate.getDate()).padStart(2, '0')}`
    if (rules.minBirthDate && birthDateStr < rules.minBirthDate) {
      errors.push(`出生日期不得早于${rules.minBirthDate}（当前${birthDateStr}）`)
    }
    if (rules.maxBirthDate && birthDateStr > rules.maxBirthDate) {
      errors.push(`出生日期不得晚于${rules.maxBirthDate}（当前${birthDateStr}）`)
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
  }
}

/**
 * 格式化性别显示
 */
export function formatGender(gender: 'male' | 'female'): string {
  return gender === 'male' ? '男' : '女'
}

/**
 * 格式化组别规则显示
 */
export function formatDivisionRules(rules: DivisionRules): string {
  const parts: string[] = []

  if (rules.gender && rules.gender !== 'none') {
    const genderText = {
      male: '男子',
      female: '女子',
      mixed: '混合',
    }[rules.gender]
    parts.push(genderText)
  }

  if (rules.minAge !== undefined || rules.maxAge !== undefined) {
    const minText = rules.minAge !== undefined ? `${rules.minAge}` : '不限'
    const maxText = rules.maxAge !== undefined ? `${rules.maxAge}` : '不限'
    parts.push(`年龄${minText}-${maxText}岁`)
  }

  if (rules.minBirthDate || rules.maxBirthDate) {
    parts.push(`出生日期${rules.minBirthDate || '不限'}~${rules.maxBirthDate || '不限'}`)
  }

  return parts.length > 0 ? parts.join('，') : '无限制'
}
