//go:build (linux || windows || portableaudio) && cgo

package audio

import (
	"testing"
	"time"
)

type blockedDecoder struct{ entered, resume chan struct{} }

func (*blockedDecoder) Stream([][2]float64) (int, bool) { return 0, false }
func (*blockedDecoder) Err() error                      { return nil }
func (*blockedDecoder) Len() int                        { return 1000 }
func (*blockedDecoder) Position() int                   { return 0 }
func (*blockedDecoder) Close() error                    { return nil }
func (d *blockedDecoder) Seek(int) error                { close(d.entered); <-d.resume; return nil }

func TestPauseDuringSeekRemainsPaused(t *testing.T) {
	d := &blockedDecoder{make(chan struct{}), make(chan struct{})}
	p := &Player{decoder: d, rate: 100, state: State{Ready: true, Duration: 10}, stop: make(chan struct{}), done: make(chan struct{}), seeks: make(chan seekRequest, 1)}
	go p.decode()
	defer func() { close(p.stop); <-p.done }()
	p.Play()
	if err := p.Seek(2); err != nil {
		t.Fatal(err)
	}
	<-d.entered
	p.Pause()
	close(d.resume)
	deadline := time.Now().Add(time.Second)
	for p.Snapshot().Position != 2 && time.Now().Before(deadline) {
		time.Sleep(time.Millisecond)
	}
	if s := p.Snapshot(); s.Position != 2 || s.Playing {
		t.Fatalf("pause lost during seek: %+v", s)
	}
}
