package storage

import (
	"os"
	"path/filepath"
	"testing"
)

func TestLyricOffsetNullAndStats(t *testing.T) {
	dir := t.TempDir()
	s := New(dir)
	if err := os.WriteFile(filepath.Join(dir, "lyric-offsets.json"), []byte("null"), 0600); err != nil {
		t.Fatal(err)
	}
	if err := s.SaveLyricOffset("test", 1.5); err != nil {
		t.Fatal(err)
	}
	if s.LyricOffset("test") != 1.5 {
		t.Fatal("offset not restored")
	}
	if err := s.SaveLyrics("test", LyricDocument{Text: "[00:01]test"}, true); err != nil {
		t.Fatal(err)
	}
	stats := s.LyricsInfo()
	if stats.Local != 1 || stats.Network != 0 || stats.Bytes == 0 {
		t.Fatalf("wrong stats: %+v", stats)
	}
}

func TestLocalLyricsOverrideAndCacheCleanup(t *testing.T) {
	s := New(t.TempDir())
	if err := s.SaveLyrics("../track", LyricDocument{Text: "[00:01]remote", Source: "network"}, false); err != nil {
		t.Fatal(err)
	}
	if err := s.SaveLyrics("../track", LyricDocument{Text: "[00:01]local", Source: "import"}, true); err != nil {
		t.Fatal(err)
	}
	if err := s.ClearLyrics(false); err != nil {
		t.Fatal(err)
	}
	doc, err := s.LoadLyrics("../track")
	if err != nil || doc.Source != "import" {
		t.Fatal("cache cleanup removed local override")
	}
	if err := s.RemoveLocalLyrics("../track"); err != nil {
		t.Fatal(err)
	}
	if _, err := s.LoadLyrics("../track"); err == nil {
		t.Fatal("removed lyrics remained")
	}
}
