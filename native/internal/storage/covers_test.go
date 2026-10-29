package storage

import (
	"bytes"
	"fmt"
	"os"
	"path/filepath"
	"testing"
)

func TestCoverDiskCacheBoundAndIdentity(t *testing.T) {
	dir := t.TempDir()
	s := New(dir)
	if err := s.SaveCover("https://fixture/a", []byte("pixels")); err != nil {
		t.Fatal(err)
	}
	restored, err := New(dir).LoadCover("https://fixture/a")
	if err != nil || !bytes.Equal(restored, []byte("pixels")) {
		t.Fatal("disk reload failed")
	}
	for i := 0; i < 600; i++ {
		if err := s.SaveCover(fmt.Sprint(i), []byte("image")); err != nil {
			t.Fatal(err)
		}
	}
	entries, err := os.ReadDir(filepath.Join(dir, "covers"))
	if err != nil || len(entries) > 128 {
		t.Fatal("cache is unbounded")
	}
	for i := 0; i < 600; i++ {
		data, err := s.LoadCover(fmt.Sprint(i))
		if err == nil && string(data) != "image" {
			t.Fatal("slot collision returned wrong image")
		}
	}
	if s.SaveCover("large", make([]byte, 256*1024+1)) == nil {
		t.Fatal("unbounded cache entry")
	}
}
