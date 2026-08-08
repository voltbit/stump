import { zodResolver } from '@hookform/resolvers/zod'
import { useGraphQLMutation } from '@stump/client'
import { Button, Dialog, Form, Input, Label } from '@stump/components'
import { BookCardFragment, extractErrorMessage, graphql } from '@stump/graphql'
import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'

import BookSearchOverlay from '@/components/book/BookSearchOverlay'

import {
	AddReadingListBookFormValues,
	addReadingListBookSchema,
	buildAddBookInput,
	emptyAddReadingListBookFormValues,
} from './readingListForm'

const mutation = graphql(`
	mutation AddBookToClub($bookClubId: ID!, $input: AddBookToClubInput!) {
		addBookToClub(bookClubId: $bookClubId, input: $input) {
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

export default function AddReadingListBookDialog({ isOpen, bookClubId, onClose, onAdded }: Props) {
	const form = useForm<AddReadingListBookFormValues>({
		defaultValues: emptyAddReadingListBookFormValues,
		resolver: zodResolver(addReadingListBookSchema),
	})

	useEffect(() => {
		if (isOpen) {
			form.reset(emptyAddReadingListBookFormValues)
		}
	}, [isOpen, form])

	const mode = form.watch('mode')
	const libraryBookLabel = form.watch('libraryBookLabel')

	const { mutate: addBook, isPending } = useGraphQLMutation(mutation, {
		onError: (error) => {
			console.error('Error adding book to club:', error)
			toast.error('Failed to add book', { description: extractErrorMessage(error) })
		},
		onSuccess: () => {
			toast.success('Book added to the reading list')
			onAdded()
		},
	})

	const handleSubmit = (values: AddReadingListBookFormValues) => {
		addBook({ bookClubId, input: buildAddBookInput(values) })
	}

	const handleSelectLibraryBook = (book: BookCardFragment) => {
		form.setValue('libraryBookId', book.id, { shouldValidate: true })
		form.setValue('libraryBookLabel', book.resolvedName, { shouldValidate: true })
	}

	return (
		<Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
			<Dialog.Content size="md">
				<Dialog.Header>
					<Dialog.Title>Add book</Dialog.Title>
					<Dialog.Close onClick={onClose} />
				</Dialog.Header>

				<Form id="add-reading-list-book" form={form} onSubmit={handleSubmit}>
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
				</Form>

				<Dialog.Footer>
					<Button variant="outline" onClick={onClose} disabled={isPending}>
						Cancel
					</Button>
					<Button type="submit" form="add-reading-list-book" disabled={isPending}>
						Add book
					</Button>
				</Dialog.Footer>
			</Dialog.Content>
		</Dialog>
	)
}
