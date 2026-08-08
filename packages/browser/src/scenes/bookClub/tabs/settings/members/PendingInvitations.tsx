import { useGraphQL, useSDK } from '@stump/client'
import { Badge, Button, Card, Heading, Text, ToolTip } from '@stump/components'
import { extractErrorMessage, graphql, UserPermission } from '@stump/graphql'
import upperFirst from 'lodash/upperFirst'
import { Mail, UserPlus } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'

import GenericEmptyState from '@/components/GenericEmptyState'
import { useCheckPermission } from '@/context'

import { useBookClubManagement } from '../context'
import InviteUserDialog from './InviteUserDialog'

// The `user` selection on each invitation requires the "Read users" server permission (or
// being the invitee), same as the candidate list in InviteUserDialog - so this whole section,
// not just the invite button, is gated on it below
const query = graphql(`
	query BookClubPendingInvitations($id: ID!) {
		bookClubById(id: $id) {
			id
			invitations {
				id
				role
				userId
				user {
					id
					username
				}
			}
		}
	}
`)

export default function PendingInvitations() {
	const { sdk } = useSDK()
	const canReadUsers = useCheckPermission(UserPermission.ReadUsers)
	const {
		club: { id, roleSpec },
	} = useBookClubManagement()

	const [isInviting, setIsInviting] = useState(false)

	const { data, error, refetch } = useGraphQL(
		query,
		sdk.cacheKey('bookClubById', [id, 'invitations']),
		{ id },
		{ enabled: canReadUsers },
	)

	useEffect(() => {
		if (!error) return

		console.error('Error fetching pending invitations:', error)
		toast.error('Failed to load pending invitations', { description: extractErrorMessage(error) })
	}, [error])

	const invitations = data?.bookClubById.invitations ?? []

	return (
		<div className="gap-4 flex flex-col">
			<div className="flex items-center justify-between">
				<Heading size="xs">Pending invitations</Heading>
				<ToolTip
					content='Requires the "Read users" server permission'
					isDisabled={canReadUsers}
					align="end"
				>
					<Button
						variant="secondary"
						size="sm"
						onClick={() => setIsInviting(true)}
						disabled={!canReadUsers}
					>
						<UserPlus className="mr-2 h-4 w-4" />
						Invite user
					</Button>
				</ToolTip>
			</div>

			<InviteUserDialog
				isOpen={isInviting}
				bookClubId={id}
				roleSpec={roleSpec}
				onClose={() => setIsInviting(false)}
				onInvited={() => {
					setIsInviting(false)
					refetch()
				}}
			/>

			{canReadUsers && invitations.length === 0 && (
				<GenericEmptyState
					title="No pending invitations"
					subtitle="Invited users will appear here until they respond"
					containerClassName="md:justify-start md:items-start"
					contentClassName="md:text-left"
				/>
			)}

			{invitations.length > 0 && (
				<div className="gap-3 flex flex-col">
					{invitations.map((invitation) => (
						<Card key={invitation.id} className="gap-3 p-3 flex items-center justify-between">
							<div className="min-w-0 gap-2 flex items-center">
								<Mail className="h-4 w-4 shrink-0 text-muted-foreground" />
								<Text size="sm" className="truncate">
									{invitation.user.username}
								</Text>
							</div>
							<Badge size="xs" className="shrink-0">
								{roleSpec[invitation.role] || upperFirst(invitation.role.toLowerCase())}
							</Badge>
						</Card>
					))}
				</div>
			)}
		</div>
	)
}
