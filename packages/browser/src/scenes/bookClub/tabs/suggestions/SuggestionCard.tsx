import { Avatar, Badge, Button, Card, cn, Text } from '@stump/components'
import { BookClubSuggestionStatus, FragmentType, graphql, useFragment } from '@stump/graphql'
import { formatDistanceToNow } from 'date-fns'
import { Book, ThumbsUp } from 'lucide-react'
import { match } from 'ts-pattern'

export const suggestionCardFragment = graphql(`
	fragment SuggestionCard on BookClubBookSuggestion {
		id
		title
		author
		url
		notes
		status
		createdAt
		likeCount
		isLikedByMe
		suggestedBy {
			id
			username
			avatarUrl
		}
	}
`)

const STATUS_BADGE_VARIANT: Record<BookClubSuggestionStatus, 'warning' | 'success' | 'error'> = {
	[BookClubSuggestionStatus.Pending]: 'warning',
	[BookClubSuggestionStatus.Accepted]: 'success',
	[BookClubSuggestionStatus.Rejected]: 'error',
}

type Props = {
	data: FragmentType<typeof suggestionCardFragment>
	canManage: boolean
	/** Only members can like/unlike (server-enforced) - non-members see a read-only count */
	canLike: boolean
	isLikePending: boolean
	onToggleLike: () => void
	onResolve: () => void
}

export default function SuggestionCard({
	data,
	canManage,
	canLike,
	isLikePending,
	onToggleLike,
	onResolve,
}: Props) {
	const suggestion = useFragment(suggestionCardFragment, data)

	const title = suggestion.title || 'Untitled'
	const suggestedByName = suggestion.suggestedBy.username

	return (
		<Card className="gap-3 p-3 flex flex-col">
			<div className="gap-3 flex items-start">
				<div className="dark:bg-white/10 h-14 w-10 bg-black/5 flex shrink-0 items-center justify-center rounded-md">
					<Book className="h-4 w-4 text-muted-foreground" />
				</div>

				<div className="min-w-0 gap-0.5 flex flex-1 flex-col">
					<div className="gap-2 flex items-center">
						<Text className="font-medium truncate">{title}</Text>
						<Badge size="xs" variant={STATUS_BADGE_VARIANT[suggestion.status]}>
							{match(suggestion.status)
								.with(BookClubSuggestionStatus.Pending, () => 'Pending')
								.with(BookClubSuggestionStatus.Accepted, () => 'Accepted')
								.with(BookClubSuggestionStatus.Rejected, () => 'Rejected')
								.exhaustive()}
						</Badge>
					</div>
					{suggestion.author && (
						<Text size="sm" variant="muted" className="truncate">
							{suggestion.author}
						</Text>
					)}
					{suggestion.notes && (
						<Text size="sm" variant="muted" className="italic">
							&ldquo;{suggestion.notes}&rdquo;
						</Text>
					)}
				</div>
			</div>

			<div className="gap-2 flex items-center justify-between">
				<div className="gap-2 flex items-center">
					<Avatar
						src={suggestion.suggestedBy.avatarUrl ?? undefined}
						fallback={suggestedByName}
						className="h-5 w-5"
					/>
					<Text size="xs" variant="muted">
						Suggested by {suggestedByName} &middot;{' '}
						{formatDistanceToNow(new Date(suggestion.createdAt), { addSuffix: true })}
					</Text>
				</div>

				<div className="gap-2 flex items-center">
					<Button
						variant="ghost"
						size="sm"
						className={cn('gap-1.5', { 'text-primary': suggestion.isLikedByMe })}
						onClick={onToggleLike}
						disabled={!canLike || isLikePending}
					>
						<ThumbsUp className={cn('h-3.5 w-3.5', { 'fill-current': suggestion.isLikedByMe })} />
						{suggestion.likeCount}
					</Button>

					{canManage && suggestion.status === BookClubSuggestionStatus.Pending && (
						<Button variant="secondary" size="sm" onClick={onResolve}>
							Resolve
						</Button>
					)}
				</div>
			</div>
		</Card>
	)
}
