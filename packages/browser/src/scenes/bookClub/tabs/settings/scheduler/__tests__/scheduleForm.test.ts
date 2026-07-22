import { BookClubScheduleKind } from '@stump/graphql'

import {
	assignmentFormValue,
	buildScheduleInput,
	ClubBookOption,
	computeDefaultPeriod,
	editingFormValues,
	emptyFormValues,
	scheduleFormSchema,
	ScheduleFormValues,
} from '../scheduleForm'
import { IntervalAssignment } from '../types'

const clubBooks: ClubBookOption[] = [
	{
		id: 'club-book-1',
		label: 'Dune',
		bookEntityId: 'entity-1',
		title: 'Dune',
		author: 'Frank Herbert',
		url: null,
	},
	{
		id: 'club-book-2',
		label: 'An externally tracked book',
		bookEntityId: null,
		title: 'External Title',
		author: 'External Author',
		url: 'https://example.com',
	},
]

describe('computeDefaultPeriod', () => {
	it('computes the first period starting on the anchor date', () => {
		const { startsOn, endsOn } = computeDefaultPeriod('2026-08-01', 2, 'WEEK', 0)
		expect(startsOn).toBe('2026-08-01')
		expect(endsOn).toBe('2026-08-14')
	})

	it('computes subsequent periods offset by the interval', () => {
		const { startsOn, endsOn } = computeDefaultPeriod('2026-08-01', 2, 'WEEK', 1)
		expect(startsOn).toBe('2026-08-15')
		expect(endsOn).toBe('2026-08-28')
	})

	it('supports month units', () => {
		const { startsOn, endsOn } = computeDefaultPeriod('2026-01-01', 1, 'MONTH', 1)
		expect(startsOn).toBe('2026-02-01')
		expect(endsOn).toBe('2026-02-28')
	})

	it('returns empty strings when the anchor is missing', () => {
		expect(computeDefaultPeriod('', 1, 'WEEK', 0)).toEqual({ startsOn: '', endsOn: '' })
	})
})

describe('buildScheduleInput', () => {
	it('builds an upcoming discussion config', () => {
		const values: ScheduleFormValues = {
			...emptyFormValues,
			name: 'Book chat',
			kind: BookClubScheduleKind.UpcomingDiscussion,
			startsAt: '2026-08-01T18:00',
			recurrence: '  Every other Sunday  ',
		}

		const input = buildScheduleInput(values, clubBooks)
		expect(input.name).toBe('Book chat')
		expect(input.kind).toBe(BookClubScheduleKind.UpcomingDiscussion)
		expect(input.config).toEqual({
			startsAt: new Date('2026-08-01T18:00').toISOString(),
			recurrence: 'Every other Sunday',
		})
	})

	it('nulls out an empty recurrence', () => {
		const values: ScheduleFormValues = {
			...emptyFormValues,
			kind: BookClubScheduleKind.UpcomingDiscussion,
			startsAt: '2026-08-01T18:00',
			recurrence: '   ',
		}

		const input = buildScheduleInput(values, clubBooks)
		expect((input.config as { recurrence: string | null }).recurrence).toBeNull()
	})

	it('resolves a library-picked assignment to its bookEntityId, snapshotting title/author/url', () => {
		const values: ScheduleFormValues = {
			...emptyFormValues,
			kind: BookClubScheduleKind.IntervalBooks,
			every: 2,
			unit: 'WEEK',
			anchor: '2026-08-01',
			assignments: [
				{
					startsOn: '2026-08-01',
					endsOn: '2026-08-14',
					mode: 'library',
					libraryBookId: 'club-book-1',
					title: '',
					author: '',
					url: '',
				},
			],
		}

		const input = buildScheduleInput(values, clubBooks)
		expect(input.config).toEqual({
			interval: { every: 2, unit: 'WEEK', anchor: '2026-08-01' },
			assignments: [
				{
					startsOn: '2026-08-01',
					endsOn: '2026-08-14',
					book: {
						bookEntityId: 'entity-1',
						title: 'Dune',
						author: 'Frank Herbert',
						url: null,
					},
				},
			],
		})
	})

	it('resolves a library-picked assignment without an entity to its stored metadata', () => {
		const values: ScheduleFormValues = {
			...emptyFormValues,
			kind: BookClubScheduleKind.IntervalBooks,
			every: 1,
			unit: 'WEEK',
			anchor: '2026-08-01',
			assignments: [
				{
					startsOn: '2026-08-01',
					endsOn: '2026-08-07',
					mode: 'library',
					libraryBookId: 'club-book-2',
					title: '',
					author: '',
					url: '',
				},
			],
		}

		const input = buildScheduleInput(values, clubBooks)
		expect((input.config as { assignments: { book: unknown }[] }).assignments[0]?.book).toEqual({
			title: 'External Title',
			author: 'External Author',
			url: 'https://example.com',
		})
	})

	it('builds a manual assignment from freeform fields', () => {
		const values: ScheduleFormValues = {
			...emptyFormValues,
			kind: BookClubScheduleKind.IntervalBooks,
			every: 1,
			unit: 'MONTH',
			anchor: '2026-08-01',
			assignments: [
				{
					startsOn: '2026-08-01',
					endsOn: '2026-08-31',
					mode: 'manual',
					libraryBookId: '',
					title: 'A Manual Book',
					author: '',
					url: '',
				},
			],
		}

		const input = buildScheduleInput(values, clubBooks)
		expect((input.config as { assignments: { book: unknown }[] }).assignments[0]?.book).toEqual({
			title: 'A Manual Book',
			author: null,
			url: null,
		})
	})
})

