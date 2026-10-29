//go:build (!darwin && !linux && !windows) || !cgo

package audio

import (
	"context"
	"errors"
)

func OpenRemote(context.Context, string) (*Player, error) {
	return nil, errors.New("native streaming audio unavailable on this platform")
}

type Player struct{}
type State struct {
	Position, Duration            float64
	Ready, Failed, Ended, Playing bool
}

func OpenLocalFixture(string) (*Player, error) {
	return nil, errors.New("native audio is not implemented on this platform")
}
func (*Player) Play()                   {}
func (*Player) Pause()                  {}
func (*Player) Seek(float64) error      { return errors.New("native audio unavailable") }
func (*Player) SetVolume(float64) error { return errors.New("native audio unavailable") }
func (*Player) Snapshot() State         { return State{Failed: true} }
func (*Player) Close()                  {}
