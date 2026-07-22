import { zodResolver } from '@hookform/resolvers/zod'
import { useGraphQL, useGraphQLMutation, useSDK } from '@stump/client'
import { Button, ComboBox, Dialog, Form, Input, Label, NativeSelect } from '@stump/components'
import { BookClubMemberRole, extractErrorMessage, graphql } from '@stump/graphql'
import { BookClubMemberRoleSpec } from '@stump/sdk'
import { AlertTriangle } from 'lucide-react'
import { useEffect, useMemo } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'

import {
	addMemberFormSchema,
	AddMemberFormValues,
	buildCreateMemberInput,
	buildRoleOptions,
	buildUserOptions,
	emptyAddMemberFormValues,
} from './addMemberForm'

const usersQuery = graphql(`
	query AddBookClubMemberUsers {
		users(pagination: { none: { unpaginated: true } }) {
			nodes {
				id
				username
			}
		}
	}
`)

const mutation = graphql(`
	mutation CreateBookClubMember($bookClubId: ID!, $input: CreateBookClubMemberInput!) {
		createBookClubMember(bookClubId: $bookClubId, input: $input) {
			id
		}
	}
`)

type Props = {
	isOpen: boolean
	bookClubId: string
	roleSpec: BookClubMemberRoleSpec
	/** Userids that are already members of the club, and should be excluded from the picker */
	excludedUserIds: string[]
	onClose: () => void
	onAdded: () => void
}

export default function AddMemberDialog({
	isOpen,
	bookClubId,
	roleSpec,
	excludedUserIds,
	onClose,
	onAdded,
}: Props) {
	const { sdk } = useSDK()

	// Only fetch the candidate user list while the dialog is actually open
	const { data: usersData, error: usersError } = useGraphQL(
		usersQuery,
		sdk.cacheKey('users', ['unpaginated']),
		undefined,
		{ enabled: isOpen },
	)

	const usersErrorMessage = usersError
		? extractErrorMessage(usersError, 'You may not have permission to view the server user list')
		: undefined

	useEffect(() => {
		if (!usersError) return

		console.error('Error fetching candidate users:', usersError)
		toast.error('Failed to load users', {
			description: extractErrorMessage(
				usersError,
				'You may not have permission to view the server user list',
			),
		})
	}, [usersError])

	const userOptions = useMemo(
		() => buildUserOptions(usersData?.users.nodes ?? [], excludedUserIds),
		[usersData, excludedUserIds],
	)

	const roleOptions = useMemo(() => buildRoleOptions(roleSpec), [roleSpec])

	const form = useForm<AddMemberFormValues>({
		defaultValues: emptyAddMemberFormValues,
		resolver: zodResolver(addMemberFormSchema),
	})

	useEffect(() => {
		if (isOpen) {
			form.reset(emptyAddMemberFormValues)
		}
	}, [isOpen, form])

	const userId = form.watch('userId')
	const role = form.watch('role')

	const { mutate: createMember, isPending } = useGraphQLMutation(mutation, {
		onError: (error) => {
			console.error('Error adding member:', error)
			toast.error('Failed to add member', { description: extractErrorMessage(error) })
		},
		onSuccess: () => {
			toast.success('Member added')
			onAdded()
		},
	})

	const handleSubmit = (values: AddMemberFormValues) => {
		createMember({
			bookClubId,
			input: buildCreateMemberInput(values),
		})
	}

	return (
		<Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
			<Dialog.Content size="md">
				<Dialog.Header>
					<Dialog.Title>Add member</Dialog.Title>
					<Dialog.Close onClick={onClose} />
				</Dialog.Header>

				<Form id="add-book-club-member" form={form} onSubmit={handleSubmit}>
					{usersErrorMessage && (
						<div className="px-3 py-2 text-xs gap-2 flex items-start rounded-md border border-destructive/30 bg-destructive/10 text-destructive">
							<AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
							<span>Couldn&apos;t load users: {usersErrorMessage}</span>
						</div>
					)}

					<div className="gap-1.5 flex flex-col">
						<ComboBox
							label="User"
							options={userOptions}
							value={userId}
							onChange={(value) => form.setValue('userId', value ?? '', { shouldValidate: true })}
							filterable
							size="full"
							disabled={!!usersErrorMessage}
							placeholder="Select a user..."
							filterPlaceholder="Search users..."
							filterEmptyMessage={
								usersErrorMessage
									? 'Unable to load users'
									: userOptions.length
										? 'No matching users'
										: 'No users available to add'
							}
						/>
						{form.formState.errors.userId && (
							<span className="text-xs text-destructive">
								{form.formState.errors.userId.message}
							</span>
						)}
					</div>

					<div className="gap-1.5 flex flex-col">
						<Label>Role</Label>
						<NativeSelect
							value={role}
							options={roleOptions}
							onChange={(e) =>
								form.setValue('role', e.target.value as BookClubMemberRole, {
									shouldValidate: true,
								})
							}
						/>
					</div>

					<Input
						label="Display name"
						description="Optional - defaults to the user's username"
						placeholder="Optional"
						{...form.register('displayName')}
					/>
				</Form>

				<Dialog.Footer>
					<Button variant="outline" onClick={onClose} disabled={isPending}>
						Cancel
					</Button>
					<Button type="submit" form="add-book-club-member" disabled={isPending}>
						Add member
					</Button>
				</Dialog.Footer>
			</Dialog.Content>
		</Dialog>
	)
}
