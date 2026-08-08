import {
	addReadingListBookSchema,
	buildAddBookInput,
	emptyAddReadingListBookFormValues,
} from '../readingListForm'

describe('addReadingListBookSchema', () => {
	it('requires a library book to be picked in library mode', () => {
		const result = addReadingListBookSchema.safeParse({
			...emptyAddReadingListBookFormValues,
			mode: 'library',
			libraryBookId: '',
		})
		expect(result.success).toBe(false)
	})

	it('accepts library mode once a book is picked', () => {
		const result = addReadingListBookSchema.safeParse({
			...emptyAddReadingListBookFormValues,
			mode: 'library',
			libraryBookId: 'media-1',
			libraryBookLabel: 'Dune',
		})
		expect(result.success).toBe(true)
	})

	it('requires a title and author in external mode', () => {
		const result = addReadingListBookSchema.safeParse({
			...emptyAddReadingListBookFormValues,
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
		const result = addReadingListBookSchema.safeParse({
			...emptyAddReadingListBookFormValues,
			mode: 'external',
			title: '   ',
			author: '   ',
		})
		expect(result.success).toBe(false)
	})

	it('accepts external mode once a title and author are provided', () => {
		const result = addReadingListBookSchema.safeParse({
			...emptyAddReadingListBookFormValues,
			mode: 'external',
			title: 'Dune',
			author: 'Frank Herbert',
		})
		expect(result.success).toBe(true)
	})
})

describe('buildAddBookInput', () => {
	it('builds a stored book input from the picked library book id', () => {
		const input = buildAddBookInput({
			...emptyAddReadingListBookFormValues,
			mode: 'library',
			libraryBookId: 'media-1',
			libraryBookLabel: 'Dune',
		})
		expect(input).toEqual({ book: { stored: { id: 'media-1' } } })
	})

	it('builds an external book input from the title/author/url', () => {
		const input = buildAddBookInput({
			...emptyAddReadingListBookFormValues,
			mode: 'external',
			title: '  Dune  ',
			author: '  Frank Herbert  ',
			url: '  https://example.com  ',
		})
		expect(input).toEqual({
			book: {
				external: {
					title: 'Dune',
					author: 'Frank Herbert',
					url: 'https://example.com',
				},
			},
		})
	})

	it('omits a blank external url rather than sending an empty string', () => {
		const input = buildAddBookInput({
			...emptyAddReadingListBookFormValues,
			mode: 'external',
			title: 'Dune',
			author: 'Frank Herbert',
			url: '   ',
		})
		expect(input).toEqual({
			book: {
				external: {
					title: 'Dune',
					author: 'Frank Herbert',
					url: undefined,
				},
			},
		})
	})
})
