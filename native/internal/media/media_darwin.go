//go:build darwin && cgo

package media

/*
#cgo CFLAGS: -x objective-c -fobjc-arc
#cgo LDFLAGS: -framework MediaPlayer -framework Foundation
#include <stdlib.h>
#include <stdint.h>
void *hm_media_init(uintptr_t handle);
void hm_media_update(const char *title,const char *artist,double duration,double position,int playing);
void hm_media_close(void *owner);
*/
import "C"

import (
	"runtime/cgo"
	"unsafe"
)

type Event struct {
	Command  int
	Position float64
}
type Controller struct {
	native unsafe.Pointer
	handle cgo.Handle
}

// New and Close run on the application event thread. The callback only queues
// commands; it never touches UI state from the system media callback.
func New(callback func(Event)) *Controller {
	h := cgo.NewHandle(callback)
	return &Controller{native: C.hm_media_init(C.uintptr_t(h)), handle: h}
}

//export hm_media_command
func hm_media_command(handle C.uintptr_t, command C.int, position C.double) {
	cgo.Handle(handle).Value().(func(Event))(Event{int(command), float64(position)})
}
func (c *Controller) Update(title, artist string, duration, position float64, playing bool) {
	if c == nil || c.native == nil {
		return
	}
	t, a := C.CString(title), C.CString(artist)
	defer C.free(unsafe.Pointer(t))
	defer C.free(unsafe.Pointer(a))
	flag := 0
	if playing {
		flag = 1
	}
	C.hm_media_update(t, a, C.double(duration), C.double(position), C.int(flag))
}
func (c *Controller) Close() {
	if c == nil || c.native == nil {
		return
	}
	C.hm_media_close(c.native)
	c.native = nil
	c.handle.Delete()
}

func (c *Controller) Preferences(float64, bool, string) {}
