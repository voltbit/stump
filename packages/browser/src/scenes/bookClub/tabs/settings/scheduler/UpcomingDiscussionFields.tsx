import { Input } from '@stump/components'
import { useFormContext } from 'react-hook-form'

import { ScheduleFormValues } from './scheduleForm'

export default function UpcomingDiscussionFields() {
	const form = useFormContext<ScheduleFormValues>()

	return (
		<div className="gap-4 flex flex-col">
			<Input
				type="datetime-local"
				label="Date and time"
				description="When the next discussion for this club will take place"
				descriptionPosition="top"
				errorMessage={form.formState.errors.startsAt?.message}
				{...form.register('startsAt')}
			/>

			<Input
				label="Recurrence"
				description="Optional freeform note about how often this meeting repeats (e.g. 'Every other Sunday')"
				descriptionPosition="top"
				placeholder="One-time meeting"
				{...form.register('recurrence')}
			/>
		</div>
	)
}
