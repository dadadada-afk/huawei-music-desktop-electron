//go:build !darwin || !cgo

package mainthread

// The non-macOS application continues to dispatch through Viva's invalidator.
func Post(fn func()) { fn() }
