// jsdom does not implement matchMedia, but components using media-query hooks (e.g. rooks'
// useMediaMatch) require it. Reports every query as non-matching.
Object.defineProperty(window, 'matchMedia', {
	writable: true,
	value: (query: string) => ({
		matches: false,
		media: query,
		onchange: null,
		addListener: () => {},
		removeListener: () => {},
		addEventListener: () => {},
		removeEventListener: () => {},
		dispatchEvent: () => false,
	}),
})
