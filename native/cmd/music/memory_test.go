package main

import (
	"encoding/json"
	"fmt"
	"runtime"
	"testing"

	"github.com/vivaui/viva/ui"
)

func TestFontCacheEvictsOldestWithoutDiscardingHotEntries(t *testing.T) {
	m := newModel()
	m.fontCache = make(map[string]ui.Bitmap)
	m.fontUsed = make(map[string]uint64)
	m.fontInk = make(map[string]ui.Rect)
	for i := 0; i < 300; i++ {
		m.trimFontCache(32 * 1024)
		key := fmt.Sprint(i)
		m.fontCache[key] = ui.Bitmap{Pix: make([]byte, 32*1024)}
		m.fontUsed[key] = uint64(i + 1)
		m.fontBytes += 32 * 1024
		// Keep the first entry visible, as with a persistent transport label.
		m.fontUsed["0"] = uint64(i + 2)
	}
	if m.fontBytes > fontCacheBudget || len(m.fontCache) < 2 || m.fontCache["0"].Pix == nil || m.fontCache["1"].Pix != nil {
		t.Fatal("cache must remain bounded without flushing visible labels", m.fontBytes, len(m.fontCache))
	}
}

func TestSyntheticLibraryMemoryAccounting(t *testing.T) {
	runtime.GC()
	var before, after runtime.MemStats
	runtime.ReadMemStats(&before)
	tracks := syntheticTracks(965)
	runtime.GC()
	runtime.ReadMemStats(&after)
	encoded, err := json.Marshal(tracks)
	if err != nil {
		t.Fatal(err)
	}
	t.Logf("synthetic metadata: tracks=%d JSON_bytes=%d retained_heap_delta=%d (no window, fonts, covers, GPU or player)", len(tracks), len(encoded), int64(after.HeapAlloc)-int64(before.HeapAlloc))
	runtime.KeepAlive(tracks)
}
