import type { UserRole } from '@prisma/client';

/**
 * Матрица прав. Роли:
 *  ADMIN     — всё, включая пользователей.
 *  DEVELOPER — технические настройки: воронки, поля, автоматизации, каналы, журналы; работа с лидами.
 *  MANAGER   — полная работа с лидами, контактами, задачами; без настроек.
 *  OPERATOR  — приём обращений: инбокс, создание лидов и контактов, редактирование только своих лидов.
 */
export const PERMISSIONS = {
  'users.manage': ['ADMIN'],
  'settings.manage': ['ADMIN', 'DEVELOPER'],
  'integrations.manage': ['ADMIN', 'DEVELOPER'],
  'leads.edit_any': ['ADMIN', 'DEVELOPER', 'MANAGER'],
  'leads.reassign': ['ADMIN', 'DEVELOPER', 'MANAGER'],
  'leads.delete': ['ADMIN'],
  'contacts.merge': ['ADMIN', 'DEVELOPER', 'MANAGER'],
  'contacts.edit': ['ADMIN', 'DEVELOPER', 'MANAGER', 'OPERATOR'],
  'tasks.assign_others': ['ADMIN', 'DEVELOPER', 'MANAGER'],
} as const satisfies Record<string, readonly UserRole[]>;

export type Permission = keyof typeof PERMISSIONS;

export function can(role: UserRole, perm: Permission): boolean {
  return (PERMISSIONS[perm] as readonly UserRole[]).includes(role);
}

export const ROLES: UserRole[] = ['ADMIN', 'DEVELOPER', 'MANAGER', 'OPERATOR'];
