import { useGraphQLMutation, useSDK, useSuspenseGraphQL } from '@stump/client'
import { Button } from '@stump/components'
import { BookClubSchedulerSceneQuery, extractErrorMessage, graphql } from '@stump/graphql'
import { Plus } from 'lucide-react'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'

import GenericEmptyState from '@/components/GenericEmptyState'

import { useBookClubManagement } from '../context'
import CreateOrEditScheduleDialog from './CreateOrEditScheduleDialog'
import DeleteScheduleConfirmation from './DeleteScheduleConfirmation'
import ScheduleCard from './ScheduleCard'
import { ClubBookOption } from './scheduleForm'

const query = graphql(`
	query BookClubSchedulerScene($id: ID!) {
		bookClubById(id: $id) {
			id
			schedules {
				id
				...ScheduleCard
			}
			books(pagination: { none: { unpaginated: true } }) {
				nodes {
					id
					title
					author
					url
					bookEntityId
					entity {
						id
						resolvedName
					}
				}
			}
		}
	}
`)

const deleteMutation = graphql(`
	mutation DeleteBookClubSchedule($bookClubId: ID!, $id: ID!) {
		deleteBookClubSchedule(bookClubId: $bookClubId, id: $id) {
			id
		}
	}
`)

type ScheduleNode = BookClubSchedulerSceneQuery['bookClubById']['schedules'][number]

export default function BookClubSchedulerScene() {
	const { sdk } = useSDK()
	const {
		club: { id: bookClubId },
	} = useBookClubManagement()

	const {
		data: {
			bookClubById: { schedules, books },
		},
		refetch,
	} = useSuspenseGraphQL(query, sdk.cacheKey('bookClubById', [bookClubId, 'schedules']), {
		id: bookClubId,
	})

	const clubBooks = useMemo<ClubBookOption[]>(
		() =>
			books.nodes.map((book) => ({
				id: book.id,
				label: book.entity?.resolvedName ?? book.title ?? 'Untitled',
				bookEntityId: book.bookEntityId,
				title: book.title,
				author: book.author,
				url: book.url,
			})),
		[books],
	)

	const [dialogOpen, setDialogOpen] = useState(false)
	const [editing, setEditing] = useState<ScheduleNode | null>(null)
	const [deleting, setDeleting] = useState<ScheduleNode | null>(null)

	const openCreate = () => {
		setEditing(null)
		setDialogOpen(true)
	}

	const openEdit = (schedule: ScheduleNode) => {
		setEditing(schedule)
		setDialogOpen(true)
	}

	const { mutate: deleteSchedule } = useGraphQLMutation(deleteMutation, {
		onError: (error) => {
			console.error(error)
			toast.error('Failed to delete schedule', { description: extractErrorMessage(error) })
		},
		onSuccess: () => {
			toast.success('Schedule deleted')
			refetch()
		},
	})

	return (
		<div className="gap-4 flex flex-col">
			{schedules.length === 0 && (
				<GenericEmptyState
					title="No schedules yet"
					subtitle="Create a schedule to plan an upcoming discussion or assign books on a recurring interval"
					containerClassName="md:justify-start md:items-start"
					contentClassName="md:text-left"
				/>
			)}

			{schedules.length > 0 && (
				<div className="gap-3 flex flex-col">
					{schedules.map((schedule) => (
						<ScheduleCard
							key={schedule.id}
							schedule={schedule}
							onEdit={() => openEdit(schedule)}
							onDelete={() => setDeleting(schedule)}
						/>
					))}
				</div>
			)}

			<div>
				<Button variant="secondary" onClick={openCreate}>
					<Plus className="mr-1.5 h-4 w-4" />
					Create schedule
				</Button>
			</div>

			<CreateOrEditScheduleDialog
				isOpen={dialogOpen}
				bookClubId={bookClubId}
				editing={editing}
				clubBooks={clubBooks}
				onClose={() => setDialogOpen(false)}
				onSuccess={() => refetch()}
			/>

			<DeleteScheduleConfirmation
				isOpen={!!deleting}
				onClose={(didConfirm) => {
					if (didConfirm && deleting) {
						deleteSchedule({ bookClubId, id: deleting.id })
					}
					setDeleting(null)
				}}
			/>
		</div>
	)
}
