// 数据库表类型定义

export interface AdminUser {
  id: string;
  phone: string;
  password_hash: string;
  created_at: string;
  updated_at: string;
}

export interface Event {
  id: string;
  name: string;
  short_name?: string;
  poster_url?: string;
  type: string;
  start_date: string;
  end_date: string;
  registration_start_date?: string;
  registration_end_date?: string;
  review_end_date?: string;
  address?: string;
  details?: string;
  phone?: string;
  is_visible: boolean;
  created_at: string;
  updated_at: string;
  registration_settings?: {
    team_requirements?: any;
    player_requirements?: any;
  };
}

export interface RegistrationSettings {
  id: string;
  event_id: string;
  team_requirements?: TeamRequirements;
  player_requirements?: PlayerRequirements;
  created_at: string;
  updated_at: string;
}

export interface Registration {
  id: string;
  event_id: string;
  team_data?: any;
  players_data?: any[];
  status: 'pending' | 'approved' | 'rejected';
  rejection_reason?: string;
  submitted_at: string;
  reviewed_at?: string;
  reviewer_id?: string;
}

// 报名要求类型
export interface CustomField {
  id: string;
  title: string;
  type: 'text' | 'image' | 'select' | 'multiselect';
  required: boolean;
  options?: string[]; // 用于 select 和 multiselect
}

export interface TeamRequirements {
  logo: { required: boolean };
  name: { required: boolean };
  contact_person: { required: boolean };
  contact_phone: { required: boolean };
  school_area: { required: boolean }; // 报名校区，默认必填
  custom_fields: CustomField[];
}

export interface PlayerRequirements {
  name: { required: boolean };
  gender: { required: boolean; options: string[] };
  age: { required: boolean; min?: number; max?: number };
  count: { min: number; max: number };
  roles: PlayerRole[];
  custom_fields: CustomField[];
}

export interface PlayerRole {
  id: string;
  name: string;
  requirements: CustomField[];
}

// 表单类型
export interface LoginFormData {
  phone: string;
  password: string;
}

export interface EventFormData {
  name: string;
  short_name: string;
  type: string;
  start_date: string;
  end_date: string;
  address: string;
  details: string;
  phone: string;
  poster?: File;
}

// API 响应类型
export interface ApiResponse<T = any> {
  data?: T;
  error?: string;
  success: boolean;
}

// 管理员会话类型
export interface AdminSession {
  user: AdminUser;
  expires: string;
}