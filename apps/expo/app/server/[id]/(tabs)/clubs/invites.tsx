import { useGraphQLMutation, useRefetch, useSuspenseGraphQL } from '@stump/client'
import { BookClubInvitesScreenQuery, graphql } from '@stump/graphql'
import upperFirst from 'lodash/upperFirst'
import { BookOpen } from 'lucide-react-native'
import { useState } from 'react'
import { ScrollView, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { toast } from 'sonner-native'

import { useActiveServer, useStumpServer } from '~/components/activeServer'
import ListEmpty from '~/components/ListEmpty'
import RefreshControl from '~/components/RefreshControl'
import { Badge, Button, Card, Icon, Text } from '~/components/ui'

const query = graphql(`
	query BookClubInvitesScreen {
		myBookClubInvitations {
			id
			role
			bookClubId
			bookClub {
				name
				description
				membersCount
				emoji
			}
		}
	}
`)

// $member is only sent when accepting - the server rejects a decline that carries one, and
// rejects an accept that doesn't
const respondMutation = graphql(`
	mutation RespondToBookClubInvitation($id: ID!, $accept: Boolean!, $member: BookClubMemberInput) {
		respondToBookClubInvitation(id: $id, input: { accept: $accept, member: $member }) {
			id
		}
	}
`)

type Invitation = NonNullable<
	NonNullable<BookClubInvitesScreenQuery['myBookClubInvitations']>[number]
>

export default function Screen() {
	const {
		activeServer: { id: serverID },
	} = useActiveServer()
	const { user } = useStumpServer()

	const { data, refetch } = useSuspenseGraphQL(query, ['bookClubInvites', serverID])
	const { mutateAsync: respond } = useGraphQLMutation(respondMutation)

	const invitations: Invitation[] = data?.myBookClubInvitations || []

	const [isRefetching, handleRefetch] = useRefetch(refetch)
	const [respondingId, setRespondingId] = useState<string | null>(null)

	const handleRespond = async (invitation: Invitation, accept: boolean) => {
		setRespondingId(invitation.id)
		try {
			await respond({
				id: invitation.id,
				accept,
				member: accept && user ? { userId: user.id } : undefined,
			})
			toast.success(accept ? `Joined ${invitation.bookClub.name}` : 'Invitation declined')
			refetch()
		} catch (error) {
			toast.error('Failed to respond to the invitation', {
				description: error instanceof Error ? error.message : 'An unknown error occurred',
			})
		} finally {
			setRespondingId(null)
		}
	}

	if (!invitations.length) {
		return (
			<SafeAreaView className="flex-1 bg-background">
				<ListEmpty
					title="No pending invites"
					message="You don't have any pending club invitations"
				/>
			</SafeAreaView>
		)
	}

	return (
		<SafeAreaView className="flex-1 bg-background">
			<ScrollView
				className="flex-1"
				contentContainerStyle={{ padding: 16 }}
				contentInsetAdjustmentBehavior="automatic"
				refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={handleRefetch} />}
			>
				<Card>
					{invitations.map((invitation) => {
						const isResponding = respondingId === invitation.id
						const roleLabel = upperFirst(invitation.role.toLowerCase())

						return (
							<Card.Row key={invitation.id}>
								<View className="gap-3 flex-1 flex-row items-center">
									<View className="squircle h-10 w-10 bg-white/75 dark:bg-black/40 items-center justify-center rounded-xl">
										{invitation.bookClub.emoji ? (
											<Text className="text-lg">{invitation.bookClub.emoji}</Text>
										) : (
											<Icon as={BookOpen} className="h-5 w-5 text-foreground-muted" />
										)}
									</View>
									<View className="gap-1 shrink">
										<Text className="font-medium" numberOfLines={1}>
											{invitation.bookClub.name}
										</Text>
										<Badge className="px-2 py-1 self-start">
											<Text size="xs">{roleLabel}</Text>
										</Badge>
									</View>
								</View>

								<View className="gap-2 flex-row items-center">
									<Button
										size="sm"
										variant="outline"
										roundness="full"
										disabled={isResponding}
										onPress={() => handleRespond(invitation, false)}
									>
										<Text>Decline</Text>
									</Button>
									<Button
										size="sm"
										roundness="full"
										disabled={isResponding}
										onPress={() => handleRespond(invitation, true)}
									>
										<Text>Accept</Text>
									</Button>
								</View>
							</Card.Row>
						)
					})}
				</Card>
			</ScrollView>
		</SafeAreaView>
	)
}
