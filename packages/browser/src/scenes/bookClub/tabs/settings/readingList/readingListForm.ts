import { AddBookToClubInput } from '@stump/graphql'
import { z } from 'zod'

/**
 * A book can be added to a club's reading list either by picking an existing piece of media
 * from the server ("library") or by describing a book that isn't in the library ("external")
 */
export const ADD_BOOK_MODES = ['library', 'external'] as const
export type AddBookMode = (typeof ADD_BOOK_MODES)[number]

export const addReadingListBookSchema = z
	.object({
		mode: z.enum(ADD_BOOK_MODES),
		libraryBookId: z.string(),
		libraryBookLabel: z.string(),
		title: z.string(),
		author: z.string(),
		url: z.string(),
	})
	.superRefine((values, ctx) => {
		if (values.mode === 'library' && !values.libraryBookId) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: 'Pick a book from the library',
				path: ['libraryBookId'],
			})
		}
		if (values.mode === 'external') {
			if (!values.title.trim()) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					message: 'A title is required',
					path: ['title'],
				})
			}
			if (!values.author.trim()) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					message: 'An author is required',
					path: ['author'],
				})
			}
		}
	})
export type AddReadingListBookFormValues = z.infer<typeof addReadingListBookSchema>

export const emptyAddReadingListBookFormValues: AddReadingListBookFormValues = {
	mode: 'library',
	libraryBookId: '',
	libraryBookLabel: '',
	title: '',
	author: '',
	url: '',
}

/**
 * Builds the `AddBookToClubInput` payload from validated form values. In library mode, only the
 * picked media's ID is sent (the server resolves the rest). In external mode, the URL is omitted
 * entirely (rather than sent as an empty string) when left blank.
 */
export const buildAddBookInput = (values: AddReadingListBookFormValues): AddBookToClubInput => {
	if (values.mode === 'library') {
		return { book: { stored: { id: values.libraryBookId } } }
	}

	return {
		book: {
			external: {
				title: values.title.trim(),
				author: values.author.trim(),
				url: values.url.trim() || undefined,
			},
		},
	}
}
