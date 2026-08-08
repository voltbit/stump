import { zodResolver } from '@hookform/resolvers/zod'
import { useSDK, useSuspenseGraphQL } from '@stump/client'
import { Button, Form } from '@stump/components'
import { extractErrorMessage, graphql } from '@stump/graphql'
import { useLocaleContext } from '@stump/i18n'
import { useCallback, useEffect, useMemo } from 'react'
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

	// Once the patch succeeds, the club in cache reflects the saved values - resync the form so
	// it visibly reflects saved state without requiring a manual refresh
	useEffect(() => {
		form.reset(formDefaults(club))
	}, [club, form])

	const handleSubmit = useCallback(
		({ name, description, isPrivate, emoji }: CreateOrUpdateBookClubSchema) => {
			patch(
				{
					description,
					emoji,
					isPrivate,
					name,
				},
				{
					onSuccess: () => toast.success('Book club updated'),
					onError: (error) => {
						console.error('Error updating book club:', error)
						toast.error('Failed to update book club', { description: extractErrorMessage(error) })
					},
				},
			)
		},
		[patch],
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
