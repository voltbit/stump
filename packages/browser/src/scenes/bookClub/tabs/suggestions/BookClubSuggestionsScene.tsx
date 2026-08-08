import { useGraphQL, useGraphQLMutation, useSDK } from '@stump/client'
import { Button, Heading } from '@stump/components'
import { BookClubSuggestionStatus, extractErrorMessage, graphql } from '@stump/graphql'
import { AlertTriangle, Plus } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

import { useBookClubContext } from '@/components/bookClub'
import GenericEmptyState from '@/components/GenericEmptyState'

import AddSuggestionDialog from './AddSuggestionDialog'
import ResolveSuggestionDialog, { ResolvableSuggestion } from './ResolveSuggestionDialog'
import SuggestionCard from './SuggestionCard'

const query = graphql(`
	query BookClubSuggestionsScene($bookClubId: ID!) {
		bookClubSuggestions(bookClubId: $bookClubId) {
			id
			status
			title
			author
			...SuggestionCard
		}
	}
`)

const likeMutation = graphql(`
	mutation ToggleBookClubSuggestionLike($suggestionId: ID!) {
		toggleSuggestionLike(suggestionId: $suggestionId)
	}
`)

const suggestionLabel = (suggestion: { title?: string | null; author?: string | null }) => {
	const title = suggestion.title || 'Untitled'
	return suggestion.author ? `${title} by ${suggestion.author}` : title
}

/**
 * Club-wide suggestions tab: any member can suggest a book (entity-backed or free-form) and
 * like/unlike suggestions; admins/creators additionally get a "Resolve" action on each pending
 * suggestion (see `ResolveSuggestionDialog`), which accepts-and-promotes to the reading list or
 * rejects. Follows the same "actionable queue vs read-only history" split as `ReadingListScene`
 * (there: current queue vs previously read books; here: pending vs resolved suggestions).
 *
 * Uses `useGraphQL` (not suspense) so a fetch failure renders a persistent inline error banner
 * instead of a false "no suggestions yet" empty state - same precedent as `PendingInvitations`.
 */
export default function BookClubSuggestionsScene() {
	const { sdk } = useSDK()
	const {
		bookClub: { id: bookClubId },
		viewerCanManage,
		viewerIsMember,
	} = useBookClubContext()

	const { data, error, refetch } = useGraphQL(
		query,
		sdk.cacheKey('bookClubById', [bookClubId, 'suggestions']),
		{ bookClubId },
	)

	const [isAdding, setIsAdding] = useState(false)
	const [resolving, setResolving] = useState<ResolvableSuggestion>()
	const [likingId, setLikingId] = useState<string>()

	const { mutate: toggleLike } = useGraphQLMutation(likeMutation, {
		onError: (mutationError) => {
			console.error('Error toggling suggestion like:', mutationError)
			toast.error('Failed to update like', { description: extractErrorMessage(mutationError) })
			setLikingId(undefined)
		},
		onSuccess: () => {
			setLikingId(undefined)
			refetch()
		},
	})

	const handleToggleLike = (suggestionId: string) => {
		setLikingId(suggestionId)
		toggleLike({ suggestionId })
	}

	const errorMessage = error ? extractErrorMessage(error, 'Failed to load suggestions') : undefined
	const suggestions = data?.bookClubSuggestions ?? []
	const pending = suggestions.filter(
		(suggestion) => suggestion.status === BookClubSuggestionStatus.Pending,
	)
	const resolved = suggestions.filter(
		(suggestion) => suggestion.status !== BookClubSuggestionStatus.Pending,
	)

	return (
		<div className="gap-8 flex flex-col">
			{viewerIsMember && (
				<div className="flex items-center justify-end">
					<Button variant="secondary" size="sm" onClick={() => setIsAdding(true)}>
						<Plus className="mr-1.5 h-4 w-4" />
						Suggest a book
					</Button>
				</div>
			)}

			{errorMessage && (
				<div className="px-3 py-2 text-xs gap-2 flex items-start rounded-md border border-destructive/30 bg-destructive/10 text-destructive">
					<AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
					<span>Couldn&apos;t load suggestions: {errorMessage}</span>
				</div>
			)}

			{!errorMessage && suggestions.length === 0 && (
				<GenericEmptyState
					title="No suggestions yet"
					subtitle="Suggest a book for the club to consider reading next"
					containerClassName="md:justify-start md:items-start"
					contentClassName="md:text-left"
				/>
			)}

			{pending.length > 0 && (
				<div className="gap-3 flex flex-col">
					<Heading size="xs">Pending</Heading>
					{pending.map((suggestion) => (
						<SuggestionCard
							key={suggestion.id}
							data={suggestion}
							canManage={viewerCanManage}
							canLike={viewerIsMember}
							isLikePending={likingId === suggestion.id}
							onToggleLike={() => handleToggleLike(suggestion.id)}
							onResolve={() =>
								setResolving({ id: suggestion.id, label: suggestionLabel(suggestion) })
							}
						/>
					))}
				</div>
			)}

			{resolved.length > 0 && (
				<div className="gap-3 flex flex-col">
					<Heading size="xs">Resolved</Heading>
					{resolved.map((suggestion) => (
						<SuggestionCard
							key={suggestion.id}
							data={suggestion}
							canManage={viewerCanManage}
							canLike={viewerIsMember}
							isLikePending={likingId === suggestion.id}
							onToggleLike={() => handleToggleLike(suggestion.id)}
							onResolve={() => {}}
						/>
					))}
				</div>
			)}

			<AddSuggestionDialog
				isOpen={isAdding}
				bookClubId={bookClubId}
				onClose={() => setIsAdding(false)}
				onAdded={() => {
					setIsAdding(false)
					refetch()
				}}
			/>

			<ResolveSuggestionDialog
				isOpen={!!resolving}
				suggestion={resolving}
				onClose={() => setResolving(undefined)}
				onResolved={() => {
					setResolving(undefined)
					refetch()
					toast.success('Suggestion resolved')
				}}
			/>
		</div>
	)
}
