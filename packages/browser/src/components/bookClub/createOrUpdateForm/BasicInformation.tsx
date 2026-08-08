import { CheckBox, EmojiPicker, Input, Label, Text, TextArea } from '@stump/components'
import { useLocaleContext } from '@stump/i18n'
import { useFormContext, useFormState } from 'react-hook-form'

import { useBookClubContextSafe } from '../context'
import { CreateOrUpdateBookClubSchema } from './schema'

const LOCALE_KEY = 'createOrUpdateBookClubForm'
const getKey = (key: string) => `${LOCALE_KEY}.fields.${key}`

export default function BasicBookClubInformation() {
	const form = useFormContext<CreateOrUpdateBookClubSchema>()
	const ctx = useBookClubContextSafe()

	const isCreating = !ctx?.bookClub
	const isPrivate = form.watch('isPrivate')
	const emoji = form.watch('emoji')

	const { t } = useLocaleContext()
	const { errors } = useFormState({
		control: form.control,
	})

	return (
		<div className="gap-6 flex grow flex-col">
			<Input
				label={t(getKey('name.label'))}
				description={t(getKey('name.description'))}
				placeholder={t(getKey('name.placeholder'))}
				containerClassName="max-w-full md:max-w-sm"
				required={isCreating}
				errorMessage={errors.name?.message}
				data-1p-ignore
				{...form.register('name')}
			/>

			{/* Emoji can only be changed once the club exists - the create mutation doesn't accept it */}
			{!isCreating && (
				<div className="gap-2 flex flex-col">
					<Label>{t(getKey('emoji.label'))}</Label>
					<Text variant="muted" size="sm">
						{t(getKey('emoji.description'))}
					</Text>
					<EmojiPicker
						value={emoji}
						placeholder="😀"
						onEmojiSelect={(selected) => form.setValue('emoji', selected?.native)}
						triggerProps={{ className: 'h-9 w-9 text-lg' }}
						align="start"
					/>
				</div>
			)}

			<TextArea
				className="flex"
				label={t(getKey('description.label'))}
				description={t(getKey('description.description'))}
				placeholder={t(getKey('description.placeholder'))}
				containerClassName="max-w-full md:max-w-sm lg:max-w-lg"
				{...form.register('description')}
			/>

			<CheckBox
				id="is_private"
				label={t(getKey('is_private.label'))}
				description={t(getKey('is_private.description'))}
				checked={isPrivate}
				onClick={() => form.setValue('isPrivate', !isPrivate)}
			/>
		</div>
	)
}