describe('assignmentFormValue', () => {
	it('rehydrates into library mode when the bookEntityId still matches a club book', () => {
		const assignment: IntervalAssignment = {
			startsOn: '2026-08-01',
			endsOn: '2026-08-14',
			book: {
				bookEntityId: 'entity-1',
				title: 'Dune',
				author: 'Frank Herbert',
				url: null,
			},
		}

		const value = assignmentFormValue(assignment, clubBooks)
		expect(value).toEqual({
			startsOn: '2026-08-01',
			endsOn: '2026-08-14',
			mode: 'library',
			libraryBookId: 'club-book-1',
			title: '',
			author: '',
			url: '',
		})
	})

	it('falls back to manual mode populated from the snapshot when the entity is no longer in the reading list', () => {
		const assignment: IntervalAssignment = {
			startsOn: '2026-08-01',
			endsOn: '2026-08-14',
			book: {
				bookEntityId: 'entity-removed',
				title: 'Dune',
				author: 'Frank Herbert',
				url: 'https://example.com/dune',
			},
		}

		const value = assignmentFormValue(assignment, clubBooks)
		expect(value).toEqual({
			startsOn: '2026-08-01',
			endsOn: '2026-08-14',
			mode: 'manual',
			libraryBookId: '',
			title: 'Dune',
			author: 'Frank Herbert',
			url: 'https://example.com/dune',
		})
	})

	it('falls back to manual mode with empty fields when there is no snapshot and no bookEntityId', () => {
		const assignment: IntervalAssignment = {
			startsOn: '2026-08-01',
			endsOn: '2026-08-14',
			book: {},
		}

		const value = assignmentFormValue(assignment, clubBooks)
		expect(value).toEqual({
			startsOn: '2026-08-01',
			endsOn: '2026-08-14',
			mode: 'manual',
			libraryBookId: '',
			title: '',
			author: '',
			url: '',
		})
	})
})

describe('editingFormValues', () => {
	it('rehydrates interval assignments, keeping the snapshot when the club book was removed', () => {
		const schedule = {
			name: 'Reading plan',
			kind: BookClubScheduleKind.IntervalBooks,
			config: {
				interval: { every: 1, unit: 'WEEK', anchor: '2026-08-01' },
				assignments: [
					{
						startsOn: '2026-08-01',
						endsOn: '2026-08-07',
						book: { bookEntityId: 'entity-1', title: 'Dune', author: 'Frank Herbert', url: null },
					},
					{
						startsOn: '2026-08-08',
						endsOn: '2026-08-14',
						book: {
							bookEntityId: 'entity-removed',
							title: 'Old Book',
							author: 'Old Author',
							url: null,
						},
					},
				],
			},
		}

		const values = editingFormValues(schedule, clubBooks)
		expect(values.assignments).toEqual([
			{
				startsOn: '2026-08-01',
				endsOn: '2026-08-07',
				mode: 'library',
				libraryBookId: 'club-book-1',
				title: '',
				author: '',
				url: '',
			},
			{
				startsOn: '2026-08-08',
				endsOn: '2026-08-14',
				mode: 'manual',
				libraryBookId: '',
				title: 'Old Book',
				author: 'Old Author',
				url: '',
			},
		])
	})
})

describe('scheduleFormSchema', () => {
	it('requires a startsAt for an upcoming discussion schedule', () => {
		const result = scheduleFormSchema.safeParse({
			...emptyFormValues,
			name: 'Meeting',
			kind: BookClubScheduleKind.UpcomingDiscussion,
			startsAt: '',
		})
		expect(result.success).toBe(false)
	})

	it('requires an anchor for an interval books schedule', () => {
		const result = scheduleFormSchema.safeParse({
			...emptyFormValues,
			name: 'Reading plan',
			kind: BookClubScheduleKind.IntervalBooks,
			anchor: '',
		})
		expect(result.success).toBe(false)
	})

	it('requires a library selection when an assignment is in library mode', () => {
		const result = scheduleFormSchema.safeParse({
			...emptyFormValues,
			name: 'Reading plan',
			kind: BookClubScheduleKind.IntervalBooks,
			anchor: '2026-08-01',
			assignments: [
				{
					startsOn: '2026-08-01',
					endsOn: '2026-08-07',
					mode: 'library',
					libraryBookId: '',
					title: '',
					author: '',
					url: '',
				},
			],
		})
		expect(result.success).toBe(false)
	})

	it('accepts a well-formed interval books schedule', () => {
		const result = scheduleFormSchema.safeParse({
			...emptyFormValues,
			name: 'Reading plan',
			kind: BookClubScheduleKind.IntervalBooks,
			anchor: '2026-08-01',
			assignments: [
				{
					startsOn: '2026-08-01',
					endsOn: '2026-08-07',
					mode: 'manual',
					libraryBookId: '',
					title: 'A Book',
					author: '',
					url: '',
				},
			],
		})
		expect(result.success).toBe(true)
	})
})
