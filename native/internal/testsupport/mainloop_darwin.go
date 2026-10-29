//go:build darwin && cgo

// Package testsupport is imported by native integration tests only.
package testsupport

/*
#cgo LDFLAGS: -framework CoreFoundation
#include <CoreFoundation/CoreFoundation.h>
static void hm_test_pump(void) {
    CFRunLoopRunInMode(kCFRunLoopDefaultMode, 0.01, true);
}
*/
import "C"

import (
	"runtime"
	"testing"
)

func init() { runtime.LockOSThread() }

// AVFoundation completion work requires a live main run loop. Go's testing
// runner otherwise leaves it unserviced; the application gets it from Viva.
func Run(m *testing.M) int {
	result := make(chan int, 1)
	go func() { result <- m.Run() }()
	for {
		select {
		case code := <-result:
			return code
		default:
			C.hm_test_pump()
		}
	}
}
