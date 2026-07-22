import { zodResolver } from '@hookform/resolvers/zod'
import { useGraphQLMutation } from '@stump/client'
import { Button, Dialog, Form, Input, Label, NativeSelect } from '@stump/components'
import {
	BookClubScheduleKind,
	extractErrorMessage,
	FragmentType,
	graphql,
	useFragment,
} from '@stump/graphql'
import { useEffect, useMemo } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { toast } from 'sonner'

import IntervalBooksFields from './IntervalBooksFields'
import { scheduleCardFragment } from './ScheduleCard'
import {
	buildScheduleInput,
	ClubBookOption,
	editingFormValues,
	emptyFormValues,
	SCHEDULE_KIND_OPTIONS,
	scheduleFormSchema,
	ScheduleFormValues,
} from './scheduleForm'
import UpcomingDiscussionFields from './UpcomingDiscussionFields'

const createMutation = graphql(`
	mutation CreateBookClubSchedule($bookClubId: ID!, $input: CreateBookClubScheduleInput!) {
		createBookClubSchedule(bookClubId: $bookClubId, input: $input) {
			id
		}
	}
`)

const updateMutation = graphql(`
	mutation UpdateBookClubSchedule(
		$bookClubId: ID!
		$id: ID!
		$input: UpdateBookClubScheduleInput!
	) {
		updateBookClubSchedule(bookClubId: $bookClubId, id: $id, input: $input) {
			id
		}
	}
`)

type Props = {
	isOpen: boolean
	bookClubId: string
	editing: FragmentType<typeof scheduleCardFragment> | null
	clubBooks: ClubBookOption[]
	onClose: () => void
	onSuccess: () => void
}

export default function CreateOrEditScheduleDialog({
	isOpen,
	bookClubId,
	editing,
	clubBooks,
	onClose,
	onSuccess,
}: Props) {
	const data = useFragment(scheduleCardFragment, editing)
	const isEditing = data != null

	const defaultValues = useMemo(
		() => (data ? editingFormValues(data, clubBooks) : emptyFormValues),
		[data, clubBooks],
	)

	const form = useForm<ScheduleFormValues>({
		defaultValues,
		resolver: zodResolver(scheduleFormSchema),
	})

	useEffect(() => {
		if (isOpen) {
			form.reset(defaultValues)
		}
	}, [isOpen, defaultValues, form])

	const kind = useWatch({ control: form.control, name: 'kind' })

	const { mutate: create, isPending: isCreating } = useGraphQLMutation(createMutation, {
		onError: (error) => {
			console.error(error)
			toast.error('Failed to create schedule', { description: extractErrorMessage(error) })
		},
		onSuccess: () => {
			toast.success('Schedule created')
			onClose()
			onSuccess()
		},
	})

	const { mutate: update, isPending: isUpdating } = useGraphQLMutation(updateMutation, {
		onError: (error) => {
			console.error(error)
			toast.error('Failed to update schedule', { description: extractErrorMessage(error) })
		},
		onSuccess: () => {
			toast.success('Schedule updated')
			onClose()
			onSuccess()
		},
	})

	const isBusy = isCreating || isUpdating

	const handleSubmit = (values: ScheduleFormValues) => {
		const input = buildScheduleInput(values, clubBooks)
		if (isEditing && data) {
			update({ bookClubId, id: data.id, input })
		} else {
			create({ bookClubId, input })
		}
	}

	const formId = isEditing ? 'edit-book-club-schedule' : 'create-book-club-schedule'

	return (
		<Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
			<Dialog.Content size="lg">
				<Dialog.Header>
					<Dialog.Title>{isEditing ? 'Edit schedule' : 'Create schedule'}</Dialog.Title>
					<Dialog.Close onClick={onClose} />
				</Dialog.Header>

				<Form id={formId} form={form} onSubmit={handleSubmit}>
					<div className="gap-4 flex flex-col">
						<Input
							label="Name"
							placeholder="e.g. Weekly discussion"
							errorMessage={form.formState.errors.name?.message}
							{...form.register('name')}
						/>

						<div className="gap-1.5 flex flex-col">
							<Label>Kind</Label>
							<NativeSelect
								disabled={isEditing}
								value={kind}
								options={SCHEDULE_KIND_OPTIONS}
								onChange={(e) =>
									form.setValue('kind', e.target.value as BookClubScheduleKind, {
										shouldValidate: true,
									})
								}
							/>
						</div>

						{kind === BookClubScheduleKind.UpcomingDiscussion && <UpcomingDiscussionFields />}
						{kind === BookClubScheduleKind.IntervalBooks && (
							<IntervalBooksFields clubBooks={clubBooks} />
						)}
					</div>
				</Form>

				<Dialog.Footer>
					<Button variant="outline" onClick={onClose} disabled={isBusy}>
						Cancel
					</Button>
					<Button type="submit" form={formId} disabled={isBusy}>
						{isEditing ? 'Save changes' : 'Create'}
					</Button>
				</Dialog.Footer>
			</Dialog.Content>
		</Dialog>
	)
}
