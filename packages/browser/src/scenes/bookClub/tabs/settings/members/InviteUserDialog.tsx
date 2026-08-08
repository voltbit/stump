import { zodResolver } from '@hookform/resolvers/zod'
import { useGraphQL, useGraphQLMutation, useSDK } from '@stump/client'
import { Button, ComboBox, Dialog, Form, Label, NativeSelect } from '@stump/components'
import { BookClubMemberRole, extractErrorMessage, graphql } from '@stump/graphql'
import { BookClubMemberRoleSpec } from '@stump/sdk'
import { AlertTriangle } from 'lucide-react'
import { useEffect, useMemo } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'

import {
	buildCreateInvitationInput,
	buildRoleOptions,
	buildUserOptions,
	emptyInviteUserFormValues,
	inviteUserFormSchema,
	InviteUserFormValues,
} from './inviteUserForm'

const usersQuery = graphql(`
	query InviteBookClubUserUsers {
		users(pagination: { none: { unpaginated: true } }) {
			nodes {
				id
				username
			}
		}
	}
`)

// Candidates already in the club - as a member or a still-pending invitee - are excluded from
// the picker, mirroring AddMemberDialog's membersQuery. Note: unlike that sibling, we surface
// this query's error to the user (toast) rather than silently falling back to an empty
// exclusion list, since that would let an admin invite someone who is already a member or
// already invited without any warning.
const existingQuery = graphql(`
	query InviteBookClubUserExisting($id: ID!) {
		bookClubById(id: $id) {
			id
			members(pagination: { none: { unpaginated: true } }) {
				nodes {
					userId
				}
			}
			invitations {
				userId
			}
		}
	}
`)

const mutation = graphql(`
	mutation CreateBookClubInvitation($id: ID!, $input: BookClubInvitationInput!) {
		createBookClubInvitation(id: $id, input: $input) {
			id
		}
	}
`)

type Props = {
	isOpen: boolean
	bookClubId: string
	roleSpec: BookClubMemberRoleSpec
	onClose: () => void
	onInvited: () => void
}

export default function InviteUserDialog({
	isOpen,
	bookClubId,
	roleSpec,
	onClose,
	onInvited,
}: Props) {
	const { sdk } = useSDK()

	// Only fetch the candidate user list, and the club's current members/invitations (to
	// exclude them from the picker), while the dialog is actually open
	const { data: usersData, error: usersError } = useGraphQL(
		usersQuery,
		sdk.cacheKey('users', ['unpaginated']),
		undefined,
		{ enabled: isOpen },
	)

	const { data: existingData, error: existingError } = useGraphQL(
		existingQuery,
		sdk.cacheKey('bookClubById', [bookClubId, 'members', 'invitations', 'unpaginated']),
		{ id: bookClubId },
		{ enabled: isOpen },
	)

	const excludedUserIds = useMemo(() => {
		const memberIds = existingData?.bookClubById.members.nodes.map(({ userId }) => userId) ?? []
		const invitedIds = existingData?.bookClubById.invitations.map(({ userId }) => userId) ?? []
		return [...memberIds, ...invitedIds]
	}, [existingData])

	const usersErrorMessage = usersError
		? extractErrorMessage(usersError, 'You may not have permission to view the server user list')
		: undefined
	const existingErrorMessage = existingError
		? extractErrorMessage(
				existingError,
				"Failed to load the club's current members and invitations",
			)
		: undefined
	const disabledMessage = usersErrorMessage ?? existingErrorMessage

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

	useEffect(() => {
		if (!existingError) return

		console.error('Error fetching existing club members/invitations:', existingError)
		toast.error("Failed to load the club's current members and invitations", {
			description: extractErrorMessage(existingError),
		})
	}, [existingError])

	const userOptions = useMemo(
		() => buildUserOptions(usersData?.users.nodes ?? [], excludedUserIds),
		[usersData, excludedUserIds],
	)

	const roleOptions = useMemo(() => buildRoleOptions(roleSpec), [roleSpec])

	const form = useForm<InviteUserFormValues>({
		defaultValues: emptyInviteUserFormValues,
		resolver: zodResolver(inviteUserFormSchema),
	})

	useEffect(() => {
		if (isOpen) {
			form.reset(emptyInviteUserFormValues)
		}
	}, [isOpen, form])

	const userId = form.watch('userId')
	const role = form.watch('role')

	const { mutate: createInvitation, isPending } = useGraphQLMutation(mutation, {
		onError: (error) => {
			console.error('Error creating invitation:', error)
			toast.error('Failed to invite user', { description: extractErrorMessage(error) })
		},
		onSuccess: () => {
			toast.success('Invitation sent')
			onInvited()
		},
	})

	const handleSubmit = (values: InviteUserFormValues) => {
		createInvitation({
			id: bookClubId,
			input: buildCreateInvitationInput(values),
		})
	}

	return (
		<Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
			<Dialog.Content size="md">
				<Dialog.Header>
					<Dialog.Title>Invite user</Dialog.Title>
					<Dialog.Close onClick={onClose} />
				</Dialog.Header>

				<Form id="invite-book-club-user" form={form} onSubmit={handleSubmit}>
					{disabledMessage && (
						<div className="px-3 py-2 text-xs gap-2 flex items-start rounded-md border border-destructive/30 bg-destructive/10 text-destructive">
							<AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
							<span>Couldn&apos;t load users: {disabledMessage}</span>
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
							disabled={!!disabledMessage}
							placeholder="Select a user..."
							filterPlaceholder="Search users..."
							filterEmptyMessage={
								disabledMessage
									? 'Unable to load users'
									: userOptions.length
										? 'No matching users'
										: 'No users available to invite'
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
				</Form>

				<Dialog.Footer>
					<Button variant="outline" onClick={onClose} disabled={isPending}>
						Cancel
					</Button>
					<Button type="submit" form="invite-book-club-user" disabled={isPending}>
						Send invite
					</Button>
				</Dialog.Footer>
			</Dialog.Content>
		</Dialog>
	)
}
