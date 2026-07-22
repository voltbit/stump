import { Button, Heading, Input, Label, NativeSelect, Text } from '@stump/components'
import { Plus } from 'lucide-react'
import { useFieldArray, useFormContext, useWatch } from 'react-hook-form'

import AssignmentRow from './AssignmentRow'
import {
	ClubBookOption,
	INTERVAL_UNIT_OPTIONS,
	newAssignment,
	ScheduleFormValues,
} from './scheduleForm'

type Props = {
	clubBooks: ClubBookOption[]
}

export default function IntervalBooksFields({ clubBooks }: Props) {
	const form = useFormContext<ScheduleFormValues>()
	const { fields, append, remove } = useFieldArray({ control: form.control, name: 'assignments' })

	const [every, unit, anchor] = useWatch({
		control: form.control,
		name: ['every', 'unit', 'anchor'],
	})

	return (
		<div className="gap-6 flex flex-col">
			<div className="gap-x-4 gap-y-4 md:flex-row md:gap-y-0 flex w-full flex-col items-start">
				<Input
					type="number"
					min={1}
					label="Every"
					errorMessage={form.formState.errors.every?.message}
					{...form.register('every')}
				/>

				<div className="gap-1.5 flex flex-col">
					<Label>Unit</Label>
					<NativeSelect
						options={INTERVAL_UNIT_OPTIONS}
						value={unit}
						onChange={(e) => form.setValue('unit', e.target.value as ScheduleFormValues['unit'])}
					/>
				</div>

				<Input
					type="date"
					label="Anchor date"
					description="The starting point the interval is calculated from"
					descriptionPosition="top"
					errorMessage={form.formState.errors.anchor?.message}
					{...form.register('anchor')}
				/>
			</div>

			<div>
				<Heading size="xs">Book assignments</Heading>
				<Text variant="muted" size="sm" className="mt-1">
					Each row is one assignment period. New rows default to the next period based on the anchor
					date and interval above, but the dates can be adjusted freely.
				</Text>
			</div>

			<div className="gap-4 flex flex-col">
				{fields.map((field, index) => (
					<AssignmentRow
						key={field.id}
						index={index}
						clubBooks={clubBooks}
						onRemove={() => remove(index)}
					/>
				))}
			</div>

			<div>
				<Button
					type="button"
					variant="secondary"
					onClick={() => append(newAssignment(anchor, every, unit, fields.length))}
				>
					<Plus className="mr-1.5 h-4 w-4" />
					Add book
				</Button>
			</div>
		</div>
	)
}
