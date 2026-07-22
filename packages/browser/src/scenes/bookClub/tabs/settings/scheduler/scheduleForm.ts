import { BookClubScheduleKind, CreateBookClubScheduleInput } from '@stump/graphql'
import { addDays, addMonths, addWeeks, format, parseISO, subDays } from 'date-fns'
import { z } from 'zod'

import {
	AssignedBook,
	INTERVAL_UNITS,
	IntervalAssignment,
	IntervalBooksConfig,
	IntervalUnit,
	parseScheduleConfig,
	UpcomingDiscussionConfig,
} from './types'

export const SCHEDULE_KIND_OPTIONS: { label: string; value: BookClubScheduleKind }[] = [
	{ label: 'Upcoming discussion', value: BookClubScheduleKind.UpcomingDiscussion },
	{ label: 'Interval books', value: BookClubScheduleKind.IntervalBooks },
]

export const INTERVAL_UNIT_OPTIONS: { label: string; value: IntervalUnit }[] = [
	{ label: 'Day(s)', value: 'DAY' },
	{ label: 'Week(s)', value: 'WEEK' },
	{ label: 'Month(s)', value: 'MONTH' },
]

/** A book belonging to the club's reading queue, offered as a pickable option in the assignment editor */
export type ClubBookOption = {
	id: string
	label: string
	bookEntityId?: string | null
	title?: string | null
	author?: string | null
	url?: string | null
}

export type AssignmentFormValue = {
	startsOn: string
	endsOn: string
	mode: 'library' | 'manual'
	libraryBookId: string
	title: string
	author: string
	url: string
}

const assignmentFormSchema = z
	.object({
		startsOn: z.string().min(1, 'A start date is required'),
		endsOn: z.string().min(1, 'An end date is required'),
		mode: z.enum(['library', 'manual']),
		libraryBookId: z.string(),
		title: z.string(),
		author: z.string(),
		url: z.string(),
	})
	.superRefine((assignment, ctx) => {
		if (assignment.mode === 'library' && !assignment.libraryBookId) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: 'Pick a book from the reading list',
				path: ['libraryBookId'],
			})
		}
		if (assignment.mode === 'manual' && !assignment.title.trim()) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: 'A title is required',
				path: ['title'],
			})
		}
	})

export const scheduleFormSchema = z
	.object({
		name: z.string().min(1, 'A name is required'),
		kind: z.nativeEnum(BookClubScheduleKind),
		// Upcoming discussion fields
		startsAt: z.string(),
		recurrence: z.string(),
		// Interval books fields
		every: z.coerce.number().int().min(1, 'Must be at least 1'),
		unit: z.enum(INTERVAL_UNITS),
		anchor: z.string(),
		assignments: z.array(assignmentFormSchema),
	})
	.superRefine((values, ctx) => {
		if (values.kind === BookClubScheduleKind.UpcomingDiscussion && !values.startsAt) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: 'A date and time is required',
				path: ['startsAt'],
			})
		}
		if (values.kind === BookClubScheduleKind.IntervalBooks && !values.anchor) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: 'An anchor date is required',
				path: ['anchor'],
			})
		}
	})
export type ScheduleFormValues = z.infer<typeof scheduleFormSchema>

export const emptyFormValues: ScheduleFormValues = {
	name: '',
	kind: BookClubScheduleKind.UpcomingDiscussion,
	startsAt: '',
	recurrence: '',
	every: 1,
	unit: 'WEEK',
	anchor: format(new Date(), 'yyyy-MM-dd'),
	assignments: [],
}

const emptyAssignment: AssignmentFormValue = {
	startsOn: '',
	endsOn: '',
	mode: 'library',
	libraryBookId: '',
	title: '',
	author: '',
	url: '',
}

/**
 * Builds the default form values for editing an existing schedule, resolving each interval
 * assignment's book back to a club reading-list option where possible.
 */
export function editingFormValues(
	schedule: { name: string; kind: BookClubScheduleKind; config: unknown },
	clubBooks: ClubBookOption[],
): ScheduleFormValues {
	if (schedule.kind === BookClubScheduleKind.UpcomingDiscussion) {
		const config = parseScheduleConfig('UPCOMING_DISCUSSION', schedule.config)
		return {
			...emptyFormValues,
			name: schedule.name,
			kind: schedule.kind,
			startsAt: config ? isoToDatetimeLocal(config.startsAt) : '',
			recurrence: config?.recurrence ?? '',
		}
	}

	const config = parseScheduleConfig('INTERVAL_BOOKS', schedule.config)
	return {
		...emptyFormValues,
		name: schedule.name,
		kind: schedule.kind,
		every: config?.interval.every ?? 1,
		unit: config?.interval.unit ?? 'WEEK',
		anchor: config?.interval.anchor ?? emptyFormValues.anchor,
		assignments: config?.assignments.map((a) => assignmentFormValue(a, clubBooks)) ?? [],
	}
}

