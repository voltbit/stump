import {
	closestCenter,
	DndContext,
	DragEndEvent,
	KeyboardSensor,
	PointerSensor,
	useSensor,
	useSensors,
} from '@dnd-kit/core'
import {
	arrayMove,
	SortableContext,
	sortableKeyboardCoordinates,
	verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { useGraphQLMutation, useSDK, useSuspenseGraphQL } from '@stump/client'
import { Button, Heading } from '@stump/components'
import { extractErrorMessage, graphql } from '@stump/graphql'
import { Plus } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'

import { useBookClubContext } from '@/components/bookClub'
import GenericEmptyState from '@/components/GenericEmptyState'

import { useBookClubManagement } from '../context'
import AddReadingListBookDialog from './AddReadingListBookDialog'
import ReadingListBookItem from './ReadingListBookItem'

const query = graphql(`
	query BookClubReadingListScene($id: ID!) {
		bookClubById(id: $id) {
			id
			books(pagination: { none: { unpaginated: true } }) {
				nodes {
					id
					position
					completedAt
					...ReadingListBookItem
				}
			}
		}
	}
`)

const reorderMutation = graphql(`
	mutation ReorderBookClubBooks($bookClubId: ID!, $bookIds: [String!]!) {
		reorderBooks(bookClubId: $bookClubId, bookIds: $bookIds) {
			id
		}
	}
`)

const completeMutation = graphql(`
	mutation CompleteBookClubBook($bookClubBookId: ID!) {
		completeBook(bookClubBookId: $bookClubBookId) {
			id
		}
	}
`)

/**
 * Settings scene for managing a club's ordered reading list: adding books (from the server's
 * media library or as a free-form external entry), reordering the queue, and marking the
 * current book complete. This is a sibling to the Scheduling scene - scheduling is about *when*
 * discussions happen, this is about *what* (and in what order) the club reads.
 */
export default function ReadingListScene() {
	const { sdk } = useSDK()
	const { viewerCanManage } = useBookClubContext()
	const {
		club: { id: bookClubId },
	} = useBookClubManagement()

	const {
		data: {
			bookClubById: { books },
		},
		refetch,
	} = useSuspenseGraphQL(query, sdk.cacheKey('bookClubById', [bookClubId, 'readingList']), {
		id: bookClubId,
	})

	// Completed books are effectively archived (the server rejects reordering them), so they're
	// kept in their own read-only section. The remaining queue, sorted by position, is what can
	// be dragged around; its first entry is the club's current book.
	const queue = useMemo(
		() =>
			[...books.nodes].filter((book) => !book.completedAt).sort((a, b) => a.position - b.position),
		[books],
	)
	const completedBooks = useMemo(
		() =>
			[...books.nodes].filter((book) => !!book.completedAt).sort((a, b) => a.position - b.position),
		[books],
	)
	// Local buffer so drag-and-drop reorders reflect instantly, rather than snapping back until
	// the mutation round-trips - mirrors the pattern in NavigationArrangementSheet
	const [localQueue, setLocalQueue] = useState(queue)
	useEffect(() => {
		setLocalQueue(queue)
	}, [queue])

	// Derived from the local (optimistic) order so the "Current"/"Mark complete" affordance moves
	// with the drag immediately, rather than lagging behind until the reorder round-trips
	const currentBookId = localQueue[0]?.id

	const [isAdding, setIsAdding] = useState(false)

	const sensors = useSensors(
		useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
		useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
	)

	const { mutate: reorder } = useGraphQLMutation(reorderMutation, {
		onError: (error) => {
			console.error('Error reordering reading list:', error)
			toast.error('Failed to reorder the reading list', { description: extractErrorMessage(error) })
			refetch()
		},
		onSuccess: () => refetch(),
	})

	const { mutate: complete, isPending: isCompleting } = useGraphQLMutation(completeMutation, {
		onError: (error) => {
			console.error('Error completing book:', error)
			toast.error('Failed to mark the book as complete', {
				description: extractErrorMessage(error),
			})
		},
		onSuccess: () => {
			toast.success('Book marked as complete')
			refetch()
		},
	})

	const handleDragEnd = (event: DragEndEvent) => {
		const { active, over } = event
		if (!over || active.id === over.id) return

		const oldIndex = localQueue.findIndex((book) => book.id === active.id)
		const newIndex = localQueue.findIndex((book) => book.id === over.id)
		if (oldIndex < 0 || newIndex < 0) return

		const reordered = arrayMove(localQueue, oldIndex, newIndex)
		setLocalQueue(reordered)
		reorder({ bookClubId, bookIds: reordered.map((book) => book.id) })
	}

	const isEmpty = queue.length === 0 && completedBooks.length === 0

	return (
		<div className="gap-8 flex flex-col">
			{isEmpty && (
				<GenericEmptyState
					title="No books yet"
					subtitle="Add a book to start this club's reading queue"
					containerClassName="md:justify-start md:items-start"
					contentClassName="md:text-left"
				/>
			)}

			{localQueue.length > 0 && (
				<DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
					<SortableContext
						items={localQueue.map((book) => book.id)}
						strategy={verticalListSortingStrategy}
					>
						<div className="gap-3 flex flex-col">
							{localQueue.map((book, index) => (
								<ReadingListBookItem
									key={book.id}
									data={book}
									position={index + 1}
									isCurrent={book.id === currentBookId}
									canDrag={viewerCanManage}
									onComplete={
										viewerCanManage && book.id === currentBookId
											? () => complete({ bookClubBookId: book.id })
											: undefined
									}
									completeDisabled={isCompleting}
								/>
							))}
						</div>
					</SortableContext>
				</DndContext>
			)}

			{completedBooks.length > 0 && (
				<div className="gap-3 flex flex-col">
					<Heading size="xs">Previously read</Heading>
					{completedBooks.map((book, index) => (
						<ReadingListBookItem
							key={book.id}
							data={book}
							position={index + 1}
							isCurrent={false}
							canDrag={false}
						/>
					))}
				</div>
			)}

			{viewerCanManage && (
				<div>
					<Button variant="secondary" onClick={() => setIsAdding(true)}>
						<Plus className="mr-1.5 h-4 w-4" />
						Add book
					</Button>
				</div>
			)}

			<AddReadingListBookDialog
				isOpen={isAdding}
				bookClubId={bookClubId}
				onClose={() => setIsAdding(false)}
				onAdded={() => {
					setIsAdding(false)
					refetch()
				}}
			/>
		</div>
	)
}
