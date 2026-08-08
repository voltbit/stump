import { useGraphQLMutation } from '@stump/client'
import { Button, CheckBox, Dialog, Text, TextArea } from '@stump/components'
import { BookClubSuggestionStatus, extractErrorMessage, graphql } from '@stump/graphql'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'

const mutation = graphql(`
	mutation ResolveBookClubSuggestion(
		$suggestionId: ID!
		$status: BookClubSuggestionStatus!
		$notes: String
		$promote: Boolean
	) {
		updateSuggestionStatus(
			suggestionId: $suggestionId
			status: $status
			notes: $notes
			promote: $promote
		) {
			id
			status
			notes
			resolvedAt
			resolvedBy {
				id
				username
			}
		}
	}
`)

export type ResolvableSuggestion = {
	id: string
	label: string
}

type Props = {
	isOpen: boolean
	suggestion: ResolvableSuggestion | undefined
	onClose: () => void
	onResolved: () => void
}

/**
 * The admin/creator resolve flow for a pending suggestion: accept or reject, with an optional
 * note explaining the call either way.
 *
 * `promote` is an independent flag, not implied by acceptance - the server only rejects `promote:
 * true` paired with a non-`ACCEPTED` status (`validate_promotion`), but `(ACCEPTED, promote:
 * false)` is an explicitly valid, tested combination (see
 * `validate_promotion_allows_non_promoting_updates_of_any_status` in
 * `crates/graphql/src/mutation/book_club_suggestion.rs`) - e.g. an admin accepting several
 * suggestions before ordering the reading list manually, without each acceptance immediately
 * appending to the end of the queue. The checkbox below surfaces that choice and only applies to
 * Accept; Reject always sends `promote: false` regardless of its state.
 */
export default function ResolveSuggestionDialog({
	isOpen,
	suggestion,
	onClose,
	onResolved,
}: Props) {
	const [notes, setNotes] = useState('')
	const [promote, setPromote] = useState(true)

	useEffect(() => {
		if (isOpen) {
			setNotes('')
			setPromote(true)
		}
	}, [isOpen])

	const { mutate: resolve, isPending } = useGraphQLMutation(mutation, {
		onError: (error) => {
			console.error('Error resolving suggestion:', error)
			toast.error('Failed to resolve suggestion', { description: extractErrorMessage(error) })
		},
		onSuccess: () => {
			onResolved()
		},
	})

	if (!suggestion) {
		return null
	}

	const handleAccept = () => {
		resolve({
			suggestionId: suggestion.id,
			status: BookClubSuggestionStatus.Accepted,
			notes: notes.trim() || undefined,
			promote,
		})
	}

	const handleReject = () => {
		resolve({
			suggestionId: suggestion.id,
			status: BookClubSuggestionStatus.Rejected,
			notes: notes.trim() || undefined,
			promote: false,
		})
	}

	return (
		<Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
			<Dialog.Content size="md">
				<Dialog.Header>
					<Dialog.Title>Resolve suggestion</Dialog.Title>
					<Dialog.Close onClick={onClose} />
				</Dialog.Header>

				<div className="gap-4 flex flex-col">
					<Text size="sm" variant="muted">
						{suggestion.label}
					</Text>

					<TextArea
						label="Resolution notes"
						description="Optional - shown to the club alongside the decision"
						value={notes}
						onChange={(event) => setNotes(event.target.value)}
					/>

					<CheckBox
						label="Add to the reading list"
						description="Only applies if you accept - appends the book to the end of the queue"
						checked={promote}
						onClick={() => setPromote((prev) => !prev)}
					/>
				</div>

				<Dialog.Footer>
					<Button variant="outline" onClick={onClose} disabled={isPending}>
						Cancel
					</Button>
					<Button variant="destructive" onClick={handleReject} disabled={isPending}>
						Reject
					</Button>
					<Button onClick={handleAccept} disabled={isPending}>
						Accept
					</Button>
				</Dialog.Footer>
			</Dialog.Content>
		</Dialog>
	)
}
