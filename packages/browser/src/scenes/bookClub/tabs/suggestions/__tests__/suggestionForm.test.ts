import {
	buildSuggestBookInput,
	emptySuggestBookFormValues,
	suggestBookSchema,
} from '../suggestionForm'

describe('suggestBookSchema', () => {
	it('requires a library book to be picked in library mode', () => {
		const result = suggestBookSchema.safeParse({
			...emptySuggestBookFormValues,
			mode: 'library',
			libraryBookId: '',
		})
		expect(result.success).toBe(false)
	})

	it('accepts library mode once a book is picked', () => {
		const result = suggestBookSchema.safeParse({
			...emptySuggestBookFormValues,
			mode: 'library',
			libraryBookId: 'media-1',
			libraryBookLabel: 'Dune',
		})
		expect(result.success).toBe(true)
	})

	it('requires a title and author in external mode', () => {
		const result = suggestBookSchema.safeParse({
			...emptySuggestBookFormValues,
			mode: 'external',
			title: '',
			author: '',
		})
		expect(result.success).toBe(false)
		if (!result.success) {
			const paths = result.error.issues.map((issue) => issue.path.join('.'))
			expect(paths).toEqual(expect.arrayContaining(['title', 'author']))
		}
	})

	it('rejects whitespace-only title/author in external mode', () => {
		const result = suggestBookSchema.safeParse({
			...emptySuggestBookFormValues,
			mode: 'external',
			title: '   ',
			author: '   ',
		})
		expect(result.success).toBe(false)
	})

	it('accepts external mode once a title and author are provided', () => {
		const result = suggestBookSchema.safeParse({
			...emptySuggestBookFormValues,
			mode: 'external',
			title: 'Dune',
			author: 'Frank Herbert',
		})
		expect(result.success).toBe(true)
	})
})

describe('buildSuggestBookInput', () => {
	it('builds a library input from the picked book id, omitting a blank notes field', () => {
		const input = buildSuggestBookInput({
			...emptySuggestBookFormValues,
			mode: 'library',
			libraryBookId: 'media-1',
			libraryBookLabel: 'Dune',
			notes: '   ',
		})
		expect(input).toEqual({ bookId: 'media-1', notes: undefined })
	})

	it('includes trimmed notes for a library suggestion', () => {
		const input = buildSuggestBookInput({
			...emptySuggestBookFormValues,
			mode: 'library',
			libraryBookId: 'media-1',
			notes: '  Great pick  ',
		})
		expect(input).toEqual({ bookId: 'media-1', notes: 'Great pick' })
	})

	it('builds an external input from the title/author/url/notes', () => {
		const input = buildSuggestBookInput({
			...emptySuggestBookFormValues,
			mode: 'external',
			title: '  Dune  ',
			author: '  Frank Herbert  ',
			url: '  https://example.com  ',
			notes: '  Great pick  ',
		})
		expect(input).toEqual({
			title: 'Dune',
			author: 'Frank Herbert',
			url: 'https://example.com',
			notes: 'Great pick',
		})
	})

	it('omits a blank external url and notes rather than sending empty strings', () => {
		const input = buildSuggestBookInput({
			...emptySuggestBookFormValues,
			mode: 'external',
			title: 'Dune',
			author: 'Frank Herbert',
			url: '   ',
			notes: '   ',
		})
		expect(input).toEqual({
			title: 'Dune',
			author: 'Frank Herbert',
			url: undefined,
			notes: undefined,
		})
	})
})
