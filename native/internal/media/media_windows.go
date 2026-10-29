//go:build windows

package media

import (
	winrt "github.com/dece2183/media-winrt-go"
	"github.com/dece2183/media-winrt-go/windows/foundation"
	wm "github.com/dece2183/media-winrt-go/windows/media"
	"github.com/dece2183/media-winrt-go/windows/media/playback"
	ole "github.com/go-ole/go-ole"
	"runtime"
	"sync"
	"syscall"
	"unsafe"
)

type Event struct {
	Command  int
	Position float64
}
type mediaState struct {
	title, artist      string
	duration, position float64
	playing            bool
}
type Controller struct {
	updates    chan mediaState
	stop, done chan struct{}
	once       sync.Once
}

// The MTA owns WinRT objects. MediaPlayer supplies SMTC identity only;
// miniaudio remains the sole audio output, with automatic transport disabled.
func New(callback func(Event)) *Controller {
	c := &Controller{updates: make(chan mediaState, 1), stop: make(chan struct{}), done: make(chan struct{})}
	ready := make(chan bool, 1)
	go func() {
		runtime.LockOSThread()
		defer runtime.UnlockOSThread()
		defer close(c.done)
		hr, _, _ := syscall.NewLazyDLL("combase.dll").NewProc("RoInitialize").Call(1)
		if int32(hr) < 0 {
			ready <- false
			return
		}
		defer syscall.NewLazyDLL("combase.dll").NewProc("RoUninitialize").Call()
		owner, err := playback.NewMediaPlayer()
		if err != nil {
			ready <- false
			return
		}
		defer owner.Release()
		defer owner.Close()
		manager, err := owner.GetCommandManager()
		if err != nil {
			ready <- false
			return
		}
		defer manager.Release()
		if manager.SetIsEnabled(false) != nil {
			ready <- false
			return
		}
		controls, err := owner.GetSystemMediaTransportControls()
		if err != nil {
			ready <- false
			return
		}
		defer controls.Release()
		for _, enable := range []func(bool) error{controls.SetIsEnabled, controls.SetIsPlayEnabled, controls.SetIsPauseEnabled, controls.SetIsNextEnabled, controls.SetIsPreviousEnabled} {
			if enable(true) != nil {
				ready <- false
				return
			}
		}
		defer controls.SetIsEnabled(false)
		updater, err := controls.GetDisplayUpdater()
		if err != nil {
			ready <- false
			return
		}
		defer updater.Release()
		timeline, err := wm.NewSystemMediaTransportControlsTimelineProperties()
		if err != nil {
			ready <- false
			return
		}
		defer timeline.Release()
		handler := foundation.NewTypedEventHandler(ole.NewGUID(winrt.ParameterizedInstanceGUID(foundation.GUIDTypedEventHandler, wm.SignatureSystemMediaTransportControls, wm.SignatureSystemMediaTransportControlsButtonPressedEventArgs)), func(_ *foundation.TypedEventHandler, _ unsafe.Pointer, args unsafe.Pointer) {
			button, err := (*wm.SystemMediaTransportControlsButtonPressedEventArgs)(args).GetButton()
			if err != nil {
				return
			}
			commands := map[wm.SystemMediaTransportControlsButton]int{wm.SystemMediaTransportControlsButtonPlay: 1, wm.SystemMediaTransportControlsButtonPause: 2, wm.SystemMediaTransportControlsButtonPrevious: 3, wm.SystemMediaTransportControlsButtonNext: 4, wm.SystemMediaTransportControlsButtonStop: 2}
			if command, ok := commands[button]; ok {
				callback(Event{Command: command})
			}
		})
		defer handler.Release()
		token, err := controls.AddButtonPressed(handler)
		if err != nil {
			ready <- false
			return
		}
		defer controls.RemoveButtonPressed(token)
		seekHandler := foundation.NewTypedEventHandler(ole.NewGUID(winrt.ParameterizedInstanceGUID(foundation.GUIDTypedEventHandler, wm.SignatureSystemMediaTransportControls, wm.SignaturePlaybackPositionChangeRequestedEventArgs)), func(_ *foundation.TypedEventHandler, _ unsafe.Pointer, args unsafe.Pointer) {
			position, err := (*wm.PlaybackPositionChangeRequestedEventArgs)(args).GetRequestedPlaybackPosition()
			if err == nil {
				callback(Event{5, float64(position.Duration) / 1e7})
			}
		})
		defer seekHandler.Release()
		seekToken, err := controls.AddPlaybackPositionChangeRequested(seekHandler)
		if err != nil {
			ready <- false
			return
		}
		defer controls.RemovePlaybackPositionChangeRequested(seekToken)
		ready <- true
		var last mediaState
		first := true
		for {
			select {
			case <-c.stop:
				return
			case s := <-c.updates:
				status := wm.MediaPlaybackStatusPaused
				if s.title == "" {
					status = wm.MediaPlaybackStatusStopped
				} else if s.playing {
					status = wm.MediaPlaybackStatusPlaying
				}
				if first || s.playing != last.playing || s.title != last.title {
					_ = controls.SetPlaybackStatus(status)
				}
				if first || s.title != last.title || s.artist != last.artist {
					_ = setDisplay(updater, s.title, s.artist)
				}
				span := func(seconds float64) foundation.TimeSpan {
					return foundation.TimeSpan{Duration: int64(max(0, seconds) * 1e7)}
				}
				_ = timeline.SetStartTime(span(0))
				_ = timeline.SetMinSeekTime(span(0))
				_ = timeline.SetEndTime(span(s.duration))
				_ = timeline.SetMaxSeekTime(span(s.duration))
				_ = timeline.SetPosition(span(s.position))
				_ = controls.UpdateTimelineProperties(timeline)
				last = s
				first = false
			}
		}
	}()
	if !<-ready {
		<-c.done
		return nil
	}
	return c
}
func (c *Controller) Update(title, artist string, duration, position float64, playing bool) {
	if c == nil {
		return
	}
	s := mediaState{title, artist, duration, position, playing}
	select {
	case <-c.done:
		return
	default:
	}
	select {
	case c.updates <- s:
	default:
		select {
		case <-c.updates:
		default:
		}
		select {
		case c.updates <- s:
		default:
		}
	}
}
func (c *Controller) Close() {
	if c != nil {
		c.once.Do(func() { close(c.stop); <-c.done })
	}
}

