//go:build darwin && cgo

package webauth

func NeedsManualCallback() bool { return false }
