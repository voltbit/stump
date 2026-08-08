import { zodResolver } from '@hookform/resolvers/zod'
import { useSDK, useSuspenseGraphQL } from '@stump/client'
import { Button, Form } from '@stump/components'
import { extractErrorMessage, graphql } from '@stump/graphql'
import { useLocaleContext } from '@stump/i18n'
import { useCallback, useMemo } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'

import {
	buildSchema,
	CreateOrUpdateBookClubSchema,
	formDefaults,
} from '@/components/bookClub/createOrUpdateForm'
import { BasicBookClubInformation } from '@/components/bookClub/createOrUpdateForm'

import { useBookClubManagement } from '../context'

const query = graphql(`
	query BookClubBasicSettingsScene {
		bookClubs(all: true) {
			id
			name
			slug
		}
	}
`)

export default function BasicSettingsScene() {
	const { sdk } = useSDK()
	const { club, patch } = useBookClubManagement()
	const { t } = useLocaleContext()

	const {
		data: { bookClubs: existingClubs },
	} = useSuspenseGraphQL(query, sdk.cacheKey('bookClubs', ['basicSettings']))

	const existingClubNames = useMemo(
		() => (existingClubs?.filter((c) => c.id !== club.id) ?? []).map(({ name }) => name),
		[existingClubs, club],
	)

	const schema = useMemo(() => buildSchema(t, existingClubNames, false), [t, existingClubNames])
	const form = useForm<CreateOrUpdateBookClubSchema>({
		defaultValues: formDefaults(club),
		reValidateMode: 'onChange',
		resolver: zodResolver(schema),
	})

	const handleSubmit = useCallback(
		(values: CreateOrUpdateBookClubSchema) => {
			const { name, description, isPrivate, emoji } = values
			patch(
				{
					description,
					emoji,
					isPrivate,
					name,
				},
				{
					// Reset the form's "clean" baseline to exactly what was just submitted, so it
					// visibly reflects saved state without requiring a manual refresh. This is scoped
					// to *this* form's own successful submission - deliberately not a `useEffect` keyed
					// off the shared `club` object, which would re-fire (and silently discard any
					// unsubmitted edit in progress here) whenever *any* settings tab patches the club,
					// e.g. a role-label save in MemberSpecDisplay, or a background refetch.
					onSuccess: () => {
						toast.success('Book club updated')
						form.reset(values)
					},
					onError: (error) => {
						console.error('Error updating book club:', error)
						toast.error('Failed to update book club', { description: extractErrorMessage(error) })
					},
				},
			)
		},
		[patch, form],
	)

	return (
		<Form form={form} onSubmit={handleSubmit} fieldsetClassName="flex flex-col gap-12">
			<BasicBookClubInformation />

			<div>
				<Button type="submit">Update club</Button>
			</div>
		</Form>
	)
}
