//go:build windows

package media

import (
	"os"
	"testing"
	"time"
)

func TestSMTCLifecycle(t *testing.T) {
	if os.Getenv("HWMUSIC_TEST_SMTC") == "" {
		t.Skip("explicit Windows desktop integration test required")
	}
	c := New(func(Event) {})
	if c == nil {
		t.Fatal("SMTC activation failed")
	}
	c.Update("synthetic", "fixture", 4, 0, false)
	time.Sleep(100 * time.Millisecond)
	c.Update("", "", 0, 0, false)
	c.Close()
	c.Close()
	c.Update("closed", "", 0, 0, false)
}
