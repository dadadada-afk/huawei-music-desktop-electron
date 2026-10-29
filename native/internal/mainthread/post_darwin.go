//go:build darwin && cgo

package mainthread

/*
#cgo LDFLAGS: -framework Foundation
#include <stdint.h>
void hm_post_main(uintptr_t handle);
*/
import "C"
import "runtime/cgo"

func Post(fn func()) { C.hm_post_main(C.uintptr_t(cgo.NewHandle(fn))) }

//export hm_run_main
func hm_run_main(raw C.uintptr_t) {
	h := cgo.Handle(raw)
	fn := h.Value().(func())
	h.Delete()
	fn()
}