function assignmentFormValue(
	assignment: IntervalAssignment,
	clubBooks: ClubBookOption[],
): AssignmentFormValue {
	const matched = assignment.book.bookEntityId
		? clubBooks.find((b) => b.bookEntityId === assignment.book.bookEntityId)
		: undefined

	if (matched) {
		return {
			...emptyAssignment,
			startsOn: assignment.startsOn,
			endsOn: assignment.endsOn,
			mode: 'library',
			libraryBookId: matched.id,
		}
	}

	return {
		...emptyAssignment,
		startsOn: assignment.startsOn,
		endsOn: assignment.endsOn,
		mode: 'manual',
		title: assignment.book.title ?? '',
		author: assignment.book.author ?? '',
		url: assignment.book.url ?? '',
	}
}

/** Converts an RFC3339 datetime string into a value usable by a `datetime-local` input (local time) */
function isoToDatetimeLocal(iso: string): string {
	try {
		return format(parseISO(iso), "yyyy-MM-dd'T'HH:mm")
	} catch {
		return ''
	}
}

/** Converts a `datetime-local` input value (local time, no offset) into an RFC3339 datetime string */
function datetimeLocalToIso(value: string): string {
	return new Date(value).toISOString()
}

/**
 * Computes a sensible default period for a new interval assignment based on its position in the
 * sequence. The result remains fully editable in the form.
 */
export function computeDefaultPeriod(
	anchor: string,
	every: number,
	unit: IntervalUnit,
	index: number,
): { startsOn: string; endsOn: string } {
	const anchorDate = anchor ? parseISO(anchor) : null
	if (!anchorDate || Number.isNaN(anchorDate.getTime()) || every < 1) {
		return { startsOn: '', endsOn: '' }
	}

	const addInterval = (date: Date, amount: number) => {
		switch (unit) {
			case 'DAY':
				return addDays(date, amount)
			case 'WEEK':
				return addWeeks(date, amount)
			case 'MONTH':
				return addMonths(date, amount)
		}
	}

	const startsOn = addInterval(anchorDate, every * index)
	const endsOn = subDays(addInterval(anchorDate, every * (index + 1)), 1)

	return {
		startsOn: format(startsOn, 'yyyy-MM-dd'),
		endsOn: format(endsOn, 'yyyy-MM-dd'),
	}
}

export function newAssignment(
	anchor: string,
	every: number,
	unit: IntervalUnit,
	index: number,
): AssignmentFormValue {
	return {
		...emptyAssignment,
		...computeDefaultPeriod(anchor, every, unit, index),
	}
}

function buildAssignedBook(
	assignment: AssignmentFormValue,
	clubBooks: ClubBookOption[],
): AssignedBook {
	if (assignment.mode === 'library') {
		const match = clubBooks.find((b) => b.id === assignment.libraryBookId)
		if (match) {
			return match.bookEntityId
				? { bookEntityId: match.bookEntityId }
				: {
						title: match.title ?? null,
						author: match.author ?? null,
						url: match.url ?? null,
					}
		}
	}

	return {
		title: assignment.title || null,
		author: assignment.author || null,
		url: assignment.url || null,
	}
}

/** Builds the `{ name, kind, config }` input shared by both the create and update mutations */
export function buildScheduleInput(
	values: ScheduleFormValues,
	clubBooks: ClubBookOption[],
): CreateBookClubScheduleInput {
	const config: UpcomingDiscussionConfig | IntervalBooksConfig =
		values.kind === BookClubScheduleKind.UpcomingDiscussion
			? {
					startsAt: datetimeLocalToIso(values.startsAt),
					recurrence: values.recurrence.trim() || null,
				}
			: {
					interval: {
						every: values.every,
						unit: values.unit,
						anchor: values.anchor,
					},
					assignments: values.assignments.map((a) => ({
						startsOn: a.startsOn,
						endsOn: a.endsOn,
						book: buildAssignedBook(a, clubBooks),
					})),
				}

	return {
		name: values.name,
		kind: values.kind,
		config,
	}
}
