import { useGraphQL, useSDK } from '@stump/client'
import { Badge, ButtonOrLink, Card, cx, Heading, Text } from '@stump/components'
import { extractErrorMessage, graphql, UserPermission } from '@stump/graphql'
import { AlertTriangle, Club } from 'lucide-react'
import pluralize from 'pluralize'
import { Helmet } from 'react-helmet'

import { SceneContainer } from '@/components/container'
import { useAppContext } from '@/context'
import paths from '@/paths'

// The API has no join/join-request mutation for public clubs (checked mutation/book_club_member.rs
// and mutation/book_club_invitation.rs) - membership is only granted by accepting an invitation or
// being added by an admin. So this scene is discovery + view only; there is intentionally no "join"
// action here. `bookClubs(all: true)` returns every club the caller is *allowed to see*, which
// includes private clubs they're already a member of (and, for a server owner, literally every
// club) - `isPrivate` is filtered client-side below to keep this scene to public clubs only.
const query = graphql(`
	query BookClubExploreScene {
		bookClubs(all: true) {
			id
			name
			slug
			description
			emoji
			isPrivate
			membersCount
			membership {
				id
			}
		}
	}
`)

/**
 * A scene for discovering public book clubs, including ones the viewer isn't a member of. There
 * is no join/request-to-join mutation on the backend (see the query comment above), so this is a
 * read-only directory: each club links through to its own page, where an invited or admin-added
 * member would go to actually participate.
 *
 * Uses `useGraphQL` (not suspense) so a fetch failure renders a persistent inline error banner
 * instead of a false "no clubs" empty state - same precedent as `PendingInvitations` and
 * `BookClubSuggestionsScene`.
 */
export default function BookClubExploreScene() {
	const { sdk } = useSDK()
	const { checkPermission } = useAppContext()

	const { data, error } = useGraphQL(query, sdk.cacheKey('bookClubs', ['explore']))

	const errorMessage = error
		? extractErrorMessage(error, 'Failed to load public book clubs')
		: undefined
	const publicClubs = (data?.bookClubs ?? []).filter((club) => !club.isPrivate)

	const canCreate = checkPermission(UserPermission.CreateBookClub)

	const renderClub = (club: (typeof publicClubs)[number]) => (
		<>
			<div className="min-w-0 gap-x-3 flex items-start">
				<span className="mt-0.5 h-6 w-6 text-base flex shrink-0 items-center justify-center">
					{club.emoji || <Club className="h-4 w-4 text-muted-foreground" />}
				</span>
				<div className="min-w-0">
					<div className="gap-x-3 flex items-center">
						<Text size="sm" className="font-semibold leading-6">
							{club.name}
						</Text>
						{club.membership && (
							<Badge size="xs" className="shrink-0">
								Member
							</Badge>
						)}
					</div>
					<div className="mt-1 gap-x-2 text-xs leading-5 flex items-center text-gray-500">
						{club.description && (
							<Text className="truncate" size="xs" variant="muted">
								{club.description}
							</Text>
						)}
						<svg viewBox="0 0 2 2" className="h-0.5 w-0.5 shrink-0 fill-current">
							<circle cx={1} cy={1} r={1} />
						</svg>
						<p className="shrink-0">{pluralize('member', club.membersCount, true)}</p>
					</div>
				</div>
			</div>
			<div className="gap-x-4 flex flex-none items-center">
				<ButtonOrLink href={paths.bookClub(club.slug)} variant="secondary">
					View club
				</ButtonOrLink>
			</div>
		</>
	)

	const renderContent = () => {
		if (errorMessage) {
			return (
				<div className="px-3 py-2 text-sm gap-2 flex items-start rounded-md border border-destructive/30 bg-destructive/10 text-destructive">
					<AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
					<span>Couldn&apos;t load public book clubs: {errorMessage}</span>
				</div>
			)
		}

		if (!publicClubs.length) {
			const subtitle = canCreate
				? 'Try creating one yourself!'
				: 'Reach out to someone who can create one for you!'
			return (
				<Card className="p-6 flex items-center justify-center border-dashed">
					<div className="gap-3 flex flex-col items-center">
						<Heading size="xs">No public book clubs found</Heading>
						<Text size="sm" variant="muted">
							{subtitle}
						</Text>
						{canCreate && (
							<ButtonOrLink href={paths.bookClubCreate()} variant="secondary">
								Create a book club
							</ButtonOrLink>
						)}
					</div>
				</Card>
			)
		}

		return (
			<>
				<Heading>Explore book clubs</Heading>
				<ul role="list" className="divide-y divide-gray-100">
					{publicClubs.map((club) => (
						<li
							key={club.id}
							className="gap-x-6 px-4 py-5 sm:px-6 lg:px-8 relative flex justify-between hover:bg-gray-50 dark:hover:bg-gray-900"
						>
							{renderClub(club)}
						</li>
					))}
				</ul>
			</>
		)
	}

	return (
		<SceneContainer
			className={cx({
				'flex h-full items-center justify-center': !errorMessage && !publicClubs.length,
			})}
		>
			<Helmet>
				<title>Stump | Explore Book Clubs</title>
			</Helmet>

			{renderContent()}
		</SceneContainer>
	)
}
