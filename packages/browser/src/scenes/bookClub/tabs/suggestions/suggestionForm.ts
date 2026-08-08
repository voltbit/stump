import { SuggestBookInput } from '@stump/graphql'
import { z } from 'zod'

/**
 * A suggestion can point at an existing piece of media on the server ("library") or describe a
 * book that isn't in the library ("external") - mirrors `addReadingListBookSchema`'s two modes.
 */
export const SUGGEST_BOOK_MODES = ['library', 'external'] as const
export type SuggestBookMode = (typeof SUGGEST_BOOK_MODES)[number]

export const suggestBookSchema = z
	.object({
		mode: z.enum(SUGGEST_BOOK_MODES),
		libraryBookId: z.string(),
		libraryBookLabel: z.string(),
		title: z.string(),
		author: z.string(),
		url: z.string(),
		notes: z.string(),
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
export type SuggestBookFormValues = z.infer<typeof suggestBookSchema>

export const emptySuggestBookFormValues: SuggestBookFormValues = {
	mode: 'library',
	libraryBookId: '',
	libraryBookLabel: '',
	title: '',
	author: '',
	url: '',
	notes: '',
}

/**
 * Builds the `SuggestBookInput` payload from validated form values. Unlike `AddBookToClubInput`,
 * `SuggestBookInput` isn't a `@oneOf` union - it's a flat set of optional fields, and the server
 * decides entity-backed vs free-form based on whether `bookId` is present. The URL and notes are
 * omitted entirely (rather than sent as empty strings) when left blank.
 */
export const buildSuggestBookInput = (values: SuggestBookFormValues): SuggestBookInput => {
	if (values.mode === 'library') {
		return {
			bookId: values.libraryBookId,
			notes: values.notes.trim() || undefined,
		}
	}

	return {
		title: values.title.trim(),
		author: values.author.trim(),
		url: values.url.trim() || undefined,
		notes: values.notes.trim() || undefined,
	}
}
