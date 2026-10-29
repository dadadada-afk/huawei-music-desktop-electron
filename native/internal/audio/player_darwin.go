//go:build darwin && cgo && !portableaudio

// Package audio owns the native playback object and its bounded CDN loader.
package audio

/*
#cgo CFLAGS: -x objective-c -fobjc-arc
#cgo LDFLAGS: -framework AVFoundation -framework Foundation -framework CoreMedia
#include <stdlib.h>
typedef struct { double position; double duration; int ready; int failed; int ended; int playing; } hm_audio_state;
void *hm_audio_open(const char *path);
void hm_audio_play(void *player);
void hm_audio_pause(void *player);
void hm_audio_seek(void *player, double seconds);
void hm_audio_volume(void *player, float volume);
hm_audio_state hm_audio_snapshot(void *player);
void hm_audio_close(void *player);
*/
import "C"

import (
	"errors"
	"math"
	"os"
	"path/filepath"
	"runtime/cgo"
	"sync"
	"unsafe"
)

type Player struct {
	mu     sync.Mutex
	native unsafe.Pointer
	remote *remoteSource
	handle cgo.Handle
}
type State struct {
	Position, Duration            float64
	Ready, Failed, Ended, Playing bool
}

// OpenLocalFixture is an explicit development path, never fed from a provider
// response. The player starts paused and muted, including in automated tests.
func OpenLocalFixture(path string) (*Player, error) {
	abs, err := filepath.Abs(path)
	if err != nil {
		return nil, errors.New("invalid local audio path")
	}
	info, err := os.Stat(abs)
	if err != nil || !info.Mode().IsRegular() {
		return nil, errors.New("local audio fixture unavailable")
	}
	raw := C.CString(abs)
	defer C.free(unsafe.Pointer(raw))
	p := &Player{native: C.hm_audio_open(raw)}
	if p.native == nil {
		return nil, errors.New("native player unavailable")
	}
	return p, nil
}

func (p *Player) Play() {
	p.mu.Lock()
	defer p.mu.Unlock()
	if p.native != nil {
		C.hm_audio_play(p.native)
	}
}
func (p *Player) Pause() {
	p.mu.Lock()
	defer p.mu.Unlock()
	if p.native != nil {
		C.hm_audio_pause(p.native)
	}
}
func (p *Player) Seek(seconds float64) error {
	if math.IsNaN(seconds) || math.IsInf(seconds, 0) || seconds < 0 {
		return errors.New("invalid seek position")
	}
	p.mu.Lock()
	defer p.mu.Unlock()
	if p.native == nil {
		return errors.New("player closed")
	}
	C.hm_audio_seek(p.native, C.double(seconds))
	return nil
}
func (p *Player) SetVolume(volume float64) error {
	if math.IsNaN(volume) || math.IsInf(volume, 0) || volume < 0 || volume > 1 {
		return errors.New("invalid volume")
	}
	p.mu.Lock()
	defer p.mu.Unlock()
	if p.native == nil {
		return errors.New("player closed")
	}
	C.hm_audio_volume(p.native, C.float(volume))
	return nil
}
func (p *Player) Snapshot() State {
	p.mu.Lock()
	defer p.mu.Unlock()
	if p.native == nil {
		return State{}
	}
	s := C.hm_audio_snapshot(p.native)
	return State{Position: float64(s.position), Duration: float64(s.duration), Ready: s.ready != 0, Failed: s.failed != 0, Ended: s.ended != 0, Playing: s.playing != 0}
}
func (p *Player) Close() {
	p.mu.Lock()
	defer p.mu.Unlock()
	if p.native != nil {
		if p.remote != nil {
			p.remote.cancel()
		}
		C.hm_audio_close(p.native)
		p.native = nil
		if p.remote != nil {
			p.handle.Delete()
			p.remote = nil
		}
	}
}
