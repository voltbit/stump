import { CalendarCheck, ListOrdered, NotebookTabs, PackageX, Tag, Users } from 'lucide-react'

import { RouteGroup } from '@/hooks/useRouteGroups'

export const routeGroups: RouteGroup[] = [
	{
		defaultRoute: 'settings/basics',
		items: [
			{
				icon: NotebookTabs,
				label: 'Basics',
				localeKey: 'basics',
				// permission: 'bookclub:manage',
				to: 'settings/basics',
			},
		],
	},
	{
		defaultRoute: 'members',
		items: [
			{
				icon: Users,
				label: 'Members',
				localeKey: 'members',
				// permission: 'bookclub:manage',
				to: 'settings/members',
			},
			{
				icon: Tag,
				label: 'Roles',
				localeKey: 'roles',
				// permission: 'bookclub:manage',
				to: 'settings/roles',
			},
		],
		label: 'Members',
	},
	{
		defaultRoute: 'settings/reading-list',
		items: [
			{
				icon: ListOrdered,
				label: 'Reading list',
				localeKey: 'reading-list',
				// permission: 'bookclub:manage',
				to: 'settings/reading-list',
			},
		],
	},
	{
		defaultRoute: 'settings/scheduler',
		items: [
			{
				icon: CalendarCheck,
				label: 'Scheduler',
				localeKey: 'scheduling/scheduler',
				// permission: 'bookclub:manage',
				to: 'settings/scheduler',
			},
		],
		label: 'Scheduling',
	},
	{
		defaultRoute: 'settings/danger',
		items: [
			{
				icon: PackageX,
				label: 'Delete',
				localeKey: 'danger-zone/delete',
				// permission: 'bookclub:manage',
				to: 'settings/delete',
			},
		],
		label: 'Danger Zone',
	},
]
