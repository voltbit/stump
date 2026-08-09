import { cn, cx, Link } from '@stump/components'
import { useMemo } from 'react'
import { useLocation } from 'react-router'

import { useBookClubContext } from '@/components/bookClub'
import { usePreferences } from '@/hooks'

export default function BookClubNavigation() {
	const location = useLocation()
	const {
		preferences: { primaryNavigationMode, layoutMaxWidthPx },
	} = usePreferences()
	const { viewerIsMember, viewerCanManage } = useBookClubContext()

	const tabs = useMemo(() => {
		const base = [
			{
				isActive: location.pathname.match(/\/clubs\/[^/]+\/?(home)?$/),
				label: 'Home',
				to: '.',
			},
		]

		if (!viewerIsMember) {
			return base
		}

		return [
			...base,
			{
				isActive: location.pathname.match(/\/clubs\/[^/]+\/suggestions(\/.*)?$/),
				label: 'Suggestions',
				to: 'suggestions',
			},
			{
				isActive: location.pathname.match(/\/clubs\/[^/]+\/members(\/.*)?$/),
				label: 'Members',
				to: 'members',
			},
			// Settings is Admin/Creator-only, matching mobile's admin-gated edit form - a plain
			// member has no settings to manage (and, notably, no leave-club affordance here yet)
			...(viewerCanManage
				? [
						{
							isActive: location.pathname.match(/\/clubs\/[^/]+\/settings(\/.*)?$/),
							label: 'Settings',
							to: 'settings',
						},
					]
				: []),
		]
	}, [location, viewerIsMember, viewerCanManage])

	const preferTopBar = primaryNavigationMode === 'TOPBAR'

	// Don't bother rendering navigation if the user doesn't have access to any other tabs
	if (tabs.length <= 1) {
		return null
	}

	return (
		<div className="top-0 md:relative md:top-[unset] md:z-[unset] sticky z-10 w-full border-b border-border bg-background">
			<nav
				className={cn(
					'gap-x-6 px-3 md:overflow-x-hidden -mb-px scrollbar-hide flex overflow-x-scroll',
					{
						'mx-auto': preferTopBar && !!layoutMaxWidthPx,
					},
				)}
				style={{ maxWidth: preferTopBar ? layoutMaxWidthPx || undefined : undefined }}
			>
				{tabs.map((tab) => (
					<Link
						to={tab.to}
						key={tab.to}
						underline={false}
						className={cx('px-1 py-3 text-sm font-medium border-b-2 whitespace-nowrap', {
							'text-brand border-primary': tab.isActive,
							'border-transparent text-muted-foreground hover:border-border': !tab.isActive,
						})}
					>
						{tab.label}
					</Link>
				))}
			</nav>
		</div>
	)
}
