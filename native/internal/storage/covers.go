package storage

import (
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"os"
	"path/filepath"
)

// Fixed slots bound disk usage to 32 MiB. Collisions replace disposable covers;
// the full digest is checked before returning any pixels. URLs are never saved.
func coverSlot(key string) (string, string) {
	sum := sha256.Sum256([]byte(key))
	return fmt.Sprintf("cover-%02x.cache", sum[0]%128), hex.EncodeToString(sum[:])
}
func (s *Store) LoadCover(key string) ([]byte, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	name, digest := coverSlot(key)
	path := filepath.Join(s.dir, "covers", name)
	info, err := os.Lstat(path)
	if err != nil {
		return nil, err
	}
	if !info.Mode().IsRegular() || info.Size() > 256*1024+64 {
		return nil, errors.New("invalid cover cache")
	}
	data, err := os.ReadFile(path)
	if err != nil || len(data) < 64 || string(data[:64]) != digest {
		return nil, errors.New("cover cache miss")
	}
	return data[64:], nil
}
func (s *Store) SaveCover(key string, data []byte) error {
	if len(data) > 256*1024 {
		return errors.New("cover cache too large")
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	name, digest := coverSlot(key)
	dir := filepath.Join(s.dir, "covers")
	if err := os.MkdirAll(dir, 0700); err != nil {
		return err
	}
	path := filepath.Join(dir, name)
	if info, err := os.Lstat(path); err == nil && !info.Mode().IsRegular() {
		return errors.New("invalid cover cache path")
	}
	return os.WriteFile(path, append([]byte(digest), data...), 0600)
}