// These string setters are omitted by the projection. Slots follow the public
// ISystemMediaTransportControlsDisplayUpdater/IMusicDisplayProperties ABI.
func winCall(object *ole.IUnknown, slot int, args ...uintptr) error {
	table := (*[32]uintptr)(unsafe.Pointer(object.RawVTable))
	values := append([]uintptr{uintptr(unsafe.Pointer(object))}, args...)
	hr, _, _ := syscall.SyscallN(table[slot], values...)
	runtime.KeepAlive(object)
	if int32(hr) < 0 {
		return ole.NewError(hr)
	}
	return nil
}
func setDisplay(updater *wm.SystemMediaTransportControlsDisplayUpdater, title, artist string) error {
	object, err := updater.QueryInterface(ole.NewGUID("8abbc53e-fa55-4ecf-ad8e-c984e5dd1550"))
	if err != nil {
		return err
	}
	defer object.Release()
	if err = winCall(&object.IUnknown, 7, 1); err != nil {
		return err
	}
	var music *ole.IUnknown
	if err = winCall(&object.IUnknown, 12, uintptr(unsafe.Pointer(&music))); err != nil {
		return err
	}
	defer music.Release()
	for _, field := range []struct {
		slot int
		text string
	}{{7, title}, {11, artist}} {
		value, e := ole.NewHString(field.text)
		if e != nil {
			return e
		}
		e = winCall(music, field.slot, uintptr(value))
		_ = ole.DeleteHString(value)
		if e != nil {
			return e
		}
	}
	return updater.Update()
}

func (c *Controller) Preferences(float64, bool, string) {}
