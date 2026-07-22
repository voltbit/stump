import { ConfirmationModal } from '@stump/components'

type Props = {
	isOpen: boolean
	onClose: (didConfirm: boolean) => void
}

export default function DeleteScheduleConfirmation({ isOpen, onClose }: Props) {
	return (
		<ConfirmationModal
			isOpen={isOpen}
			onConfirm={() => onClose(true)}
			onClose={() => onClose(false)}
			title="Delete schedule"
			description="Are you sure you want to delete this schedule? This action cannot be undone."
			confirmText="Confirm"
			confirmVariant="destructive"
			size="sm"
		/>
	)
}
