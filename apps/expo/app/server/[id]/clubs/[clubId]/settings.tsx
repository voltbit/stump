import { Host, Image } from '@expo/ui/swift-ui'
import { useGraphQLMutation, useSuspenseGraphQL } from '@stump/client'
import { BookClubMemberRole, graphql } from '@stump/graphql'
import { useQueryClient } from '@tanstack/react-query'
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router'
import { Check } from 'lucide-react-native'
import { useCallback, useLayoutEffect, useState } from 'react'
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { toast } from 'sonner-native'

import { useActiveServer } from '~/components/activeServer'
import { Button, Card, Icon, Input, Switch, Text } from '~/components/ui'

const query = graphql(`
	query BookClubSettings($id: ID!) {
		bookClubById(id: $id) {
			id
			name
			description
			isPrivate
			emoji
			membership {
				id
				role
			}
		}
	}
`)

const updateClubMutation = graphql(`
	mutation UpdateBookClubSettings($id: ID!, $input: UpdateBookClubInput!) {
		updateBookClub(id: $id, input: $input) {
			id
		}
	}
`)

const deleteClubMutation = graphql(`
	mutation DeleteBookClub($id: ID!) {
		deleteBookClub(id: $id) {
			id
		}
	}
`)

const leaveClubMutation = graphql(`
	mutation LeaveBookClub($id: ID!) {
		leaveBookClub(bookClubId: $id) {
			id
		}
	}
`)

