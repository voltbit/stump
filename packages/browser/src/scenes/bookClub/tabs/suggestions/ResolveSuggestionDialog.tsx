import { useGraphQLMutation } from '@stump/client'
import { Button, Dialog, Text, TextArea } from '@stump/components'
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
 * The admin/creator resolve flow for a pending suggestion: accept (which appends the book to
 * the end of the reading list via the server's `promote` transaction) or reject, with an
 * optional note explaining the call either way.
 *
 * Accepting always promotes - the server only lets `promote` accompany `ACCEPTED` (rejecting a
 * suggestion while also adding its book to the queue makes no sense), and there's no use case
 * yet for accepting-without-queueing, so a single "Accept & add to reading list" action covers
 * it rather than exposing a separate checkbox for a state nothing needs.
 */
export default function ResolveSuggestionDialog({
	isOpen,
	suggestion,
	onClose,
	onResolved,
}: Props) {
	const [notes, setNotes] = useState('')

	useEffect(() => {
		if (isOpen) {
			setNotes('')
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
			promote: true,
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
				</div>

				<Dialog.Footer>
					<Button variant="outline" onClick={onClose} disabled={isPending}>
						Cancel
					</Button>
					<Button variant="destructive" onClick={handleReject} disabled={isPending}>
						Reject
					</Button>
					<Button onClick={handleAccept} disabled={isPending}>
						Accept &amp; add to reading list
					</Button>
				</Dialog.Footer>
			</Dialog.Content>
		</Dialog>
	)
}
