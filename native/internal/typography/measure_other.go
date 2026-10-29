//go:build !darwin || !cgo

package typography

func nativeMeasure(text, family string, size, weight float32) float32 { return 0 }