export default function Screen() {
	const { clubId } = useLocalSearchParams<{ clubId: string }>()
	const router = useRouter()
	const queryClient = useQueryClient()
	const {
		activeServer: { id: serverID },
	} = useActiveServer()

	const { data } = useSuspenseGraphQL(query, ['bookClubById', clubId, 'settings'], {
		id: clubId,
	})

	const club = data.bookClubById
	const role = club.membership?.role
	const isAdmin = role === BookClubMemberRole.Admin || role === BookClubMemberRole.Creator
	const isCreator = role === BookClubMemberRole.Creator
	const canLeave = !!club.membership && !isCreator

	const [name, setName] = useState(club.name)
	const [description, setDescription] = useState(club.description ?? '')
	const [isPrivate, setIsPrivate] = useState(club.isPrivate)

	const { mutateAsync: updateClub, isPending: isSaving } = useGraphQLMutation(updateClubMutation)
	const { mutateAsync: leaveClub, isPending: isLeaving } = useGraphQLMutation(leaveClubMutation)
	const { mutateAsync: deleteClub, isPending: isDeleting } = useGraphQLMutation(deleteClubMutation)

	const canSubmit = isAdmin && name.trim().length > 0

	const handleSave = useCallback(async () => {
		if (!canSubmit) return

		try {
			await updateClub({
				id: clubId,
				input: {
					name: name.trim(),
					description: description.trim() || null,
					isPrivate,
					// The server applies `description`/`emoji` unconditionally (unlike `name`/
					// `isPrivate`, which fall back to the existing value when omitted), so we must
					// pass the current emoji through here even though this screen doesn't edit it -
					// otherwise every save would silently clear it.
					emoji: club.emoji ?? null,
				},
			})
			queryClient.invalidateQueries({ queryKey: ['bookClubById', clubId] })
			queryClient.invalidateQueries({ queryKey: ['bookClubContext', clubId] })
			router.back()
		} catch (error) {
			toast.error('Failed to update club', {
				description: error instanceof Error ? error.message : 'An unknown error occurred',
			})
		}
	}, [canSubmit, updateClub, clubId, name, description, isPrivate, club.emoji, queryClient, router])

	const navigation = useNavigation()
	useLayoutEffect(() => {
		if (!isAdmin) return
		navigation.setOptions({
			headerRight: () => (
				<Pressable onPress={handleSave} disabled={!canSubmit || isSaving}>
					{CheckIcon}
				</Pressable>
			),
		})
	}, [navigation, handleSave, canSubmit, isSaving, isAdmin])

	const confirmLeave = useCallback(() => {
		Alert.alert('Leave club', `Are you sure you want to leave ${club.name}?`, [
			{ text: 'Cancel', style: 'cancel' },
			{
				text: 'Leave',
				style: 'destructive',
				onPress: async () => {
					try {
						await leaveClub({ id: clubId })
						queryClient.invalidateQueries({ queryKey: ['bookClubs', serverID] })
						router.replace(`/server/${serverID}/clubs`)
					} catch (error) {
						toast.error('Failed to leave club', {
							description: error instanceof Error ? error.message : 'An unknown error occurred',
						})
					}
				},
			},
		])
	}, [club.name, leaveClub, clubId, queryClient, router, serverID])

	const confirmDelete = useCallback(() => {
		Alert.alert(
			'Delete club',
			'Are you sure you want to delete this club? This action cannot be undone.',
			[
				{ text: 'Cancel', style: 'cancel' },
				{
					text: 'Delete',
					style: 'destructive',
					onPress: async () => {
						try {
							await deleteClub({ id: clubId })
							queryClient.invalidateQueries({ queryKey: ['bookClubs', serverID] })
							router.replace(`/server/${serverID}/clubs`)
						} catch (error) {
							toast.error('Failed to delete club', {
								description: error instanceof Error ? error.message : 'An unknown error occurred',
							})
						}
					},
				},
			],
		)
	}, [deleteClub, clubId, queryClient, router, serverID])

	const showDangerZone = canLeave || isCreator

	return (
		<SafeAreaView className="flex-1 bg-background">
			<KeyboardAvoidingView
				behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
				className="flex-1"
			>
				<ScrollView
					className="flex-1"
					contentContainerStyle={{ padding: 16 }}
					keyboardShouldPersistTaps="handled"
					contentInsetAdjustmentBehavior="automatic"
				>
					<View className="gap-6">
						{isAdmin && (
							<View className="gap-6">
								<Input
									label="Name"
									placeholder="Enter club name"
									value={name}
									onChange={(e) => setName(e.nativeEvent.text)}
									autoCapitalize="words"
									autoCorrect={false}
								/>

								<Input
									label="Description"
									placeholder="What is this club about? (optional)"
									value={description}
									onChange={(e) => setDescription(e.nativeEvent.text)}
									multiline
									numberOfLines={3}
									style={{ minHeight: 80, textAlignVertical: 'top' }}
								/>

								{/* FIXME: No idea why I need mt here, something weird with switches */}
								<View className="mt-12 flex-row items-center justify-between">
									<Text>Private</Text>
									<Switch checked={isPrivate} onCheckedChange={setIsPrivate} />
								</View>
							</View>
						)}

						{showDangerZone && (
							<Card label="Danger Zone">
								{canLeave && (
									<Card.Row label="Leave club" description="Remove yourself from this club">
										<Button
											size="sm"
											roundness="full"
											variant="destructive"
											disabled={isLeaving}
											onPress={confirmLeave}
										>
											<Text>Leave</Text>
										</Button>
									</Card.Row>
								)}

								{isCreator && (
									<Card.Row
										label="Delete club"
										description="Permanently delete this club for everyone"
									>
										<Button
											size="sm"
											roundness="full"
											variant="destructive"
											disabled={isDeleting}
											onPress={confirmDelete}
										>
											<Text>Delete</Text>
										</Button>
									</Card.Row>
								)}
							</Card>
						)}

						{!isAdmin && !showDangerZone && (
							<Text className="text-foreground-muted text-center">
								You don&apos;t have permission to manage this club.
							</Text>
						)}
					</View>
				</ScrollView>
			</KeyboardAvoidingView>
		</SafeAreaView>
	)
}

const CheckIcon = Platform.select({
	ios: (
		<Host matchContents>
			<Image systemName="checkmark" size={16} />
		</Host>
	),
	android: <Icon as={Check} className="shadow" />,
})
