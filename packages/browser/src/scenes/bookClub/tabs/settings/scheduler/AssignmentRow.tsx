import { Button, Card, ComboBox, Input, Label } from '@stump/components'
import { Trash2 } from 'lucide-react'
import { useFormContext } from 'react-hook-form'

import { ClubBookOption, ScheduleFormValues } from './scheduleForm'

type Props = {
	index: number
	clubBooks: ClubBookOption[]
	onRemove: () => void
}

export default function AssignmentRow({ index, clubBooks, onRemove }: Props) {
	const form = useFormContext<ScheduleFormValues>()

	const mode = form.watch(`assignments.${index}.mode`)
	const errors = form.formState.errors.assignments?.[index]

	return (
		<Card className="gap-4 p-4 flex w-full flex-col">
			<div className="gap-x-4 gap-y-4 md:flex-row md:gap-y-0 flex w-full flex-col items-start">
				<Input
					type="date"
					label="Starts on"
					errorMessage={errors?.startsOn?.message}
					{...form.register(`assignments.${index}.startsOn`)}
				/>
				<Input
					type="date"
					label="Ends on"
					errorMessage={errors?.endsOn?.message}
					{...form.register(`assignments.${index}.endsOn`)}
				/>
			</div>

			<div>
				<Label>Book</Label>
				<div className="mt-1.5 gap-2 flex">
					<Button
						type="button"
						size="sm"
						variant={mode === 'library' ? 'default' : 'outline'}
						onClick={() => form.setValue(`assignments.${index}.mode`, 'library')}
					>
						From reading list
					</Button>
					<Button
						type="button"
						size="sm"
						variant={mode === 'manual' ? 'default' : 'outline'}
						onClick={() => form.setValue(`assignments.${index}.mode`, 'manual')}
					>
						Enter manually
					</Button>
				</div>
			</div>

			{mode === 'library' && (
				<ComboBox
					label="Pick a book"
					options={clubBooks.map((book) => ({ label: book.label, value: book.id }))}
					value={form.watch(`assignments.${index}.libraryBookId`)}
					onChange={(value) => form.setValue(`assignments.${index}.libraryBookId`, value ?? '')}
					placeholder="Select a book from this club's reading list"
					filterable
				/>
			)}

			{errors?.libraryBookId && (
				<span className="text-xs text-destructive">{errors.libraryBookId.message}</span>
			)}

			{mode === 'manual' && (
				<div className="gap-x-4 gap-y-4 md:flex-row md:gap-y-0 flex w-full flex-col items-start">
					<Input
						fullWidth
						label="Title"
						errorMessage={errors?.title?.message}
						{...form.register(`assignments.${index}.title`)}
					/>
					<Input label="Author" {...form.register(`assignments.${index}.author`)} />
					<Input label="URL" {...form.register(`assignments.${index}.url`)} />
				</div>
			)}

			<div>
				<Button type="button" variant="destructive" size="sm" onClick={onRemove}>
					<Trash2 className="mr-1.5 h-4 w-4" />
					Remove
				</Button>
			</div>
		</Card>
	)
}
