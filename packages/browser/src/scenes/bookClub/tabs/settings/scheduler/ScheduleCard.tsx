import { Badge, Button, Card, Text } from '@stump/components'
import { BookClubScheduleKind, FragmentType, graphql, useFragment } from '@stump/graphql'
import { format, parseISO } from 'date-fns'
import { Pencil, Trash2 } from 'lucide-react'
import pluralize from 'pluralize'
import { useMemo } from 'react'

import { parseScheduleConfig } from './types'

export const scheduleCardFragment = graphql(`
	fragment ScheduleCard on BookClubSchedule {
		id
		name
		kind
		config
		createdAt
	}
`)

type Props = {
	schedule: FragmentType<typeof scheduleCardFragment>
	onEdit: () => void
	onDelete: () => void
}

export default function ScheduleCard({ schedule, onEdit, onDelete }: Props) {
	const data = useFragment(scheduleCardFragment, schedule)

	const summary = useMemo(() => summarizeSchedule(data.kind, data.config), [data.kind, data.config])

	return (
		<Card className="gap-4 p-4 flex items-center justify-between">
			<div className="min-w-0 gap-1.5 flex flex-col">
				<div className="gap-2 flex items-center">
					<Text size="sm" className="font-medium">
						{data.name}
					</Text>
					<Badge size="sm">{kindLabel(data.kind)}</Badge>
				</div>

				{summary && (
					<Text size="xs" variant="muted">
						{summary}
					</Text>
				)}
			</div>

			<div className="gap-1 flex shrink-0 items-center">
				<Button size="icon" variant="ghost" onClick={onEdit} title="Edit schedule">
					<Pencil className="h-4 w-4" />
				</Button>
				<Button size="icon" variant="ghost" onClick={onDelete} title="Delete schedule">
					<Trash2 className="h-4 w-4" />
				</Button>
			</div>
		</Card>
	)
}

const kindLabel = (kind: BookClubScheduleKind) =>
	kind === BookClubScheduleKind.UpcomingDiscussion ? 'Upcoming discussion' : 'Interval books'

const summarizeSchedule = (kind: BookClubScheduleKind, config: unknown): string | null => {
	if (kind === BookClubScheduleKind.UpcomingDiscussion) {
		const parsed = parseScheduleConfig('UPCOMING_DISCUSSION', config)
		if (!parsed) return null
		try {
			return `Next meeting: ${format(parseISO(parsed.startsAt), 'PPPp')}`
		} catch {
			return null
		}
	}

	const parsed = parseScheduleConfig('INTERVAL_BOOKS', config)
	if (!parsed) return null

	const { every, unit } = parsed.interval
	const unitLabel = pluralize(unit.toLowerCase(), every)
	const assignmentsCount = parsed.assignments.length

	return `Every ${every} ${unitLabel} • ${assignmentsCount} ${pluralize('book', assignmentsCount)} assigned`
}
