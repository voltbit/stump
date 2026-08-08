import { zodResolver } from '@hookform/resolvers/zod'
import { useGraphQLMutation } from '@stump/client'
import { Button, Dialog, Form, Input, Label, TextArea } from '@stump/components'
import { BookCardFragment, extractErrorMessage, graphql } from '@stump/graphql'
import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'

import BookSearchOverlay from '@/components/book/BookSearchOverlay'

import {
	buildSuggestBookInput,
	emptySuggestBookFormValues,
	SuggestBookFormValues,
	suggestBookSchema,
} from './suggestionForm'

const mutation = graphql(`
	mutation SuggestBookClubBook($bookClubId: ID!, $input: SuggestBookInput!) {
		suggestBook(bookClubId: $bookClubId, input: $input) {
			id
		}
	}
`)

type Props = {
	isOpen: boolean
	bookClubId: string
	onClose: () => void
	onAdded: () => void
}

/**
 * A dialog for suggesting a book to the club: either an existing piece of media from the
 * server's library, or a free-form external entry. Modeled directly on
 * `AddReadingListBookDialog` - the reading list's "add a book" flow is the same shape as
 * suggesting one, plus an optional note explaining the pick.
 */
export default function AddSuggestionDialog({ isOpen, bookClubId, onClose, onAdded }: Props) {
	const form = useForm<SuggestBookFormValues>({
		defaultValues: emptySuggestBookFormValues,
		resolver: zodResolver(suggestBookSchema),
	})

	useEffect(() => {
		if (isOpen) {
			form.reset(emptySuggestBookFormValues)
		}
	}, [isOpen, form])

	const mode = form.watch('mode')
	const libraryBookLabel = form.watch('libraryBookLabel')

	const { mutate: suggestBook, isPending } = useGraphQLMutation(mutation, {
		onError: (error) => {
			console.error('Error suggesting book:', error)
			toast.error('Failed to suggest book', { description: extractErrorMessage(error) })
		},
		onSuccess: () => {
			toast.success('Suggestion added')
			onAdded()
		},
	})

	const handleSubmit = (values: SuggestBookFormValues) => {
		suggestBook({ bookClubId, input: buildSuggestBookInput(values) })
	}

	const handleSelectLibraryBook = (book: BookCardFragment) => {
		form.setValue('libraryBookId', book.id, { shouldValidate: true })
		form.setValue('libraryBookLabel', book.resolvedName, { shouldValidate: true })
	}

	return (
		<Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
			<Dialog.Content size="md">
				<Dialog.Header>
					<Dialog.Title>Suggest a book</Dialog.Title>
					<Dialog.Close onClick={onClose} />
				</Dialog.Header>

				<Form id="suggest-book" form={form} onSubmit={handleSubmit}>
					<div>
						<Label>Source</Label>
						<div className="mt-1.5 gap-2 flex">
							<Button
								type="button"
								size="sm"
								variant={mode === 'library' ? 'default' : 'outline'}
								onClick={() => form.setValue('mode', 'library')}
							>
								From library
							</Button>
							<Button
								type="button"
								size="sm"
								variant={mode === 'external' ? 'default' : 'outline'}
								onClick={() => form.setValue('mode', 'external')}
							>
								External book
							</Button>
						</div>
					</div>

					{mode === 'library' && (
						<div className="gap-1.5 flex flex-col">
							<BookSearchOverlay
								onBookSelect={handleSelectLibraryBook}
								sheetProps={{
									trigger: (
										<Button type="button" variant="secondary">
											{libraryBookLabel || 'Search for a book...'}
										</Button>
									),
								}}
							/>
							{form.formState.errors.libraryBookId && (
								<span className="text-xs text-destructive">
									{form.formState.errors.libraryBookId.message}
								</span>
							)}
						</div>
					)}

					{mode === 'external' && (
						<div className="gap-4 flex flex-col">
							<Input
								fullWidth
								label="Title"
								errorMessage={form.formState.errors.title?.message}
								{...form.register('title')}
							/>
							<Input
								label="Author"
								errorMessage={form.formState.errors.author?.message}
								{...form.register('author')}
							/>
							<Input label="URL" description="Optional" {...form.register('url')} />
						</div>
					)}

					<TextArea
						label="Notes"
						description="Optional - let the club know why you're suggesting it"
						{...form.register('notes')}
					/>
				</Form>

				<Dialog.Footer>
					<Button variant="outline" onClick={onClose} disabled={isPending}>
						Cancel
					</Button>
					<Button type="submit" form="suggest-book" disabled={isPending}>
						Suggest book
					</Button>
				</Dialog.Footer>
			</Dialog.Content>
		</Dialog>
	)
}
