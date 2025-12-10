# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

An event registration and review system for sports competitions, built with Next.js 15 and Supabase. The system has two main interfaces:
- **Admin Panel** (`/events`, `/events/[id]`): Event management, registration settings, and review submissions
- **User Portal** (`/portal`): Event browsing, team registration, and submission tracking

## Development Commands

```bash
# Development
npm run dev          # Start dev server with Turbopack
pnpm dev            # Alternative using pnpm

# Build & Production
npm run build       # Build for production
npm start           # Start production server

# Linting
npm run lint        # Run ESLint
```

## Architecture

### Tech Stack
- **Framework**: Next.js 15 (App Router)
- **Database**: Supabase PostgreSQL with Row Level Security (RLS)
- **Auth**: Supabase Auth with Custom SMTP
- **Storage**: Supabase Storage for images
- **UI**: shadcn/ui components with Tailwind CSS
- **Forms**: React Hook Form + Zod validation
- **State**: React Hooks + Context API
- **Drag & Drop**: @dnd-kit for field ordering

### Key Directory Structure

```
app/
├── auth/                 # Authentication pages (login, register, forgot-password)
├── events/               # Admin panel
│   ├── create/          # Create event page
│   └── [id]/            # Event management (tabs: basic info, registration settings, submissions)
├── portal/              # User portal
│   ├── events/[id]/     # Event details & registration
│   └── my/              # User dashboard, registrations, notifications
├── player-share/[token] # Shared player info pages
└── api/
    ├── events/          # Event CRUD APIs
    ├── portal/          # Portal-specific APIs
    └── upload/          # File upload handler

components/
├── event-manage/        # Admin components (basic-info-tab, registration-settings-tab)
├── portal/              # Portal components
└── ui/                  # shadcn/ui components

lib/
├── auth.ts              # Authentication helpers
├── supabase/            # Supabase client utilities
└── types/               # TypeScript type definitions
```

### Database Schema

Core tables:
- `events` - Event basic information (name, dates, type, poster, details)
- `registration_settings` - Dynamic form configuration stored as JSONB
  - `team_requirements`: Fields for team registration + time constraints
  - `player_requirements`: Fields for player info + age/gender/count constraints
- `registrations` - User submissions with status tracking
- `players` - Player information linked to registrations

## Critical Implementation Patterns

### 1. Time Validation Logic

The system enforces strict time constraints with **real-time validation**:

```
Timeline: Registration Start → Registration End → Review End → Event Start → Event End
```

**Five validation rules** (enforced in real-time as users type):
1. Event Start ≤ Event End
2. Registration Start < Registration End
3. Registration End < Review End
4. Registration End < Event Start
5. Review End < Event Start

**Implementation locations:**
- `app/events/create/page.tsx:81-102` - Create event validation
- `components/event-manage/basic-info-tab.tsx:95-116` - Edit event validation
- `components/event-manage/registration-settings-tab.tsx:213-276` - Registration settings validation

Error messages show **specific time values** to help users understand violations:
```
⚠️ 报名结束时间必须早于比赛开始时间（当前比赛开始时间为：2025-03-15）
```

### 2. Dynamic Form Generation

Registration forms are dynamically generated based on admin configuration:

```typescript
// Field types supported
type FieldType = 'text' | 'image' | 'select' | 'multiselect' | 'date'

// Fields are stored in registration_settings.team_requirements.allFields
// and rendered based on their type and `required` flag
```

**Drag-and-drop ordering** using @dnd-kit allows admins to reorder form fields.

### 3. Authentication Flow

Role-based routing after login:
```typescript
const user = await supabase.auth.getUser()
if (user?.user_metadata?.role === 'admin') {
  router.push('/')  // Admin panel
} else {
  router.push('/portal')  // User portal
}
```

Admin sessions validated via `getCurrentAdminSession()` in API routes.

### 4. File Upload Pattern

```typescript
// 1. Upload to Supabase Storage via /api/upload
const formData = new FormData()
formData.append('file', file)
formData.append('bucket', 'event-posters')  // or 'registration-files'

const response = await fetch('/api/upload', {
  method: 'POST',
  body: formData
})

// 2. Store returned URL in database
const { data: { url } } = await response.json()
```

### 5. Registration Status Flow

```
draft → submitted → approved/rejected
                 ↓
              (can resubmit if rejected)
```

Status tracked in `registrations.status` column.

## Important Conventions

### Date/Time Handling
- Event dates: `date` type (YYYY-MM-DD)
- Registration/review times: `datetime-local` type (YYYY-MM-DD HH:mm)
- Format display using custom `formatDate()` and `formatDateTime()` helpers

### Error Handling
- API responses: `{ success: boolean, data?: any, error?: string }`
- Form errors: React Hook Form + Zod with inline field validation
- Real-time warnings: Amber text (`text-amber-600`) for non-blocking warnings
- Blocking errors: Red text (`text-red-600`) with form submission prevention

### Component Patterns
- Use `'use client'` for interactive components
- Server components for data fetching when possible
- Async/await for Supabase queries with proper error handling

## Environment Variables

Required in `.env.local`:
```
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
```

## Testing Accounts

- Admin: `13800138000` / `admin123`
- Coaches: Register via `/auth/register`

## Common Tasks

### Adding a New Field Type
1. Update `FieldConfig` type in registration-settings-tab.tsx
2. Add rendering logic in form components
3. Update validation schema if needed
4. Test drag-and-drop still works

### Modifying Time Validation
- Update validation logic in all three locations (create, edit basic info, registration settings)
- Ensure error messages include specific time values
- Test real-time validation triggers correctly

### Adding New Event Types
Modify `eventTypes` array in:
- `app/events/create/page.tsx`
- `components/event-manage/basic-info-tab.tsx`

## Database Operations Best Practices

```typescript
// ✅ Good - Use Supabase client
const supabase = await createSupabaseServer()
const { data, error } = await supabase
  .from('events')
  .select('*')
  .eq('id', eventId)
  .single()

// ❌ Bad - Direct SQL (bypasses RLS)
// Don't write raw SQL queries in application code
```

## Portal Development Notes

The user portal (`/portal`) allows coaches to:
1. Browse visible events
2. Submit team registrations with dynamic forms
3. Track submission status
4. Receive notifications when status changes
5. Share player information via unique tokens

Portal APIs are separate from admin APIs (`/api/portal/*` vs `/api/events/*`).
